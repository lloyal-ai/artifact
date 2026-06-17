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
}

contextBridge.exposeInMainWorld('reasoning', api)

export type ReasoningBridge = typeof api
