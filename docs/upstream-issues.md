# Upstream issues — port back to `reasoning.run`

This fork (`reasoning.run.desktop`) carries its own **copy** of `src/harness.ts`,
`src/tui-ink/*`, `src/main.ts`, etc. (the engine is the fork's own esbuild
`dist/bundle.mjs` — there is **no runtime dependency** on the upstream
`reasoning.run` package). Some fixes made here address **genuine upstream bugs**
that affect the Ink CLI too. Track them here and open GitHub issues on
`reasoning.run` to port them back so the two copies don't drift on real defects.

> Status legend: ☐ issue not yet filed · ☑ filed (link the issue) · ✅ ported

---

## ☐ 1. Recovery report stream is mislabeled as "Thinking" (reducer)

**Affects:** both the Ink CLI and the desktop GUI (shared `tui-ink` reducer/state).

**Symptom:** a research agent's *forced* report renders under a `✦ Thinking…` /
`Thinking` block instead of as report/streaming output. Most research agents
hit this because they rarely call the `report` tool voluntarily.

**Root cause:** when an agent stalls without a voluntary report, the pool
force-extracts via `recoverInline`
(`@lloyal-labs/lloyal-agents` `src/agent-pool.ts`): it injects a nudge prompt
with `enableThinking: false` and sets an **eager** report grammar
(`agent.branch.setGrammar(reportGrammar)`), forcing `{"result":"…"}` with **no
`<think>`/`</think>`**, streamed as plain `agent:produce`, then `agent:recovered`.
The reducer's `agent:done` deliberately steps the agent back to `phase: 'idle'`
so the recovery stream still renders, but the `agent:produce` handler then
`openThink`s on the first recovery token (idle → thinking) and — finding no
`</think>` — funnels the entire forced-report JSON into a think block. The old
`__reducer-smoke.ts` assertion *baked this in* (`recovery output` → a new think
item).

**Why the CLI doesn't *look* broken:** the Ink renderer masks it — `ThinkItem`
shows only `stripFirstLineIfTitle(body)` (first line becomes a title), and a
recovery report is a single physical line (newlines escaped as `\n`), so the
body collapses to empty; live `Column`s are also height-clipped. It's a
coincidence of serialization + clipping, not a fix — the underlying *state* is
still wrong (recovery output classified as thinking).

**Fix (applied in the fork — port upstream):**
- `src/tui-ink/state.ts` — add `recovering: boolean` to `AgentRuntime`.
- `src/tui-ink/reducer.ts` — `agent:done` sets `recovering: true` (+ guards
  `phase === 'done'`); `agent:produce` routes a `recovering` stream into
  `contentBuffer` (→ rendered as "Writing report" / Ink `ContentStream`) instead
  of `openThink`; `agent:return`/`agent:recovered` clear `recovering: false`.
- `src/tui-ink/__reducer-smoke.ts` — flipped the recovery assertion (recovery
  output → `contentBuffer`, not a think item) + added an `agent:recovered`
  freeze test.

Fork commit: see `feat/electron-gui` ("recovery report → contentBuffer …").

---

## ☐ 2. Report renders as raw escaped JSON, not decoded markdown (renderer)

**Affects:** primarily the desktop GUI. The Ink CLI sidesteps it via the
first-line-strip + column clipping described above (so it's lower priority
upstream, but the explicit parse is still the principled approach).

**Symptom:** the streamed report shows literal escape sequences
(`…(2026)\n\n### EXECUTIVE SUMMARY…`) because the displayed text is the raw JSON
string, not the decoded `result`.

**Fix (applied in the fork — GUI renderer only):**
- `src/renderer/components/Work.tsx` — `extractReportBody` (done state) does
  `JSON.parse` + unwraps `.result`; `extractStreamingReport` incrementally
  decodes the partial `"result":"…"` value (handles `\n \t \r \b \f \" \\ \/
  \uXXXX`, stops at an incomplete tail escape) so the live "Writing report"
  stream renders as clean markdown.

The Ink CLI equivalent (if ported) would be to give `ContentStream` /
`ReportItem` the same `result`-extraction rather than relying on
`stripFirstLineIfTitle`'s accidental masking.

---

## Notes

- The fork's `tui-ink` was kept byte-identical to upstream purely as a sync
  convenience; issue #1 is the first deliberate divergence. Re-sync upstream
  after the port to collapse it.
- Neither fix touches the FSL packages (`@lloyal-labs/*`) or the frozen prompts.
