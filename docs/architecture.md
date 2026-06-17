# reasoning.run desktop — architecture

`reasoning.run.desktop` is the **Electron desktop GUI** for the local reasoning engine that ships on the CLI
as `npx reasoning.run`. The CLI stays untouched upstream; this fork swaps the **Ink TUI renderer** for a
**React-DOM renderer** while running the *same harness* (recon → clarify → editable plan → research in
several orchestration shapes → synth → on-device artifacts) over the native **N-API `lloyal.node`** addon
(liblloyal / llama.cpp).

The product UI is a **centred-spine timeline**: the whole run *is* a scrollable timeline and the spine down
it *is* the continuous-context thread (Parallel = panes branch alternately off one fork; Deep = chained down
the spine; Graph = branch+merge). Canonical static design reference: `design/research-timeline.html`.

---

## Process model — three processes, one event/command contract

```
┌─ RENDERER (Vite · React-DOM · no node) ─┐   ┌─ MAIN (thin) ─┐   ┌─ UTILITY (engine · Node) ─┐
│ timeline UI                              │   │ window + tray │   │ harness + lloyal.node      │
│ EventBus<WorkflowEvent> over preload     │◀──┤ relays msgs   ├──▶│ Effection scope · apps     │
│ dispatch(Command) over preload           │──▶│ AppState mirror│◀──┤ reranker · run-dir         │
│ App: useEventStream(bus) + CommandCtx    │   │ (pure reduce) │   │ uiChannel ↔ parentPort     │
└───────────────────────────────────────────┘   └───────────────┘   └────────────────────────────┘
```

- **Utility process = the engine** (`electron/engine-host.ts` → `src/engine.ts`). Runs the existing harness
  unchanged: `createContext` (`@lloyal-labs/lloyal.node`) → `createReranker` (`@lloyal-labs/rig/node`) →
  `initAgents` (`@lloyal-labs/lloyal-agents`) → `createAppRegistry` + enable the apps → the restart loop and
  command loop dispatching `runQuery` / `runResearchPlan` / `saveConfig`. The **only** engine change vs. the
  CLI is swapping Ink's `render(...)` mount for a **parentPort bridge**: subscribe to the harness
  `uiChannel: EventBus<WorkflowEvent>` and post each event over the utilityProcess MessagePort; feed inbound
  `Command` messages into `commands.send(cmd)`. Heavy native inference lives here so the UI never blocks.
- **Main process** (`electron/main.ts`) = thin host: window lifecycle + native services (menu-bar/tray,
  global hotkey, drag-folder, dialogs, open-run-dir) + an **AppState mirror** (runs the same pure
  `reduce(state, event)` over the event stream) so it can ship a **snapshot on renderer (re)load**, then
  forward live events. Spawns the engine via `utilityProcess.fork()`.
- **Renderer** (`src/renderer/`) = `contextIsolation: true`, no node integration. A **preload**
  (`electron/preload.ts`) exposes a typed `window.reasoning` bridge. The renderer adapter implements the same
  `EventBus<WorkflowEvent>` interface over that bridge, so `App` mounts exactly as in the TUI:
  `useEventStream(bus, snapshot)` + `<CommandContext.Provider value={dispatch}>`.

**Contracts preserved verbatim (the "EventChannel and other abstractions"):** `EventBus<T>`
(`event-bus.ts` — `send`/`subscribe`, replay-to-first-subscriber), `WorkflowEvent = AgentEvent | StepEvent`
(`events.ts`), the `Command` union (`commands.ts`), and the pure `reduce` + `AppState`/`UiPhase`
(`state.ts`, `reducer.ts`). The harness's `Events` Effection context feeds `uiChannel` exactly as it did Ink.

---

## Reuse vs. rebuild

- **Renderer-agnostic core (reused verbatim):** `state.ts`, `events.ts`, `reducer.ts`, `commands.ts`,
  `event-bus.ts`, `config.ts`, `colors.ts`, `spinner-frames.ts`, `path-utils.ts` — hoisted to `src/core/`.
