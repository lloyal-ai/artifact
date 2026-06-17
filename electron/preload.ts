import { contextBridge, ipcRenderer } from 'electron'

/**
 * The renderer ⇄ engine bridge, exposed as `window.reasoning`.
 *
 * Phase 0: a generic message relay (renderer ⇄ main ⇄ utility). In Phase 1
 * this becomes the typed EventBus<WorkflowEvent> + dispatch(Command) surface;
 * the channel names stay the same so the renderer doesn't change.
 */
const api = {
  /** Subscribe to engine→renderer messages. Returns an unsubscribe fn. */
  onMessage(cb: (msg: unknown) => void): () => void {
    const listener = (_e: Electron.IpcRendererEvent, msg: unknown) => cb(msg)
    ipcRenderer.on('engine:message', listener)
    return () => ipcRenderer.removeListener('engine:message', listener)
  },
  /** Send a command/message renderer→engine. */
  send(payload: unknown): void {
    ipcRenderer.send('engine:command', payload)
  },
  /** Ask main for the current snapshot (Phase 1: the mirrored AppState). */
  requestSnapshot(): Promise<unknown> {
    return ipcRenderer.invoke('engine:snapshot')
  },
}

contextBridge.exposeInMainWorld('reasoning', api)

export type ReasoningBridge = typeof api
