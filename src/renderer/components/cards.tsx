import React from 'react'
import type { ResearchTask } from '@lloyal-labs/rig'
import type { AgentRuntime, AppState } from '../../tui-ink/state'
import { dispatch } from '../bridge'
import { IconChevron } from '../icons'
import { Markdown } from './Markdown'
import { SourceChips, WorkRows } from './Work'

export const AGENT_COLORS = ['var(--a1)', 'var(--a2)', 'var(--a3)', 'var(--a4)', 'var(--a5)']
export const agentColor = (i: number): string => AGENT_COLORS[i % AGENT_COLORS.length]

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
        <span className="src">
          <span className="d" style={{ background: agentColor(index) }} />
          {task.app}
        </span>
      )}
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
            <div className="prow" key={i}>
              <span className="n">{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{t.description}</span>
              <span className="src">
                <span className="d" style={{ background: agentColor(i) }} />
                {t.app ?? ''}
              </span>
            </div>
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

/** A research (or recon) agent card — the streaming centerpiece. */
export function AgentCard({
  agent,
  colorIdx,
  open,
  title,
  carry,
}: {
  agent: AgentRuntime
  colorIdx: number
  open: boolean
  title?: string
  carry?: React.ReactNode
}): React.ReactElement {
  const done = agent.phase === 'done'
  const kc = agentColor(colorIdx)
  const pill = done ? (
    <span className="pill p-done">✓ done</span>
  ) : (
    <span className="pill p-live">
      <span className="ld" />
      {statusText(agent)}
    </span>
  )
  const task = agent.taskDescription ?? agent.dependencyHint
  return (
    <div
      className={`card agent ${done ? '' : 'live'} ${open ? 'open' : ''}`}
      style={{ ['--kc' as string]: kc }}
    >
      <div className="chead">
        <span className="cbadge">{agent.label}</span>
        <div className="ctitle">
          <div className="t">{title ?? `Agent ${(agent.taskIndex ?? colorIdx) + 1}`}</div>
        </div>
        {pill}
        <span className="cstat">
          <span>{agent.toolCallCount} tools</span>
          <span>{agent.tokenCount.toLocaleString()} tok</span>
        </span>
      </div>
      {task && <div className="ctask">{task}</div>}
      {open && (
        <div className="cbody">
          {carry}
          <WorkRows agent={agent} />
          <SourceChips agent={agent} />
        </div>
      )}
    </div>
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

/** The Answer beat — the grounded answer document. */
export function AnswerCard({ answer }: { answer: string | null }): React.ReactElement {
  if (!answer) {
    return (
      <div className="card acard">
        <div className="ph">
          your grounded answer lands here — every claim traceable to its source and the task that found it
        </div>
      </div>
    )
  }
  return (
    <div className="card">
      <div className="answer-body md">
        <Markdown text={stripThink(answer)} />
      </div>
    </div>
  )
}
