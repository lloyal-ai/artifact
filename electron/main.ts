import { app, BrowserWindow, ipcMain, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'

/**
 * Electron MAIN process — a thin host: owns the window, spawns the engine in a
 * `utilityProcess`, and relays messages renderer ⇄ engine. Heavy work (native
 * inference via lloyal.node, the Effection harness) lives in the engine process
 * so the UI thread never blocks.
 *
 * Phase 0: relays a generic message envelope. Phase 1 adds the AppState mirror
 * (running the same pure `reduce` over the event stream) for snapshot-on-load.
 */

let win: BrowserWindow | null = null
let engine: UtilityProcess | null = null

function spawnEngine(): void {
  // electron-vite emits both main inputs into out/main/, so the engine host is
  // a sibling of this file at runtime.
  const enginePath = join(__dirname, 'engine-host.js')
  engine = utilityProcess.fork(enginePath, [], {
    serviceName: 'reasoning-engine',
    stdio: 'pipe',
  })
  engine.stdout?.on('data', (d) => console.log('[engine]', d.toString().trimEnd()))
  engine.stderr?.on('data', (d) => console.error('[engine]', d.toString().trimEnd()))
  engine.on('message', (msg) => {
    if (process.env.RR_DEBUG) console.log('[main<-engine]', JSON.stringify(msg))
    // engine → renderer
    win?.webContents.send('engine:message', msg)
  })
  engine.on('exit', (code) => console.log('[engine] exited', code))
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 920,
    minHeight: 600,
    show: false,
    backgroundColor: '#0c0e15',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
    },
  })
  win.once('ready-to-show', () => win?.show())

  // electron-vite sets ELECTRON_RENDERER_URL in dev (the Vite dev server).
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  spawnEngine()
  createWindow()

  // renderer → engine
  ipcMain.on('engine:command', (_e, payload) => {
    engine?.postMessage({ t: 'command', payload })
  })
  // Phase 1: return the mirrored AppState snapshot here.
  ipcMain.handle('engine:snapshot', () => null)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', () => engine?.kill())
