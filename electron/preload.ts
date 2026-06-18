import { contextBridge, ipcRenderer } from 'electron'

/**
 * The renderer ⇄ engine bridge, exposed as `window.reasoning`.
 *
 * The renderer runs the same `reduce` the Ink TUI does, so this surface ships
 * RAW events (not reduced state): `onEvent` delivers each `{seq, ev}` frame,
 * `requestSnapshot` returns `{state, seq}` for the consistent-cut seed on
 * (re)load, and `send` dispatches a Command. See `src/renderer/bridge.ts`.
 */
const api = {
  /** Host OS — drives platform-aware window-chrome insets in the header
   *  (native traffic-lights top-left on 'darwin'; controls-overlay top-right on
   *  'win32'/'linux'). Resolved once at preload time; never changes at runtime. */
  platform: process.platform,
  /** Subscribe to raw `{seq, ev}` event frames forwarded by main. Returns unsubscribe. */
  onEvent(cb: (frame: unknown) => void): () => void {
    const listener = (_e: Electron.IpcRendererEvent, frame: unknown) => cb(frame)
    ipcRenderer.on('engine:event', listener)
    return () => ipcRenderer.removeListener('engine:event', listener)
  },
  /** Dispatch a Command renderer→engine. */
  send(command: unknown): void {
    ipcRenderer.send('engine:command', command)
  },
  /** Ask main for the seed cut: `{ state, seq }` (on (re)load). */
  requestSnapshot(): Promise<unknown> {
    return ipcRenderer.invoke('engine:snapshot')
  },
  /** Open an http(s) link in the system browser (answer markdown / source chips). */
  openExternal(url: string): void {
    void ipcRenderer.invoke('engine:open-external', url)
  },
  /** Native folder picker for path-like app-config fields (corpus folder, …).
   *  Resolves to the chosen absolute path, or null if the user cancelled. */
  chooseDirectory(): Promise<string | null> {
    return ipcRenderer.invoke('engine:choose-directory') as Promise<string | null>
  },
  /** Reveal a local file/folder in Finder/Explorer (filesystem source rows,
   *  "Open run folder"). The path must be absolute. */
  revealItem(path: string): void {
    void ipcRenderer.invoke('engine:reveal-item', path)
  },
  /** Export a print-styled HTML document to a PDF via a Save dialog. Resolves
   *  to the saved absolute path, or null if the user cancelled. */
  exportPdf(opts: { defaultName: string; html: string }): Promise<string | null> {
    return ipcRenderer.invoke('engine:export-pdf', opts) as Promise<string | null>
  },
  /** Begin tailing the newest session trace-*.jsonl. Resolves to the current
   *  (tail-capped) content + the file path; new lines stream via onTraceAppend. */
  startTrace(): Promise<{ file: string | null; text: string }> {
    return ipcRenderer.invoke('engine:trace:start') as Promise<{ file: string | null; text: string }>
  },
  /** Subscribe to appended trace text. Returns unsubscribe. */
  onTraceAppend(cb: (text: string) => void): () => void {
    const listener = (_e: Electron.IpcRendererEvent, text: string): void => cb(text)
    ipcRenderer.on('engine:trace:append', listener)
    return () => ipcRenderer.removeListener('engine:trace:append', listener)
  },
  /** Stop tailing (call when the Trace pane closes). */
  stopTrace(): void {
    ipcRenderer.send('engine:trace:stop')
  },
}

contextBridge.exposeInMainWorld('reasoning', api)

export type ReasoningBridge = typeof api