- **Rebuilt in React-DOM:** the Ink `.tsx` components + `useTerminalSize` + `render.ts`. The Ink renderer is
  retired once GUI parity lands.

---

## Native packaging & hardware (decided)

- **N-API → ABI-stable**, no `electron-rebuild`. Electron 42 (Node ≥ 22) satisfies `engines.node >= 22`.
- **Dynamic binary selection:** `lloyal.node` ships 13 prebuilt variant packages (`darwin-{arm64,x64}`,
  `linux/win` × `{cpu,cuda,vulkan}`) as `optionalDependencies`; the loader `require()`s
  `@lloyal-labs/lloyal.node-${platform}-${arch}[-${gpu}]` at runtime. npm only installs the os/cpu-matching
  family per machine — so a packaged app does **not** get cross-platform selection "for free".
- **Distribution:** prebuild **one artifact per target** and offer **separate download links**
  (`mac-arm64.dmg`, `mac-x64.dmg`, `win-x64.exe`, `linux-x64…`). v1 = `mac-arm64`. GPU-variant selection
  (cpu/cuda/vulkan) is preserved *within* each platform artifact.
- **`asarUnpack`** the whole `@lloyal-labs/lloyal.node*` packages: the `.node` **and** sibling
  `libllama*/libggml-*/libmd4c*` dylibs must be co-located in `app.asar.unpacked`.
- **GPU by default; CPU is explicit opt-in.** The engine host detects and sets `LLOYAL_GPU` *before*
  `createContext`: **macOS → Metal** (the default `darwin` binary is the Metal build); **Win/Linux → CUDA if
  an NVIDIA GPU is present, else Vulkan**. `LLOYAL_NO_FALLBACK=1` when a GPU is chosen, so a broken GPU is a
  recoverable boot error, not silent slow-CPU. CPU shows a degraded-performance warning. Config:
  `model.backend: auto|metal|cuda|vulkan|cpu` (default `auto`).
- **Hardware gate:** warn at boot if available unified memory / VRAM is **< 10 GB** (4B-Q4 LLM + reranker +
  KV need headroom). The active backend (Metal/CUDA/Vulkan/CPU) is shown as a chip in the UI.
- **Paths in a packaged app:** model cache → `userData/models`; `harness.json` → `userData`; run-dir default
  → `documents/reasoning.run` (cwd is undefined in a packaged app). Paths are injected into the engine.

---

## Build & run

- **Toolchain:** electron-vite (Vite React-DOM renderer + HMR) + electron-builder (packaging).
- `npm run dev` — electron-vite dev (HMR). `npm run app:build` — build main/preload/renderer to `out/`.
- electron-vite targets: `main` (`electron/main.ts` + `electron/engine-host.ts`), `preload`
  (`electron/preload.ts`), `renderer` (`src/renderer/`). Config: `electron.vite.config.ts`.

---

## Status

- **Phase 0 (done):** electron-vite app shell; three processes wired; renderer ⇄ main ⇄ utility handshake
  verified (engine heartbeat over the MessagePort relays to the renderer). Branch `feat/electron-gui`.
- **Next — Phase 1:** hoist core to `src/core/`; extract `src/main.ts` boot/scope/command-loop into a
  path-injected `src/engine.ts` (Ink `render` → parentPort bridge); main AppState mirror + renderer
  `EventBus`-over-IPC; prove a real `submit_query` round-trips the planner.
- **Phase 2 (gate):** native `lloyal.node` under Electron (asarUnpack + dylibs + GPU default) — de-risk
  before heavy UI. **Phase 3:** renderer parity (port the timeline mock). **Phase 4:** native superpowers
  (workspaces, inline reader, tray). **Phase 5:** package + retire Ink.

Full plan: `~/.claude/plans/mutable-waddling-bentley.md`.
