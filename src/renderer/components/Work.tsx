import React from 'react'
import type { AgentRuntime, TimelineItem } from '../../tui-ink/state'
import { extractStreamingReport } from '../../tui-ink/state'
import { IconChevron, IconDone, IconThink, toolIcon } from '../icons'
import { Markdown } from './Markdown'

// Maps an agent's chronological `timeline` into the mock's work-rows + source
// chips. Pairs each tool_call with its tool_result (via callId) so the verb and
// its "✓ N results" meta render on one row, exactly like design/research-timeline.

function toolVerb(tool: string, done: boolean): string {
  if (/search/i.test(tool)) return done ? 'Searched' : 'Searching'
  return done ? 'Read' : 'Reading'
}

function resultMeta(r: Extract<TimelineItem, { kind: 'tool_result' }>): string {
  const head =
    r.resultCount != null ? `${r.resultCount} results` : `${(r.byteLength / 1000).toFixed(1)} kb`
  const hosts = r.hosts.slice(0, 2).join(' · ')
  return hosts ? `${head} · ${hosts}` : head
}

/**
 * Extracts the report markdown from a `report` item's body. The body is
 * `ev.result` from agent:return — the same content RunDirSink writes to
 * annexure-N.md. It MAY be raw markdown OR a JSON blob `{"result":"## …"}`
 * (the report-tool argument); handle both by attempting a parse and unwrapping
 * `.result` only when it yields an object with a string `result`.
 */
export function extractReportBody(body: string): string {
  const trimmed = body.trimStart()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(body)
      if (parsed && typeof parsed === 'object' && typeof (parsed as { result?: unknown }).result === 'string') {
        return (parsed as { result: string }).result
      }
    } catch {
      // not JSON — fall through and treat as raw markdown
    }
  }
  return body
}

/** A think row — collapsed by default (think bodies can be huge when thinking
 *  is off and the model funnels report JSON into the block). Default-expand
 *  only while it's the live row AND short. */
function ThinkRow({ it }: { it: Extract<TimelineItem, { kind: 'think' }> }): React.ReactElement {
  const autoOpen = it.live && it.body.length < 280
  const [open, setOpen] = React.useState(autoOpen)
  // Track autoOpen so a freshly-live short block expands without clobbering an
  // explicit user toggle once it grows / closes.
  const prevAuto = React.useRef(autoOpen)
  React.useEffect(() => {
    if (autoOpen !== prevAuto.current) {
      setOpen(autoOpen)
      prevAuto.current = autoOpen
    }
  }, [autoOpen])
  const label = it.live ? 'Thinking' : 'Thought'
  return (
    <div className={`wrow ${it.live ? 'live' : 'done'}`}>
      <span className="wic">
        <IconThink />
      </span>
      <div className="wbody">
        <button className="wtoggle" onClick={() => setOpen((o) => !o)}>
          <span className="k">{label}</span>
          <IconChevron className={`wchev ${open ? 'open' : ''}`} />
        </button>
        {open && (
          <div className="wthink">
            {it.body}
            {it.live && <span className="caret" />}
          </div>
        )}
      </div>
    </div>
  )
}

/** A report row — collapsed "Report" by default; expanding renders the body as
 *  markdown in a capped, scrollable region (the body can be thousands of
 *  tokens). */
function ReportRow({
  it,
  tokenCount,
}: {
  it: Extract<TimelineItem, { kind: 'report' }>
  tokenCount: number
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const body = extractReportBody(it.body)
  return (
    <div className="wrow done">
      <span className="wic">
        <IconDone />
      </span>
      <div className="wbody">
        <button className="wtoggle" onClick={() => setOpen((o) => !o)}>
          <span className="k">Report</span>
          <span className="wmeta-inline">{tokenCount.toLocaleString()} tok</span>
          <IconChevron className={`wchev ${open ? 'open' : ''}`} />
        </button>
        {open && (
          <div className="wreport md">
            <Markdown text={body} />
          </div>
        )}
      </div>
    </div>
  )
}

/** Live "Writing report" — the model is streaming the report body. Two sources
 *  feed this, both raw markdown by the time they reach here:
 *   · voluntary `report` tool — the model emits the terminal call as Hermes XML;
 *     the report body is the raw, unescaped markdown between `<parameter=result>`
 *     and `</parameter>` in `agent.contentBuffer`. `extractStreamingReport`
 *     pulls it out by marker — same idea as streaming a think block to `</think>`.
 *   · recovery (`recoverInline`) — the EAGER report grammar emits raw report
 *     prose (no envelope), so `agent.contentBuffer` IS the report.
 *  The caller resolves which source to pass as `report`; this row just renders
 *  it. Collapsed by default; expanding shows the live markdown. */
function WritingReportRow({ report }: { report: string }): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="wrow live">
      <span className="wic">
        <IconThink />
      </span>
      <div className="wbody">
        <button className="wtoggle" onClick={() => setOpen((o) => !o)}>
          <span className="k">Writing report</span>
          <span className="pill p-live">
            <span className="ld" />
            writing
          </span>
          <IconChevron className={`wchev ${open ? 'open' : ''}`} />
        </button>
        {open && (
          <div className="wreport md">
            <Markdown text={report} />
            <span className="caret" />
          </div>
        )}
      </div>
    </div>
  )
}

