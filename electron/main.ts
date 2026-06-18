import { app, BrowserWindow, ipcMain, shell, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import { totalmem } from 'node:os'
import { writeFileSync } from 'node:fs'
import { reduce } from '../src/tui-ink/reducer'
import { initialState, type AppState } from '../src/tui-ink/state'
import type { WorkflowEvent, Command } from '../src/tui-ink/events'

/**
 * Electron MAIN process — a thin host: owns the window, spawns the harness in a
 * `utilityProcess`, and bridges renderer ⇄ engine. Heavy work (native inference
 * via lloyal.node, the Effection harness) lives in the engine process so the UI
 * thread never blocks.
 *
 * The engine is the existing esbuild bundle (`dist/bundle.mjs`) run in RR_BRIDGE
 * mode: it streams WorkflowEvents over its parentPort and accepts Commands.
 *
 * Streaming model (matches the Ink TUI verbatim): main FORWARDS each raw
 * WorkflowEvent to the renderer, which runs the same pure `reduce` itself — so
 * `agent:produce` token deltas accumulate renderer-side and only the small
 * event crosses IPC (never the growing transcript). Main also folds every event
 * into its own `appState` mirror purely to answer ONE snapshot per renderer
 * (re)load. Each forwarded event carries a monotonic `seq`; the snapshot reports
 * the `seq` it reflects, giving the renderer a consistent cut (apply seq >
 * snapshot.seq, skip the rest) — no replay gap, no double-apply.
 */

/** Only http(s) links may leave the app — drops file:/javascript:/custom schemes. */
function isExternalUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol
    return p === 'http:' || p === 'https:'
  } catch {
    return false
  }
}

let win: BrowserWindow | null = null
let engine: UtilityProcess | null = null
let appState: AppState = initialState
let seq = 0

function spawnEngine(): void {
  // out/main/index.js → <projectRoot>/dist/bundle.mjs (the esbuild engine).
  const enginePath = join(__dirname, '../../dist/bundle.mjs')
  const configPath = join(app.getPath('userData'), 'harness.json')
  const outputDir = join(app.getPath('documents'), 'reasoning.run')

  // RR_BRIDGE → harness streams over parentPort instead of mounting Ink.
  // GPU: macOS auto-selects the Metal binary (default darwin-arm64; no LLOYAL_GPU).
  const env = { ...process.env, RR_BRIDGE: '1' }
  if (app.isPackaged && !process.env.XDG_CACHE_HOME) {
    // Packaged: no writable cwd and no ~/.cache guarantee — redirect the model
    // cache under userData (models.ts cacheDir() honors XDG_CACHE_HOME). In dev
    // we leave it default so the already-warm ~/.cache model is reused; a
    // pre-set XDG_CACHE_HOME (user or gate harness) is respected.
    env.XDG_CACHE_HOME = join(app.getPath('userData'), 'cache')
  }

  // Memory gate (advisory): the 4B-Q4 LLM + reranker + KV want headroom.
  const totalGiB = totalmem() / 1024 ** 3
  if (totalGiB < 10) {
    console.warn(`[main] low memory: ${totalGiB.toFixed(1)} GB — performance may be degraded`)
  }

  engine = utilityProcess.fork(enginePath, ['--config', configPath, '--output-dir', outputDir], {
    serviceName: 'reasoning-engine',
    stdio: 'pipe',
    env,
  })
  engine.stdout?.on('data', (d) => console.log('[engine]', d.toString().trimEnd()))
  engine.stderr?.on('data', (d) => console.error('[engine]', d.toString().trimEnd()))
  engine.on('message', (msg: { t?: string; payload?: WorkflowEvent }) => {
    if (msg?.t === 'ready') {
      if (process.env.RR_DEBUG) console.log('[main] engine ready')
      return
    }
    if (msg?.t === 'event' && msg.payload) {
      const prevPhase = appState.uiPhase
      seq++
      appState = reduce(appState, msg.payload)
      // Forward the raw event (+ seq) — the renderer reduces it itself.
      win?.webContents.send('engine:event', { seq, ev: msg.payload })
      if (process.env.RR_DEBUG) console.log('[main<-engine]', msg.payload.type, '→ uiPhase:', appState.uiPhase)
      // Gated round-trip self-test: fire a submit_query the moment the engine
      // reaches the composer, to prove renderer→engine→planner→back headlessly.
      if (process.env.RR_AUTOQUERY && prevPhase !== 'composer' && appState.uiPhase === 'composer') {
        if (process.env.RR_DEBUG) console.log('[main->engine] auto submit_query:', process.env.RR_AUTOQUERY)
        engine?.postMessage({
          t: 'command',
          payload: { type: 'submit_query', query: process.env.RR_AUTOQUERY, mode: 'flat' },
        })
      }
      // Auto-accept the plan to drive a full research run (gated, for verification).
      if (
        process.env.RR_AUTOACCEPT &&
        prevPhase !== 'plan_review' &&
        appState.uiPhase === 'plan_review'
      ) {
        if (process.env.RR_DEBUG) console.log('[main->engine] auto accept_plan')
        engine?.postMessage({ t: 'command', payload: { type: 'accept_plan' } })
      }
    }
  })
  engine.on('exit', (code) => console.log('[engine] exited', code))
}

