import React from 'react'
import type { ResearchTask } from '@lloyal-labs/rig'
import type { AgentRuntime, AppState, TimelineItem } from '../../tui-ink/state'
import { dispatch, useEngineStore } from '../bridge'
import { useUiNav } from '../ui-store'
import { agentSourceRows } from '../sources'
import { IconChevron } from '../icons'
import { AgentFooter } from './AgentFooter'
import { Markdown } from './Markdown'
import { SourceChips, WorkRows, extractReportBody } from './Work'

export const AGENT_COLORS = ['var(--a1)', 'var(--a2)', 'var(--a3)', 'var(--a4)', 'var(--a5)']
export const agentColor = (i: number): string => AGENT_COLORS[i % AGENT_COLORS.length]

// ── Plan-card per-task live status ───────────────────────────────
// pending (pre-spawn) → running (producing) → paused (the pool is in a tool
// barrier; in lockstep ALL running agents hold, so this is derived POOL-level
// so the spinner never spins while generation is actually frozen) → done.
// Agent-colored. Forward-compatible: when tool I/O fans out, `paused` splits
// into fetching/running per agent — same component, richer derivation.
type TaskStatus = 'pending' | 'running' | 'paused' | 'done' | 'failed'

/** The research agent bound to a task index — live (researchAgentIds) or its
 *  finished scrollback snapshot. Null before the task spawns. */
function agentForTask(s: AppState, taskIndex: number): AgentRuntime | null {
  for (const id of s.researchAgentIds) {
    const a = s.agents.get(id)
    if (a && a.taskIndex === taskIndex) return a
  }
  for (const it of s.scrollback) {
    if (it.kind === 'agent' && it.agent.taskIndex === taskIndex) return it.agent
  }
  return null
}

/** Pool-level: is any research agent in a tool dispatch right now? In the
 *  current lockstep tick loop the whole pool holds while one agent dispatches,
 *  so this drives `paused` for every running task — honest: no spinning glyph
 *  while generation is frozen. */
function poolDispatching(s: AppState): boolean {
  for (const id of s.researchAgentIds) {
    const a = s.agents.get(id)
    if (a && (a.phase === 'tool' || a.pendingToolCallId !== null)) return true
  }
  return false
}

/** How many research tasks have actually STARTED this run — distinct research
 *  agents (live + finished snapshots), deduped and filtered to this run.
 *  Mirrors Timeline's fan merge. Deep mode runs tasks sequentially, so a task
 *  at index >= this frontier hasn't started yet and is QUEUED — regardless of
 *  any finished agent whose `taskIndex` happens to collide with that row (which
 *  is what was rendering a tick on queued deep-mode tasks). */
function reachedTaskCount(s: AppState): number {
  const ids = new Set<number>()
  for (const id of s.researchAgentIds) if (s.agents.has(id)) ids.add(id)
  for (const it of s.scrollback) {
    if (it.kind === 'agent' && s.agents.has(it.agent.id)) ids.add(it.agent.id)
  }
  return ids.size
}

function taskStatus(
  s: AppState,
  taskIndex: number,
  dispatching: boolean,
): { status: TaskStatus; agent: AgentRuntime | null } {
  // Queued: not yet reached by the (sequential, in deep mode) research frontier.
  if (taskIndex >= reachedTaskCount(s)) return { status: 'pending', agent: null }
  const agent = agentForTask(s, taskIndex)
  if (!agent) return { status: 'pending', agent: null }
  if (agent.phase === 'done') return { status: 'done', agent }
  if (agent.phase === 'failed') return { status: 'failed', agent }
  return { status: dispatching ? 'paused' : 'running', agent }
}

/** Re-render every second while `active`, so a live elapsed timer ticks even
 *  when the agent is paused in a tool barrier (no token stream to drive it). */
