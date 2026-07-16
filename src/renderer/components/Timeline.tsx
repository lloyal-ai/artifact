import React, { useEffect, useRef } from 'react'
import type { AgentRuntime, AppState } from 'reasoning.run/state'
import { IconDone } from '../icons'
import {
  AgentCard,
  AnswerCard,
  agentColor,
  ClarifyCard,
  PlanCard,
  QueryCard,
  ScoutedCard,
  SpineEvent,
  SynthCard,
} from './cards'

type Side = 'left' | 'right' | 'center'
type Knot = 'fill' | 'live' | 'ghost'
interface BeatDef {
  key: string
  side: Side
  head?: boolean
  flag: string
  kc: string
  knot: Knot
  date?: string
  gain?: string
  node: React.ReactNode
}

function Beat({ b }: { b: BeatDef }): React.ReactElement {
  const knotCls = b.knot === 'live' ? 'knot live' : b.knot === 'ghost' ? 'knot ghost' : 'knot fill'
  const flagCls = b.knot === 'ghost' ? 'flag ghostflag' : 'flag on'
  const showMeta = (b.date || b.gain) && b.side !== 'center'
  return (
    <div className={`beat ${b.side} ${b.head ? 'head' : ''}`} style={{ ['--kc' as string]: b.kc }}>
      <span className={`${flagCls}`} style={{ ['--kc' as string]: b.kc }}>
        {b.flag}
      </span>
      <span className={knotCls} style={{ ['--kc' as string]: b.kc }}>
        {b.knot === 'fill' && <IconDone />}
      </span>
      {b.side !== 'center' && <span className="stub" />}
      {showMeta && (
        <div className="bmeta">
          {b.date && <span className="date">{b.date}</span>}
          {b.gain && <span className="gain">⬆ {b.gain}</span>}
        </div>
      )}
      <div className="cardwrap">{b.node}</div>
    </div>
  )
}

function progressPct(s: AppState): number {
  if (s.uiPhase === 'done' || s.answer) return 100
  switch (s.phase) {
    case 'recon':
      return 15
    case 'plan':
      return s.uiPhase === 'plan_review' ? 28 : 22
    case 'research': {
      const ids = s.researchAgentIds
      if (ids.length === 0) return 32
      const done = ids.filter((id) => s.agents.get(id)?.phase === 'done').length
      return 32 + Math.round(50 * (done / ids.length))
    }
    case 'synth':
      return s.synth.done ? 92 : 85
    default:
      return s.query ? 8 : 0
  }
}

