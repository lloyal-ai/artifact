/**
 * Renderer-side bridge — the EventChannel, rebuilt over the preload boundary,
 * backed by a Zustand store.
 *
 * The Ink TUI consumes events via `useEventStream(bus)`: a `useReducer(reduce)`
 * fed one `WorkflowEvent` at a time, so streaming `agent:produce` token deltas
 * accumulate in-reducer (`item.body + ev.text`, `synth.buffer + ev.text`). We
 * preserve that EXACTLY — the renderer runs the same pure `reduce`; only the
 * small raw event crosses IPC, never the growing transcript. Effection stays
 * engine-side; the renderer is a pure sink (event → reduce → render).
 *
 * Zustand (not `useReducer`) is the container so components subscribe to a
 * SLICE — e.g. `useEngineStore(s => s.agents.get(id))` — and re-render only when
 * that slice changes. `reduce` is immutable (new Map + new object only for the
 * changed agent), so unchanged panes skip for free during a token storm.
 *
 * Cross-process seeding (replaces the bus's replay-to-first-subscriber): on
 * (re)load main hands us a consistent cut `{state, seq}` (its reduced mirror +
 * the seq it reflects). We seed from `state`, then apply every forwarded frame
 * with `seq > snapshot.seq` and skip the rest — no replay gap, no double-apply.
 * Frames that arrive before the snapshot resolves are buffered and drained.
 */

import { create } from 'zustand'
import type { Command } from 'reasoning.run/protocol'
import type { WorkflowEvent } from 'reasoning.run/protocol'
import { reduce } from 'reasoning.run/state'
import { initialState, type AppState } from 'reasoning.run/state'

interface Frame {
  seq: number
  ev: WorkflowEvent
}
interface Snapshot {
  state: AppState
  seq: number
}

interface EngineStore {
  appState: AppState
}

const useStore = create<EngineStore>(() => ({ appState: initialState }))

// ── one-time engine connection (singleton) ──────────────────────────
let connected = false
let lastSeq = -1
let seeded = false
const pending: Frame[] = []

function applyFrame(f: Frame): void {
  if (f.seq <= lastSeq) return // already in the seed / already applied
  lastSeq = f.seq
  useStore.setState((s) => ({ appState: reduce(s.appState, f.ev) }))
}

/** Wire the store to the engine. Idempotent; runs once on module load (before
 *  React mounts — frames buffer until the snapshot seed lands). */
export function connectEngine(): void {
  if (connected) return
  connected = true

  // Subscribe FIRST so no frame is lost during the snapshot round-trip.
  window.reasoning.onEvent((raw) => {
    const f = raw as Frame
    if (!seeded) {
      pending.push(f)
      return
    }
    applyFrame(f)
  })

  // Seed from the consistent cut, then drain the buffer (seq-filtered).
  void window.reasoning.requestSnapshot().then((raw) => {
    const snap = raw as Snapshot
    lastSeq = snap.seq
    seeded = true
    useStore.setState({ appState: snap.state })
    for (const f of pending.splice(0)) applyFrame(f)
  })
}

connectEngine()

/** Select a slice of the reduced AppState; re-renders only when the slice changes. */
export function useEngineStore<T>(selector: (s: AppState) => T): T {
  return useStore((s) => selector(s.appState))
}

/** Whole AppState (re-renders on any change) — convenience for coarse views. */
export function useEngineState(): AppState {
  return useStore((s) => s.appState)
}

/** Dispatch a Command to the engine (renderer → main → utility). */
export function dispatch(command: Command): void {
  window.reasoning.send(command)
}