export function WorkRows({ agent }: { agent: AgentRuntime }): React.ReactElement {
  const resultByCall = new Map<number, Extract<TimelineItem, { kind: 'tool_result' }>>()
  for (const it of agent.timeline) {
    if (it.kind === 'tool_result' && it.callId != null) resultByCall.set(it.callId, it)
  }

  const rows: React.ReactElement[] = []
  for (const it of agent.timeline) {
    if (it.kind === 'think') {
      rows.push(<ThinkRow it={it} key={it.id} />)
    } else if (it.kind === 'tool_call') {
      const res = resultByCall.get(it.id)
      const done = !!res
      const Ic = toolIcon(it.tool)
      rows.push(
        <div className={`wrow ${done ? 'done' : 'live'}`} key={it.id}>
          <span className="wic">
            <Ic />
          </span>
          <div className="wbody">
            <div className="wverb">
              <span className="k">{toolVerb(it.tool, done)}</span>{' '}
              <span className="q">{it.argsSummary}</span>
              {!done && !agent.retry && <span className="caret" />}
            </div>
            {res && (
              <div className="wmeta">
                <span className="ok">✓</span> {resultMeta(res)}
              </div>
            )}
            {!done && agent.retry && agent.retry.tool === it.tool && (
              <div className="retry">
                ⟲ rate-limited — retrying in ~
                {Math.max(0, Math.round((agent.retry.retryAt - Date.now()) / 1000))}s
              </div>
            )}
          </div>
        </div>,
      )
    } else if (it.kind === 'report') {
      rows.push(<ReportRow it={it} tokenCount={it.tokenCount} key={it.id} />)
    }
    // standalone tool_result (no matching call) is not a work row.
  }

  // Live report writing — the model is streaming the report before the
  // structured report item lands. Two cases, each raw markdown:
  //  · recovery (`agent.recovering`): `recoverInline`'s EAGER report grammar
  //    streams raw report prose into `contentBuffer` (no envelope). The COMMON
  //    path — the model rarely calls the report tool voluntarily — so it MUST
  //    render or the answer streams invisibly behind a climbing token count.
  //  · voluntary report: the model writes the terminal call as Hermes XML into
  //    `contentBuffer`; `extractStreamingReport` pulls the body out by the
  //    `<parameter=result>` marker (returns null until that marker arrives).
  //    Marker-gating means non-terminal search/read calls — whose args also
  //    flow through the content phase but never carry that marker — never flash
  //    a mislabeled "Writing report" row.
  const liveReport = agent.recovering
    ? agent.contentBuffer
    : extractStreamingReport(agent.contentBuffer)
  if (liveReport && liveReport.trim()) {
    rows.push(<WritingReportRow report={liveReport} key="writing-report" />)
  }

  return <div className="work">{rows}</div>
}

export function SourceChips({ agent }: { agent: AgentRuntime }): React.ReactElement | null {
  const hosts: string[] = []
  for (const it of agent.timeline) {
    if (it.kind === 'tool_result') {
      for (const h of it.hosts) if (!hosts.includes(h)) hosts.push(h)
    }
  }
  if (hosts.length === 0) return null
  return (
    <div className="csrc">
      {hosts.slice(0, 8).map((h) => (
        <span
          className="srcchip"
          key={h}
          title={h}
          onClick={() => window.reasoning.openExternal('https://' + h)}
        >
          <span className="host">{h}</span>
        </span>
      ))}
    </div>
  )
}