function useNow(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

/** Compact elapsed: "8s", "45s", "2m 10s". Empty for a non-finite input. */
function fmtElapsed(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

const STATUS_TITLE: Record<TaskStatus, string> = {
  pending: 'Queued',
  running: 'Running',
  paused: 'Paused — the tool result is decoding into the shared context before the next token',
  done: 'Done',
  failed: 'Failed — the agent was cut off and its report could not be recovered (KV exhausted). Its findings were not included.',
}

/** Agent-colored status glyph: hollow ring (pending) · spinner (running) ·
 *  pause bars (paused) · tick (done). Color flows via `currentColor`. */
function TaskStatusGlyph({ status, color }: { status: TaskStatus; color: string }): React.ReactElement {
  // A failed task is not agent-branded — render its cross in the error hue so it
  // reads as "this one died", not "this one's color".
  const glyphColor = status === 'failed' ? '#e0686d' : color
  return (
    <span className={`tstat ${status}`} style={{ color: glyphColor }} title={STATUS_TITLE[status]}>
      {status === 'pending' && <span className="tring" />}
      {status === 'running' && <span className="tspin" />}
      {status === 'paused' && (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1.5" />
          <rect x="14" y="5" width="4" height="14" rx="1.5" />
        </svg>
      )}
      {status === 'done' && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
          <path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {status === 'failed' && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

/** A read-only plan row (during/after research): number · description · live
 *  status glyph · optional app chip. Clicking jumps to + expands the agent. */
function PlanStatusRow({
  state,
  task,
  index,
  dispatching,
}: {
  state: AppState
  task: ResearchTask
  index: number
  dispatching: boolean
}): React.ReactElement {
  const { status, agent } = taskStatus(state, index, dispatching)
  const focusAgent = useUiNav((s) => s.focusAgent)
  const clickable = agent !== null
  // Per-task elapsed: ticks live while running/paused, freezes at endedAt once done.
  // Guard against a non-finite startedAt (e.g. a snapshot-seeded agent that
  // predates the field) so the timer degrades to nothing rather than "NaN".
  const running = status === 'running' || status === 'paused'
  const now = useNow(running)
  const elapsed =
    agent && Number.isFinite(agent.startedAt) ? (agent.endedAt ?? now) - agent.startedAt : null
  return (
    <div
      className={`prow status ${clickable ? 'nav' : ''}`}
      onClick={clickable ? () => focusAgent(agent!.id) : undefined}
      title={clickable ? 'Jump to this agent' : undefined}
    >
      <span className="n">{index + 1}</span>
      <div className="ptcontent">
        <span className="ptline">{task.description}</span>
        <span className="prow-meta">
          {task.app && (
            <span className="src">
              <span className="d" style={{ background: agentColor(index) }} />
              {task.app}
            </span>
          )}
          <span className="prow-meta-r">
            {elapsed != null && <span className="task-elapsed">{fmtElapsed(elapsed)}</span>}
            <TaskStatusGlyph status={status} color={agentColor(index)} />
          </span>
        </span>
      </div>
    </div>
  )
}

/**
 * A centred milestone on the spine — the spine runs visibly through it (ghost
 * background). Reused for the research fork (and adoptable for synth/answer).
 */
export function SpineEvent({
  title,
  sub,
  kc = 'var(--accent)',
}: {
  title: string
  sub?: string
  kc?: string
}): React.ReactElement {
  return (
    <div className="card ghost spine-event" style={{ ['--kc' as string]: kc }}>
      <div className="se-body">
        <div className="se-title">{title}</div>
        {sub && <div className="se-sub">{sub}</div>}
      </div>
    </div>
  )
}

/** The Asked beat — the run title. */
export function QueryCard({ query }: { query: string }): React.ReactElement {
  return (
    <div className="card qcard">
      <div className="q">{query}</div>
    </div>
  )
}

/** The Scouted beat — recon probed every source. */
export function ScoutedCard({ state }: { state: AppState }): React.ReactElement {
  const probes = state.reconAgentIds.length
  return (
    <div className="card" style={{ ['--kc' as string]: 'var(--cyan)' }}>
      <div className="chead">
        <span className="cbadge">◎</span>
        <div className="ctitle">
          <div className="t">Probed every source in parallel</div>
          <div className="s">grounding which source covers the query before planning</div>
        </div>
        <span className="cstat">
          <span>{probes} probes</span>
          <span>{state.sourceCount} src</span>
        </span>
      </div>
    </div>
  )
}

/**
 * One editable plan-task row (only at plan_review). The description is a local
 * draft committed on blur/Enter via `update_task_description` (the edit
 * round-trips engine → reducer → state.plan, so binding the input straight to
 * state would lag a token-stream behind); reorder/delete dispatch immediately.
 * Per-task source routing (`task.app`) is read-only — there is no command to
 * change it, and inventing one would mean a contract change, not a renderer one.
 */
function PlanTaskRow({
  task,
  index,
  count,
}: {
  task: ResearchTask
  index: number
  count: number
}): React.ReactElement {
  const [draft, setDraft] = React.useState(task.description)
  // Re-sync if the stored description changes underneath us (reorder, round-trip).
  React.useEffect(() => setDraft(task.description), [task.description])

  const commit = (): void => {
    const next = draft.trim()
    if (!next) {
      setDraft(task.description) // empty isn't a valid task — revert
      return
    }
    if (next !== task.description) {
      dispatch({ type: 'update_task_description', index, description: next })
    }
  }

  return (
    <div className="prow editing">
      <span className="n">{index + 1}</span>
      <div className={`ptbubble ${task.app ? 'has-app' : ''}`}>
        <textarea
          className="ptdesc"
          value={draft}
          rows={1}
          placeholder="Describe this task…"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
          }}
        />
        {task.app && (
          <span className="src in-bubble">
            <span className="d" style={{ background: agentColor(index) }} />
            {task.app}
          </span>
        )}
      </div>
      <span className="prow-acts">
        <button
          className="ra"
          title="Move up"
          disabled={index === 0}
          onClick={() => dispatch({ type: 'move_task', from: index, to: index - 1 })}
        >
          ↑
        </button>
        <button
          className="ra"
          title="Move down"
          disabled={index === count - 1}
          onClick={() => dispatch({ type: 'move_task', from: index, to: index + 1 })}
        >
          ↓
        </button>
        <button
          className="ra del"
          title="Delete task"
          disabled={count <= 1}
          onClick={() => dispatch({ type: 'delete_task', index })}
        >
          ✕
        </button>
      </span>
    </div>
  )
}

/** The Planned beat — interactive plan-review when uiPhase === plan_review. */
export function PlanCard({ state }: { state: AppState }): React.ReactElement {
  const plan = state.plan
  if (!plan) return <></>
  const interactive = state.uiPhase === 'plan_review'
  const mode = state.mode ?? 'flat'
  // Pool-level dispatch flag (lockstep): drives every running row's `paused`
  // glyph so none spin while the pool is held in a tool barrier.
  const dispatching = poolDispatching(state)
  const sub =
    mode === 'deep'
      ? "each task's findings feed the next down the spine"
      : 'all tasks fork from the shared context at once'
  return (
    <div className="card open" style={{ ['--kc' as string]: 'var(--violet)' }}>
      <div className="chead">
        <span className="cbadge">❖</span>
        <div className="ctitle">
          <div className="t">Research plan — {plan.tasks.length} tasks</div>
          <div className="s">{sub}</div>
        </div>
        <IconChevron className="chev" />
      </div>
      <div className="plist">
        {plan.tasks.map((t, i) =>
          interactive ? (
            <PlanTaskRow key={i} task={t} index={i} count={plan.tasks.length} />
          ) : (
            <PlanStatusRow key={i} state={state} task={t} index={i} dispatching={dispatching} />
          ),
        )}
        {interactive && (
          <>
            <button
              className="addtask"
              onClick={() => dispatch({ type: 'add_task', afterIndex: plan.tasks.length - 1 })}
            >
              <span className="plus">+</span> Add a task
            </button>
            <div className="pfoot">
              <button className="btn primary" onClick={() => dispatch({ type: 'accept_plan' })}>
                Start research
              </button>
              <button className="btn" onClick={() => dispatch({ type: 'edit_plan', query: state.query })}>
                Re-plan
              </button>
              <button
                className="btn"
                onClick={() => dispatch({ type: 'change_mode', mode: mode === 'deep' ? 'flat' : 'deep' })}
              >
                {mode === 'deep' ? 'Switch to Parallel' : 'Switch to Deep'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** The Clarify beat — planner asked questions instead of producing a plan. */
export function ClarifyCard({ state }: { state: AppState }): React.ReactElement {
  const questions =
    (state.plan?.clarifyQuestions.length ? state.plan.clarifyQuestions : null) ??
    state.clarifyContext?.questions ??
    []
  return (
    <div className="card open" style={{ ['--kc' as string]: 'var(--warn)' }}>
      <div className="chead">
        <span className="cbadge">?</span>
        <div className="ctitle">
          <div className="t">A couple of questions to narrow this down</div>
          <div className="s">answer in the box below</div>
        </div>
      </div>
      <div className="plist">
        {questions.map((qn, i) => (
          <div className="prow" key={i}>
            <span className="n">{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0 }}>{qn}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function statusText(a: AgentRuntime): string {
  switch (a.phase) {
    case 'thinking':
      return 'thinking'
    case 'tool':
      return 'using tools'
    case 'content':
      return 'writing'
    case 'idle':
      return 'starting'
    default:
      return 'working'
  }
}

/** The first `report` item in an agent's timeline, or null. */
function reportItemOf(agent: AgentRuntime): Extract<TimelineItem, { kind: 'report' }> | null {
  for (const it of agent.timeline) if (it.kind === 'report') return it
  return null
}

/** A readable markdown transcript of an agent's full thread — the "copy full
 *  thread" payload in the footer overflow. */
function agentTranscript(agent: AgentRuntime): string {
  const out: string[] = []
  for (const it of agent.timeline) {
    if (it.kind === 'think') out.push(`### Thinking\n\n${it.body.trim()}`)
    else if (it.kind === 'tool_call') out.push(`**${it.tool}** ${it.argsSummary}`.trim())
    else if (it.kind === 'tool_result') {
      const meta =
        it.resultCount != null ? `${it.resultCount} results` : `${(it.byteLength / 1000).toFixed(1)} kb`
      const hosts = it.hosts.length ? ` · ${it.hosts.join(', ')}` : ''
      out.push(`> ${meta}${hosts}`)
    } else if (it.kind === 'report') out.push(`## Report\n\n${extractReportBody(it.body)}`)
  }
  return out.join('\n\n')
}

/** A research (or recon) agent card — the streaming centerpiece.
 *
 *  Live agents render open and streaming (`open` is true while `phase !== done`,
 *  driven by the caller). A `done` agent renders COLLAPSED by default: the body
 *  (think rows, tool rows, report) is heavy and the card has already landed in
 *  scrollback as a finished snapshot — its header alone (label + "Report ready"
 *  + token count) reads as a result. A click on the header toggles the body so
 *  the user can re-read the report on demand.
 *
 *  `showFooter` (research agents only — not recon probes) renders the
 *  AgentFooter as a sibling BELOW the card once the agent is done and has a
 *  report: Copy · Export · Sources (N) · …. */
export function AgentCard({
  agent,
  colorIdx,
  open,
  title,
  carry,
  showFooter,
}: {
  agent: AgentRuntime
  colorIdx: number
  open: boolean
  title?: string
  carry?: React.ReactNode
  showFooter?: boolean
}): React.ReactElement {
  const done = agent.phase === 'done'
  const failed = agent.phase === 'failed'
  const terminal = done || failed
  // Done/failed cards are collapsible (user-toggled); live cards follow the
  // caller's `open` and never collapse mid-stream.
  const [expanded, setExpanded] = React.useState(false)
  const showBody = terminal ? expanded : open
  const kc = agentColor(colorIdx)

  // Jump-to-agent: clicking a plan-card task row bumps focusNonce with this
  // agent's id → scroll the card into view and expand it (done cards only need
  // expanding; live cards are already open).
  const cardRef = React.useRef<HTMLDivElement>(null)
  const focusNonce = useUiNav((s) => s.focusNonce)
  const focusAgentId = useUiNav((s) => s.focusAgentId)
  const openDrawer = useUiNav((s) => s.openDrawer)
  // Run output dir (always set — main passes --output-dir) for "Open run folder".
  const runDir = useEngineStore((s) => s.config?.sources?.outputDir)
  // Cancel affordance (flat mode only — chain agents feed the spine): a × on a LIVE,
  // non-recovering card while >1 agent is still live (never cancel into an empty synth).
  // Once agent:done fires (recovering = writing its report), there's nothing left to
  // stop, so the × disappears — which is also exactly the window where the pool can't
  // preempt anyway. `cancel_agent` halts the agent's tool + prunes its KV for siblings.
  const mode = useEngineStore((s) => s.mode)
  const liveCount = useEngineStore((s) => s.researchAgentIds.length)
  const cancellable = !terminal && !agent.recovering && mode === 'flat' && liveCount > 1
  React.useEffect(() => {
    if (focusAgentId !== agent.id) return
    if (terminal) setExpanded(true)
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Re-fire only when a new focus request arrives (nonce), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce])
  const pill = failed ? (
    agent.failReason === 'user_cancel' ? (
      <span className="pill p-cancelled" title="Cancelled by you">✕ Cancelled</span>
    ) : (
      <span className="pill p-failed" title={agent.failReason ?? undefined}>✗ Recovery failed</span>
    )
  ) : done ? (
    <span className="pill p-done">✓ Report ready</span>
  ) : (
    <span className="pill p-live">
      <span className="ld" />
      {statusText(agent)}
    </span>
  )
  const task = agent.taskDescription ?? agent.dependencyHint
  // Footer (research agents only, once done with a report): a sibling action
  // row BELOW the card. Recon probes pass no `showFooter`, so they get none.
  const report = done && showFooter ? reportItemOf(agent) : null
  return (
    <>
      <div
        ref={cardRef}
        className={`card agent ${done ? '' : 'live'} ${showBody ? 'open' : ''}`}
        style={{ ['--kc' as string]: kc }}
      >
        <div
          className={`chead ${done ? 'click' : ''}`}
          onClick={done ? () => setExpanded((e) => !e) : undefined}
        >
          <span className="cbadge">{agent.label}</span>
          <div className="ctitle">
            <div className="t">{title ?? `Agent ${(agent.taskIndex ?? colorIdx) + 1}`}</div>
          </div>
          {pill}
          <span className="cstat">
            <span>{agent.toolCallCount} tools</span>
            <span>{agent.tokenCount.toLocaleString()} tok</span>
          </span>
          {done && <IconChevron className={`chev ${expanded ? 'open' : ''}`} />}
          {cancellable && (
            <button
              className="ccancel"
              title="Cancel this agent — stop its research and free its budget for the others"
              onClick={(e) => {
                e.stopPropagation()
                dispatch({ type: 'cancel_agent', agentId: agent.id })
              }}
            >
              ✕
            </button>
          )}
        </div>
        {task && <div className="ctask">{task}</div>}
        {showBody && (
          <div className="cbody">
            {carry}
            <WorkRows agent={agent} />
            <SourceChips agent={agent} />
          </div>
        )}
      </div>
      {report && (
        <AgentFooter
          title={title ?? `Agent ${(agent.taskIndex ?? colorIdx) + 1}`}
          markdown={extractReportBody(report.body)}
          defaultName={`annexure-${(agent.taskIndex ?? colorIdx) + 1}.pdf`}
          sources={{
            count: agentSourceRows(agent).length,
            onOpen: () => openDrawer('sources', agent.id),
          }}
          transcript={agentTranscript(agent)}
          json={report.body}
          runDir={runDir ?? undefined}
        />
      )}
    </>
  )
}

/** The Synthesis beat. */
export function SynthCard({ state }: { state: AppState }): React.ReactElement {
  const s = state.synth
  const mode = state.mode ?? 'flat'
  // Research is done and we've entered the synth phase, but the synth stream
  // hasn't opened yet (research:done → phase 'synth' precedes synthesize:start).
  // Surface that pre-stream window as a live "preparing" beat instead of a
  // static "pending" so it doesn't read as a dead wait.
  const preparing = !s.open && !s.done && state.phase === 'synth'
  const pill = s.done ? (
    <span className="pill p-done">✓ done</span>
  ) : s.open ? (
    <span className="pill p-live" style={{ ['--kc' as string]: 'var(--syn)' }}>
      <span className="ld" />
      synthesizing
    </span>
  ) : preparing ? (
    <span className="pill p-live" style={{ ['--kc' as string]: 'var(--syn)' }}>
      <span className="ld" />
      preparing
    </span>
  ) : (
    <span className="pill p-queued">pending</span>
  )
  const live = (s.open && !s.done) || preparing
  return (
    <div className={`card ${live ? 'live' : s.done ? '' : 'ghost'}`} style={{ ['--kc' as string]: 'var(--syn)' }}>
      <div className="chead">
        <span className="cbadge">∑</span>
        <div className="ctitle">
          <div className="t">Synthesis</div>
          <div className="s">aggregates the whole {mode === 'deep' ? 'spine' : 'fan'} into one grounded answer</div>
        </div>
        {pill}
      </div>
      {s.open && s.buffer && (
        <div className="cbody">
          <div className="wthink" style={{ ['--kc' as string]: 'var(--syn)' }}>
            {s.buffer}
            {!s.done && <span className="caret" />}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The synth output can lead with a `<think>…</think>` block (Qwen's chat
 * template emits one — empty even when thinking is off). It belongs in the live
 * synth stream, never in the final grounded answer, so strip a leading block.
 */
function stripThink(text: string): string {
  return text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, '')
}

/** The Answer beat — the grounded answer document. Gets the same footer
 *  (Copy + Export of the final report); no Sources entry (it aggregates the
 *  whole run, surfaced by the header ledger). */
export function AnswerCard({ answer }: { answer: string | null }): React.ReactElement {
  const runDir = useEngineStore((s) => s.config?.sources?.outputDir)
  if (!answer) {
    return (
      <div className="card acard">
        <div className="ph">
          your grounded answer lands here — every claim traceable to its source and the task that found it
        </div>
      </div>
    )
  }
  const body = stripThink(answer)
  return (
    <>
      <div className="card">
        <div className="answer-body md">
          <Markdown text={body} />
        </div>
      </div>
      <AgentFooter title="Report" markdown={body} defaultName="report.pdf" runDir={runDir ?? undefined} />
    </>
  )
}
