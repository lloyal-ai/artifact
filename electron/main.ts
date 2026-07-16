import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell, utilityProcess, type UtilityProcess } from 'electron'
import { join, dirname } from 'node:path'
import { totalmem } from 'node:os'
import { writeFileSync, readdirSync, statSync, openSync, readSync, closeSync, fstatSync, existsSync } from 'node:fs'
import { reduce, initialState, type AppState } from 'reasoning.run/state'
import type { WorkflowEvent, Command } from 'reasoning.run/protocol'

/**
 * Electron MAIN process — a thin host: owns the window, spawns the harness in a
 * `utilityProcess`, and bridges renderer ⇄ engine. Heavy work (native inference
 * via lloyal.node, the Effection harness) lives in the engine process so the UI
 * thread never blocks.
 *
 * The engine is reasoning.run's prebuilt bundle, forked via its `bin/run.js` in
 * RR_BRIDGE mode: it streams WorkflowEvents over its parentPort and accepts
 * Commands. (Artifact = reasoning.run under a UI — the harness is imported, not
 * forked from a local copy.)
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
// Run output dir (where the engine writes report.md/annexure + the session
// trace-*.jsonl). Set in spawnEngine; read by the live-trace tailer.
let outputDir = ''
// Live-trace tailer: poll the newest trace-*.jsonl and stream appends to the
// renderer's Trace pane. Null when no Trace pane is open.
let traceWatch: { file: string; offset: number; timer: ReturnType<typeof setInterval> } | null = null

/** Send to the renderer only if the window is still alive. `win?.` is not
 *  enough — on close `win` is non-null but DESTROYED, and `.send` throws
 *  "Object has been destroyed" (then re-throws on every subsequent engine
 *  message, spamming the crash dialog). */
