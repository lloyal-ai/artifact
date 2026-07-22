/**
 * Web `ReasoningBridge` — the browser sibling of `electron/preload.ts`.
 *
 * The renderer is transport-agnostic: it only ever talks to `window.reasoning`
 * (see `src/renderer/bridge.ts`). The Electron app backs that with IPC; the web
 * app backs it with binding's `connectWss` to the served host, plus browser
 * fallbacks / no-ops for the desktop-only affordances (fs pickers, PDF dialog,
 * trace tail). Same renderer, different `window.reasoning` — a pure transport swap.
 *
 * `installWebBridge()` MUST run before `bridge.ts` evaluates — `bridge.ts` calls
 * `window.reasoning.onEvent`/`requestSnapshot` at module load. The web entry
 * imports `./boot` (which calls this) BEFORE `../renderer/App`.
 */
import { connectWss, type WssClient } from '@lloyal-labs/binding/web'
import type { Command, WorkflowEvent } from 'reasoning.run/protocol'
import { initialState } from 'reasoning.run/state'
import type { ReasoningBridge } from '../../electron/preload'

/** Resolve the served-host wss URL: build-time `VITE_WSS_URL`, else a `?server=`
 *  query param, else same-origin (ws/wss mirroring the page protocol). */
function resolveWssUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  const configured = env?.VITE_WSS_URL ?? new URLSearchParams(window.location.search).get('server')
  if (configured) return configured
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}`
}

export function installWebBridge(): void {
  let client: WssClient<Command> | null = null
  let onFrame: ((frame: unknown) => void) | null = null
  let seq = 0

  const api: ReasoningBridge = {
    // The header only branches on `=== 'darwin'`, so anything else = no native chrome inset.
    platform: 'web' as ReasoningBridge['platform'],

    onEvent(cb) {
      onFrame = cb
      // Connect lazily on first subscription. `bridge.ts` subscribes BEFORE it calls
      // `requestSnapshot`, so no boot frame is missed — the server bus replays boot
      // events to its first subscriber (us) on connect.
      client ??= connectWss<WorkflowEvent, Command>(resolveWssUrl(), {
        // The wss wire carries no `seq`; synthesize a monotonic one so `bridge.ts`'s
        // seq-order/dedup logic is preserved unchanged.
        onEvent: (ev) => onFrame?.({ seq: seq++, ev }),
        onSession: () => {}, // MVP: the WorkflowEvent stream drives the UI; the session plane is ignored
        onReady: () => {},
        onClose: () => {},
      })
      return () => {
        onFrame = null
      }
    },

    send(command) {
      client?.send(command as Command)
    },

    // wss is stateless — a fresh connection is a fresh Session, so there is no server
    // snapshot to seed. Return the empty cut (`seq -1`, so every streamed frame applies).
    // Reconnect / consistent-cut seeding is deferred plane-1 durability (temporality.md §7).
    requestSnapshot() {
      return Promise.resolve({ state: initialState, seq: -1 })
    },

    // ── desktop-only affordances → browser fallbacks / no-ops ──
    openExternal(url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    chooseDirectory() {
      return Promise.resolve(null) // no filesystem in the browser
    },
    revealItem() {
      /* no filesystem in the browser */
    },
    exportPdf() {
      window.print() // the browser's own print-to-PDF; there is no saved path to return
      return Promise.resolve(null)
    },
    startTrace() {
      return Promise.resolve({ file: null, text: '' }) // trace streaming = deferred
    },
    onTraceAppend() {
      return () => {}
    },
    stopTrace() {
      /* no-op */
    },
  }

  ;(window as unknown as { reasoning: ReasoningBridge }).reasoning = api
}
