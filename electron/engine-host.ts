/**
 * Engine host — runs in an Electron `utilityProcess` (a real Node process).
 *
 * Phase 0: a heartbeat + echo, to prove the three-process handshake
 * (renderer ⇄ main ⇄ utility) and the MessagePort plumbing.
 *
 * Phase 1: this becomes the real harness host — it will run the extracted
 * `src/engine.ts` (boot/scope/restart/command-loop), subscribe to the
 * harness `uiChannel: EventBus<WorkflowEvent>` and post each event over
 * `parentPort`, and feed inbound `Command` messages into `commands.send`.
 */

// In a utilityProcess child, Electron exposes `process.parentPort`
// (a MessagePortMain). @types/node doesn't know it, so narrow it here.
const parentPort = (process as unknown as {
  parentPort: {
    postMessage(msg: unknown): void
    on(event: 'message', cb: (e: { data: unknown }) => void): void
    start?: () => void
  }
}).parentPort

type Inbound = { t: 'command'; payload: { text?: string } }
type Outbound =
  | { t: 'ready' }
  | { t: 'event'; payload: unknown }

function post(msg: Outbound): void {
  parentPort.postMessage(msg)
}

let seq = 0
const heartbeat = setInterval(() => {
  post({ t: 'event', payload: { type: 'ping', seq: seq++, at: Date.now() } })
}, 1000)

parentPort.on('message', (e) => {
  const msg = e.data as Inbound
  if (msg?.t === 'command') {
    // Echo the command back as a "pong" event.
    post({ t: 'event', payload: { type: 'pong', text: msg.payload?.text ?? '', seq } })
  }
})

process.on('exit', () => clearInterval(heartbeat))

post({ t: 'ready' })
