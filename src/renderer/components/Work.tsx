import React from 'react'
import type { AgentRuntime, TimelineItem } from '../../tui-ink/state'
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

/**
 * Decode a PARTIAL report-tool JSON stream for live display. The model streams
 * `{"result":"## …with escaped \n…"}` token-by-token, so a full `JSON.parse`
 * fails mid-stream. Locate the `result` string value and decode its escapes up
 * to the (not-yet-arrived) closing quote, so the streaming report renders as
 * clean markdown instead of raw escaped JSON. Stops at an incomplete escape at
 * the tail (waits for the next token). Returns null when the buffer isn't yet a
 * recognizable report — the caller then shows the raw text.
 */
const ESCAPES: Record<string, string> = {
  n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/',
}
export function extractStreamingReport(buffer: string): string | null {
  const m = /"result"\s*:\s*"/.exec(buffer)
  if (!m) return null
  let i = m.index + m[0].length
  let out = ''
  while (i < buffer.length) {
    const ch = buffer[i]
    if (ch === '"') break // unescaped closing quote → end of the result string
    if (ch === '\\') {
      const next = buffer[i + 1]
      if (next === undefined) break // incomplete escape at the stream tail
      if (next === 'u') {
        const hex = buffer.slice(i + 2, i + 6)
        if (hex.length < 4) break // incomplete \uXXXX — wait for more tokens
        out += String.fromCharCode(parseInt(hex, 16))
        i += 6
        continue
      }
      out += ESCAPES[next] ?? next
      i += 2
      continue
    }
    out += ch
    i += 1
  }
  return out
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

/** Live "Writing report" — the model is streaming the report-tool JSON into
 *  `contentBuffer` (post-</think>, pre-report-item). Collapsed by default;
 *  expanding shows the raw streaming text, monospace + scrollable. */
function WritingReportRow({ buffer }: { buffer: string }): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  // Decode the streaming report JSON so it reads as markdown, not escaped JSON.
  // Falls back to the raw buffer until the `"result":"…"` value appears.
  const report = extractStreamingReport(buffer)
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
        {open &&
          (report ? (
            <div className="wreport md">
              <Markdown text={report} />
              <span className="caret" />
            </div>
          ) : (
            <div className="wstream">
              {buffer}
              <span className="caret" />
            </div>
          ))}
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

  // Live report writing — the model is streaming report-tool JSON before the
  // structured report item lands. Append below the timeline rows.
  if (agent.contentBuffer.trim()) {
    rows.push(<WritingReportRow buffer={agent.contentBuffer} key="writing-report" />)
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
