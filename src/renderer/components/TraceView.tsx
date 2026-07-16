import React from 'react'

/**
 * Live trace pane (drawer mode 'trace'). Tails the newest session
 * `trace-*.jsonl` via the main process and renders the raw SDK `TraceEvent`
 * stream as a full-pane, monospace code view — one JSON object per line,
 * category-tinted, auto-tailing, scrollable both ways. The authoritative
 * record of what the engine did. Read-only; no engine change.
 */

interface TLine {
  id: number
  cat: string
  raw: string
}

/** Category = the prefix before the first ':' on the event type — drives tint. */
function lineCategory(raw: string): string {
  // Cheap: pull the `"type":"x:y"` token without a full parse.
  const m = /"type"\s*:\s*"([a-z]+)/i.exec(raw)
  return m ? m[1] : 'other'
}

export function TraceView(): React.ReactElement {
  const [lines, setLines] = React.useState<TLine[]>([])
  const [file, setFile] = React.useState<string | null>(null)
  const scrollRef = React.useRef<HTMLPreElement>(null)
  const pinned = React.useRef(true)
  const nextId = React.useRef(0)
  const partial = React.useRef('') // incomplete trailing line across reads

  const ingest = React.useCallback((text: string): void => {
    const combined = partial.current + text
    const parts = combined.split('\n')
    partial.current = parts.pop() ?? '' // last is incomplete unless text ended with \n
    const fresh: TLine[] = []
    for (const ln of parts) {
      const s = ln.trim()
      if (!s) continue
      fresh.push({ id: nextId.current++, cat: lineCategory(s), raw: s })
    }
    if (fresh.length) setLines((prev) => [...prev, ...fresh].slice(-4000))
  }, [])

  React.useEffect(() => {
    void window.reasoning
      .startTrace()
      .then(({ file: f, text }: { file: string | null; text: string }) => {
        setFile(f)
        partial.current = ''
        ingest(text)
      })
    const unsub = window.reasoning.onTraceAppend(ingest)
    return () => {
      unsub()
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
  }, [lines.length])

  const shortFile = file ? file.split('/').pop() : null
  return (
    <div className="traceview">
      <div className="trace-bar">
        <span className="trace-file" title={file ?? ''}>
          {shortFile ?? 'no trace yet'}
        </span>
        <span className="trace-count">{lines.length}</span>
        {file && (
          <button className="drawer-act" onClick={() => window.reasoning.revealItem(file)}>
            Reveal
          </button>
        )}
      </div>
      {lines.length === 0 ? (
        <div className="srcledger-empty">
          The session trace streams here as the engine runs — pool ticks, agent turns, spine extends, tool
          calls, rerank.
        </div>
      ) : (
        <pre className="tracecode" ref={scrollRef} onScroll={onScroll}>
          {lines.map((l) => (
            <code className={`tline tcat-${l.cat}`} key={l.id}>
              {l.raw}
            </code>
          ))}
        </pre>
      )}
    </div>
  )
}