function safeSend(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

/** Newest `trace-*.jsonl` filename in the output dir, or null. */
function newestTraceFile(): string | null {
  if (!outputDir) return null
  try {
    const files = readdirSync(outputDir).filter((f) => /^trace-.*\.jsonl$/.test(f))
    if (files.length === 0) return null
    return files
      .map((f) => ({ f, t: statSync(join(outputDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)[0].f
  } catch {
    return null
  }
}

/** Read bytes appended to `file` since `offset` (best-effort). */
function readFrom(file: string, offset: number): { text: string; offset: number } {
  let fd: number | null = null
  try {
    fd = openSync(file, 'r')
    const size = fstatSync(fd).size
    if (size <= offset) return { text: '', offset }
    const buf = Buffer.allocUnsafe(size - offset)
    readSync(fd, buf, 0, size - offset, offset)
    return { text: buf.toString('utf8'), offset: size }
  } catch {
    return { text: '', offset }
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/** Poll tick: stream new trace bytes; switch to a newer trace file if one rotates in. */
function pollTrace(): void {
  if (!traceWatch) return
  const newest = newestTraceFile()
  if (newest && newest !== traceWatch.file) {
    traceWatch.file = newest
    traceWatch.offset = 0
  }
  if (!traceWatch.file) return
  const { text, offset } = readFrom(join(outputDir, traceWatch.file), traceWatch.offset)
  if (text) {
    traceWatch.offset = offset
    safeSend('engine:trace:append', text)
  }
}

function spawnEngine(): void {
  // Fork reasoning.run's prebuilt engine — its `bin/run.js` calls `runMain()`.
  // reasoning.run's `exports` map encapsulates BOTH `package.json` and `bin/`, so
  // neither is resolvable directly. Resolve the `.` export instead (→ `<pkg>/src/
  // main.ts`); the engine is its sibling `../bin/run.js`. Forking the bundle
  // directly would never start — `runMain` is only exported there, not called on
  // import. (Clean fix belongs in reasoning.run: export `./package.json` or a
  // dedicated bridge bin — see #551.)
  const enginePath = join(dirname(require.resolve('reasoning.run')), '..', 'bin', 'run.js')
  const configPath = join(app.getPath('userData'), 'harness.json')
  outputDir = join(app.getPath('documents'), 'Artifact')

  // RR_BRIDGE → harness streams over parentPort instead of mounting Ink.
  // GPU: macOS auto-selects the Metal binary (default darwin-arm64). On other
  // platforms the engine reads model.gpu from harness.json (or LLOYAL_GPU).
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
      safeSend('engine:event', { seq, ev: msg.payload })
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
    backgroundColor: '#080B14',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    // Native window-controls overlay on win/linux (no-op on mac, which uses the
    // traffic-lights). Tinted to the header so the buttons sit on-aesthetic.
    titleBarOverlay: isMac
      ? undefined
      : { color: '#03050A', symbolColor: '#aeb5c5', height: 36 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  })
  win.once('ready-to-show', () => win?.show())

  // On close, drop the reference (so `safeSend` short-circuits) and stop the
  // trace tailer — otherwise in-flight engine messages / poll ticks fire on a
  // destroyed window.
  win.on('closed', () => {
    win = null
    if (traceWatch) {
      clearInterval(traceWatch.timer)
      traceWatch = null
    }
  })

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
  // Dev-time dock icon: packaged builds get the icon from the signed `.app`
  // bundle (electron-builder `mac.icon`), but `npm run dev` shows Electron's
  // default. Set the Artifact mark from build/icon.png when present (dev only —
  // the file isn't bundled into the packaged app).
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = join(__dirname, '../../build/icon.png')
    if (existsSync(iconPath)) app.dock.setIcon(nativeImage.createFromPath(iconPath))
  }

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

  // Native folder picker for path-like app-config fields (e.g. the corpus
  // folder). Returns the chosen absolute path, or null if cancelled.
  ipcMain.handle('engine:choose-directory', async (): Promise<string | null> => {
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0]
  })

  // Reveal a local file/folder in Finder/Explorer (source-ledger rows for
  // corpus-style filesystem sources, and "Open run folder"). The renderer
  // passes an absolute path it derived from `state.config.sources.outputDir`
  // or a tool_result host that looks like a path — main just reveals it.
  ipcMain.handle('engine:reveal-item', (_e, path: unknown): void => {
    if (typeof path === 'string' && path) shell.showItemInFolder(path)
  })

  // Export the report preview to a PDF. The renderer hands over a complete,
  // print-styled HTML document (the rendered report + a light print theme); we
  // render it in an offscreen window, run the native Save dialog, and write the
  // PDF via Chromium's printToPDF. Returns the saved path, or null if cancelled.
  ipcMain.handle(
    'engine:export-pdf',
    async (_e, arg: unknown): Promise<string | null> => {
      if (!win || typeof arg !== 'object' || arg === null) return null
      const { defaultName, html } = arg as { defaultName?: unknown; html?: unknown }
      if (typeof html !== 'string') return null
      const res = await dialog.showSaveDialog(win, {
        title: 'Export PDF',
        defaultPath: typeof defaultName === 'string' ? defaultName : 'report.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (res.canceled || !res.filePath) return null
      const off = new BrowserWindow({
        show: false,
        webPreferences: { offscreen: true, sandbox: true },
      })
      try {
        await off.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
        const pdf = await off.webContents.printToPDF({
          printBackground: true,
          margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
        })
        writeFileSync(res.filePath, pdf)
        return res.filePath
      } finally {
        off.destroy()
      }
    },
  )

  // Live Trace pane: tail the newest trace-*.jsonl. `start` returns the
  // current (tail-capped) content + the file path; appended lines stream via
  // 'engine:trace:append'. `stop` clears the poll when the pane closes.
  ipcMain.handle('engine:trace:start', (): { file: string | null; text: string } => {
    const f = newestTraceFile()
    let text = ''
    let offset = 0
    if (f) {
      const r = readFrom(join(outputDir, f), 0)
      text = r.text.split('\n').slice(-2000).join('\n') // cap backfill
      offset = r.offset
    }
    if (traceWatch) clearInterval(traceWatch.timer)
    traceWatch = { file: f ?? '', offset, timer: setInterval(pollTrace, 250) }
    return { file: f ? join(outputDir, f) : null, text }
  })
  ipcMain.on('engine:trace:stop', () => {
    if (traceWatch) clearInterval(traceWatch.timer)
    traceWatch = null
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', () => engine?.kill())
