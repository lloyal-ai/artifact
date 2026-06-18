import React from 'react'

/**
 * Live trace pane (drawer mode 'trace'). Tails the newest session
 * `trace-*.jsonl` via the main process and renders the SDK `TraceEvent` stream
 * as a color-coded log — the authoritative record of what the engine did
 * (pool ticks, agent turns, spine extends, tool dispatches, rerank, …).
 *
 * Read-only observability: no engine change, just a file tail.
 */

interface TRow {
  id: number
  type: string
  sum: string
  raw: string
  bad?: boolean
}

/** Category = the prefix before the first ':' — drives the row color. */
function category(type: string): string {
  return type.split(':')[0] || 'other'
}

/** Compact one-line summary of an event's salient fields. */
function summarize(o: Record<string, unknown>): string {
  const t = o.type as string
  const n = (k: string): unknown => o[k]
  switch (t) {
    case 'pool:open':
      return `agents=${n('agentCount')}`
    case 'pool:tick':
      return `${n('phase')} · active=${n('activeAgents')}`
    case 'pool:agentNudge':
      return `#${n('agentId')} ${n('reason')}`
    case 'agent:turn': {
      const calls = (n('parsedToolCalls') as { name: string }[] | undefined) ?? []
      return `#${n('agentId')} turn ${n('turn')}${calls.length ? ' · ' + calls.map((c) => c.name).join(',') : ''}`
    }
    case 'spine:extend':
      return `+${n('deltaTokens')}tok → pos ${n('positionAfter')}`
    case 'prompt:format':
      return `${n('role')} · ${n('tokenCount')}tok`
    case 'branch:create':
      return `${n('role') ?? ''} pos ${n('position') ?? ''}`.trim()
    case 'branch:prefill':
      return `${n('role') ?? ''} ${n('tokenCount')}tok`.trim()
    case 'tool:dispatch':
    case 'tool:result':
    case 'tool:error':
    case 'tool:retry':
      return `#${n('agentId') ?? ''} ${n('tool') ?? ''}`.trim()
    case 'rerank:end':
      return `${n('selectedPassageCount') ?? ''} sel`
    case 'source:research':
      return `${n('sourceName')}: ${((n('questions') as unknown[]) ?? []).length}q`
    case 'scope:open':
    case 'scope:close':
      return String(n('name') ?? '')
    default:
      return ''
  }
}

export function TraceView(): React.ReactElement {
  const [rows, setRows] = React.useState<TRow[]>([])
  const [file, setFile] = React.useState<string | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const pinned = React.useRef(true)
  const nextId = React.useRef(0)
  const partial = React.useRef('') // incomplete trailing line across reads

  const ingest = React.useCallback((text: string): void => {
    const combined = partial.current + text
    const lines = combined.split('\n')
    partial.current = lines.pop() ?? '' // last is incomplete unless text ended with \n
    const fresh: TRow[] = []
    for (const ln of lines) {
      const s = ln.trim()
      if (!s) continue
      try {
        const o = JSON.parse(s) as Record<string, unknown>
        fresh.push({ id: nextId.current++, type: String(o.type ?? '?'), sum: summarize(o), raw: s })
      } catch {
        fresh.push({ id: nextId.current++, type: '·', sum: s.slice(0, 80), raw: s, bad: true })
      }
    }
    if (fresh.length) setRows((prev) => [...prev, ...fresh].slice(-3000))
  }, [])

  React.useEffect(() => {
    let unsub: (() => void) | undefined
    void window.reasoning.startTrace().then(({ file: f, text }: { file: string | null; text: string }) => {
      setFile(f)
      partial.current = ''
      ingest(text)
    })
    unsub = window.reasoning.onTraceAppend(ingest)
    return () => {
      unsub?.()
      window.reasoning.stopTrace()
    }
  }, [ingest])

  // Follow the tail unless the user scrolled up.
  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  React.useEffect(() => {
    const el = scrollRef.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [rows.length])

  const shortFile = file ? file.split('/').pop() : null
  return (
    <div className="traceview">
      <div className="trace-bar">
        <span className="trace-file" title={file ?? ''}>
          {shortFile ?? 'no trace yet'}
        </span>
        <span className="trace-count">{rows.length}</span>
        {file && (
          <button className="drawer-act" onClick={() => window.reasoning.revealItem(file)}>
            Reveal
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="srcledger-empty">
          The session trace streams here as the engine runs — pool ticks, agent turns, spine extends, tool
          calls, rerank.
        </div>
      ) : (
        <div className="tracelog" ref={scrollRef} onScroll={onScroll}>
          {rows.map((r) => (
            <TraceRow row={r} key={r.id} />
          ))}
        </div>
      )}
    </div>
  )
}

function TraceRow({ row }: { row: TRow }): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  return (
    <div className={`trow tcat-${category(row.type)}`}>
      <button className="trow-head" onClick={() => setOpen((o) => !o)}>
        <span className="trow-type">{row.type}</span>
        <span className="trow-sum">{row.sum}</span>
      </button>
      {open && <pre className="trow-raw">{prettyOrRaw(row.raw)}</pre>}
    </div>
  )
}

function prettyOrRaw(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