function createWindow(): void {
  // Two-tier header: tier 1 (`.titlebar`) is a 36px drag region carrying the
  // centered app name; tier 2 (`.toolbar`) is the functional row. Native window
  // controls render in tier 1 differently per platform and the titlebar insets
  // its name to clear them (see Header.tsx + preload platform):
  //  · macOS — `hiddenInset` keeps the traffic-lights top-LEFT over a frameless
  //    titlebar; `.titlebar.mac` reserves leading space (72px).
  //  · win/linux — `titleBarOverlay` renders native min/max/close top-RIGHT over
  //    the titlebar (height matched to the 36px strip); `.titlebar.win` reserves
  //    trailing space (120px).
  const isMac = process.platform === 'darwin'
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 920,
    minHeight: 600,
    show: false,
    backgroundColor: '#0c0e15',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    // Native window-controls overlay on win/linux (no-op on mac, which uses the
    // traffic-lights). Tinted to the header so the buttons sit on-aesthetic.
    titleBarOverlay: isMac
      ? undefined
      : { color: '#0c0e15', symbolColor: '#aeb5c5', height: 36 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  })
  win.once('ready-to-show', () => win?.show())

  // Links in the answer/sources are http(s) → open in the system browser, never
  // navigate the renderer away from the app. Any other scheme is dropped.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) {
      e.preventDefault()
      if (isExternalUrl(url)) void shell.openExternal(url)
    }
  })

  // Surface renderer console in the terminal during dev (proves renderer-side reduce).
  if (process.env.RR_DEBUG) {
    win.webContents.on('console-message', (details) => console.log('[renderer]', details.message))
  }

  // Gated screenshot capture for headless UI verification.
  if (process.env.RR_SHOT) {
    let n = 0
    const dir = process.env.RR_SHOT
    const timer = setInterval(() => {
      void win?.webContents
        .capturePage()
        .then((img) => {
          const buf = img.toPNG()
          const f = join(dir, `shot-${String(n++).padStart(2, '0')}.png`)
          writeFileSync(f, buf)
          console.log(`[shot] ${f} ${buf.length}b ${img.getSize().width}x${img.getSize().height}`)
        })
        .catch((e) => console.log('[shot] error', String(e)))
    }, 4000)
    win.on('closed', () => clearInterval(timer))
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  spawnEngine()
  createWindow()

  // renderer → engine (Command)
  ipcMain.on('engine:command', (_e, command: Command) => {
    engine?.postMessage({ t: 'command', payload: command })
  })
  // renderer (re)load → consistent cut: reduced state + the seq it reflects.
  ipcMain.handle('engine:snapshot', () => ({ state: appState, seq }))
  // renderer asks to open a link (answer markdown / source chip) in the browser.
  ipcMain.handle('engine:open-external', (_e, url: unknown) => {
    if (typeof url === 'string' && isExternalUrl(url)) void shell.openExternal(url)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', () => engine?.kill())