function buildBeats(s: AppState): BeatDef[] {
  const B: BeatDef[] = []
  const mode = s.mode ?? 'flat'

  // Asked — the run title.
  B.push({
    key: 'asked',
    side: 'center',
    head: true,
    flag: 'Asked',
    kc: 'var(--accent)',
    knot: 'fill',
    node: <QueryCard query={s.query} />,
  })

  // Scouted — pre-flight recon (one probe per source, fires only at ≥2 apps).
  // While probing (phase recon) stream each live probe as a fan, exactly like
  // the Ink Discovering view (one column per source) and the research fan: this
  // is the coverage grounding that drives the planner's per-task `app` routing
  // (the routing itself surfaces downstream as the Plan beat's per-task chips).
  // Once probing completes, collapse to the compact ScoutedCard summary.
  if (s.reconAgentIds.length > 0) {
    if (s.phase === 'recon') {
      B.push({
        key: 'scout-fork',
        side: 'center',
        flag: 'Scouting',
        kc: 'var(--cyan)',
        knot: 'live',
        node: (
          <SpineEvent
            title={`Probing ${s.reconAgentIds.length} sources in parallel`}
            sub="grounding which source covers the query before the planner routes tasks"
            kc="var(--cyan)"
          />
        ),
      })
      s.reconAgentIds.forEach((id, i) => {
        const a = s.agents.get(id)
        if (!a) return
        B.push({
          key: `recon-${id}`,
          side: i % 2 === 0 ? 'left' : 'right',
          flag: 'Probe',
          kc: agentColor(i),
          knot: a.phase === 'done' ? 'fill' : 'live',
          date: a.phase === 'done' ? 'done' : 'live',
          node: <AgentCard agent={a} colorIdx={i} open={a.phase !== 'done'} title={`Source probe ${i + 1}`} />,
        })
      })
    } else {
      B.push({
        key: 'scouted',
        side: 'left',
        flag: 'Scouted',
        kc: 'var(--cyan)',
        knot: 'fill',
        node: <ScoutedCard state={s} />,
      })
    }
  }

  // Working — a live placeholder so submit → plan isn't a dead wait (the only
  // prior signal was the context gauge). Shown while planning, or while
  // discovering before any recon probe has spawned (recon's Scouted beat covers
  // the rest). Morphs into the Planned beat below (same ❖ badge + slot).
  const preplan =
    !s.plan &&
    (s.uiPhase === 'planning' ||
      (s.uiPhase === 'discovering' && s.reconAgentIds.length === 0))
  if (preplan) {
    const scouting = s.uiPhase === 'discovering'
    B.push({
      key: 'working',
      side: 'right',
      flag: scouting ? 'Scouting' : 'Planning',
      kc: 'var(--violet)',
      knot: 'live',
      node: (
        <div className="card" style={{ ['--kc' as string]: 'var(--violet)' }}>
          <div className="chead">
            <span className="cbadge">❖</span>
            <div className="ctitle">
              <div className="t">{scouting ? 'Scouting your sources' : 'Planning your research'}</div>
              <div className="s">
                {scouting ? 'checking which apps cover this' : 'deciding what to investigate'}
              </div>
            </div>
            <span className="pill p-live">
              <span className="ld" />
              {scouting ? 'scouting' : 'planning'}
            </span>
          </div>
        </div>
      ),
    })
  }

  // Clarify — the planner asked questions instead of producing a research
  // plan. Replaces the Planned beat (a clarify plan has 0 tasks, so PlanCard
  // would render a broken "Research plan — 0 tasks").
  const clarifying =
    (s.plan && s.plan.intent === 'clarify') || s.uiPhase === 'clarifying'
  if (clarifying) {
    B.push({
      key: 'clarify',
      side: 'right',
      flag: 'Clarify',
      kc: 'var(--warn)',
      knot: 'live',
      node: <ClarifyCard state={s} />,
    })
  } else if (s.plan && s.plan.intent === 'research') {
    // Planned — interactive at plan_review.
    B.push({
      key: 'planned',
      side: 'right',
      flag: 'Planned',
      kc: 'var(--violet)',
      knot: 'fill',
      date: `${s.plan.tasks.length} tasks`,
      node: <PlanCard state={s} />,
    })
  }

  // Research.
  const ids = s.researchAgentIds
  const researchActive = s.phase === 'research' || s.phase === 'synth' || s.answer != null

  // Spinning up — a live placeholder so the plan-accepted → first-agent window
  // isn't a dead wait (context is prefix-shared once before the agents branch).
  // Disappears the moment the first agent lands. Same ❖/p-live markup as the
  // preplan beat above.
  if (s.phase === 'research' && ids.length === 0 && s.plan) {
    const n = s.plan.tasks.length
    const deep = mode === 'deep'
    B.push({
      key: 'spinup',
      side: 'center',
      flag: 'Research',
      kc: 'var(--accent)',
      knot: 'live',
      node: (
        <div className="card" style={{ ['--kc' as string]: 'var(--accent)' }}>
          <div className="chead">
            <span className="cbadge">❖</span>
            <div className="ctitle">
              <div className="t">{deep ? 'Starting the first task' : `Spinning up ${n} agents`}</div>
              <div className="s">sharing context before they branch</div>
            </div>
            <span className="pill p-live">
              <span className="ld" />
              spinning up
            </span>
          </div>
        </div>
      ),
    })
  }

  // The full research-agent set for this run = the LIVE agents (still in
  // researchAgentIds) PLUS the FINISHED snapshots the reducer pushed to
  // scrollback on agent:return/agent:recovered (kind === 'agent'). A live agent
  // drops out of researchAgentIds and lands in scrollback on the same frame it
  // finishes, so for one frame it can appear in BOTH — dedupe by agent.id
  // (prefer the scrollback snapshot, which is the settled done state) and sort
  // by taskIndex so the fan order is stable as agents finish out-of-spawn-order.
  //
  // scrollback PERSISTS across queries (the `query` event preserves it), so it
  // can hold finished agents from a PRIOR run. `s.agents` does NOT — it resets
  // to empty on each new query — so an id still present in `s.agents` is the
  // exact "belongs to the current run" discriminator. Filter finished snapshots
  // through it so a follow-up query's fan never re-renders last run's agents.
  const finished = s.scrollback
    .filter((it): it is Extract<typeof it, { kind: 'agent' }> => it.kind === 'agent')
    .map((it) => it.agent)
    .filter((a) => s.agents.has(a.id))
  const liveAgents = ids
    .map((id) => s.agents.get(id))
    .filter((a): a is NonNullable<typeof a> => a != null)
  const byId = new Map<number, AgentRuntime>()
  for (const a of liveAgents) byId.set(a.id, a)
  for (const a of finished) byId.set(a.id, a) // scrollback snapshot wins
  const allAgents = [...byId.values()].sort(
    (a, b) => (a.taskIndex ?? 0) - (b.taskIndex ?? 0),
  )

  if (allAgents.length > 0 || (researchActive && s.plan)) {
    // Planned count — prefer the authoritative fork count from `research:start`
    // (= plan.tasks.length at the harness, captured before the pool spawns). It
    // survives agent pruning AND a missing/empty renderer-side plan.tasks (which
    // otherwise rendered "Forked 0" while agents really forked). Fall back to
    // plan.tasks, then the merged live+finished set.
    const plannedCount =
      s.researchAgentCount || s.plan?.tasks.length || allAgents.length
    if (mode === 'flat') {
      // Parallel — a fork beat, then each agent alternating off both sides.
      B.push({
        key: 'fork',
        side: 'center',
        flag: 'Research',
        kc: 'var(--accent)',
        knot: 'fill',
        node: (
          <SpineEvent
            title={`Forked ${plannedCount} ${plannedCount === 1 ? 'agent' : 'agents'} with shared context`}
            sub="prefix-shared once · each researches its angle · converges at synthesis"
          />
        ),
      })
      allAgents.forEach((a, i) => {
        B.push({
          key: `agent-${a.id}`,
          side: i % 2 === 0 ? 'left' : 'right',
          flag: a.label,
          kc: agentColor(a.taskIndex ?? i),
          knot: a.phase === 'done' ? 'fill' : 'live',
          date: a.phase === 'done' ? 'done' : 'live',
          node: <AgentCard agent={a} colorIdx={a.taskIndex ?? i} open={a.phase !== 'done'} showFooter />,
        })
      })
    } else {
      // Deep — one task after another down the spine.
      allAgents.forEach((a, i) => {
        const live = a.phase !== 'done'
        B.push({
          key: `agent-${a.id}`,
          side: i % 2 === 0 ? 'left' : 'right',
          flag: `Task ${String(i + 1).padStart(2, '0')}`,
          kc: agentColor(a.taskIndex ?? i),
          knot: live ? 'live' : 'fill',
          date: live ? 'live' : 'done',
          node: <AgentCard agent={a} colorIdx={a.taskIndex ?? i} open={live} showFooter />,
        })
      })
      // Queued tasks not yet spawned.
      const total = s.plan?.tasks.length ?? 0
      for (let i = allAgents.length; i < total; i++) {
        const t = s.plan?.tasks[i]
        B.push({
          key: `queued-${i}`,
          side: i % 2 === 0 ? 'left' : 'right',
          flag: `Task ${String(i + 1).padStart(2, '0')}`,
          kc: agentColor(i),
          knot: 'ghost',
          date: 'queued',
          node: (
            <div className="card ghost" style={{ ['--kc' as string]: agentColor(i) }}>
              <div className="chead">
                <span className="cbadge">{i + 1}</span>
                <div className="ctitle">
                  <div className="t">{t?.description ?? `Task ${i + 1}`}</div>
                  <div className="s">queued — forks from what earlier tasks leave on the spine</div>
                </div>
                <span className="pill p-queued">queued</span>
              </div>
            </div>
          ),
        })
      }
    }
  }

  // Synthesis — only when fan-in (≥2 tasks).
  if (s.plan && s.plan.tasks.length > 1) {
    B.push({
      key: 'synth',
      side: mode === 'deep' ? 'right' : 'center',
      flag: 'Synthesis',
      kc: 'var(--syn)',
      knot: s.synth.done
        ? 'fill'
        : s.synth.open || (!s.synth.done && s.phase === 'synth')
          ? 'live'
          : 'ghost',
      node: <SynthCard state={s} />,
    })
  }

  // Answer.
  B.push({
    key: 'answer',
    side: 'center',
    flag: 'Answer',
    kc: 'var(--accent)',
    knot: s.answer ? 'fill' : 'ghost',
    node: <AnswerCard answer={s.answer} />,
  })

  return B
}

export function Timeline({ state }: { state: AppState }): React.ReactElement {
  const beats = buildBeats(state)
  const fill = progressPct(state)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // Follow the live tail during active phases, unless the user scrolled up.
  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pinned.current) return
    const active =
      state.phase === 'recon' ||
      state.phase === 'plan' ||
      state.phase === 'research' ||
      state.phase === 'synth' ||
      state.uiPhase === 'planning'
    if (active) el.scrollTop = el.scrollHeight
  })

  return (
    <div className="scroll" ref={scrollRef} onScroll={onScroll}>
      <div className="timeline">
        <div className="spine" />
        <div className="spine-fill" style={{ height: `${fill}%` }} />
        {beats.map((b) => (
          <Beat b={b} key={b.key} />
        ))}
      </div>
    </div>
  )
}
