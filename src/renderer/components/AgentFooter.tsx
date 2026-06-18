import React from 'react'
import { useUiNav } from '../ui-store'

/**
 * The action row that sits BELOW a finished agent card (and the answer card) —
 * a faint, hover-lifting strip of receipts-grade actions:
 *   Copy · Export · Sources (N) · …
 *
 * Copy lands the report markdown on the clipboard; Export opens the right-side
 * report preview pane (with a Save-as-PDF action); Sources opens the ledger
 * filtered to this agent; the … overflow holds the lower-traffic actions (copy
 * the full thread / raw JSON, reveal the run folder). Thumbs-up/down and retry
 * are deliberately absent — there's no feedback sink and no re-run, so they'd
 * be dead controls.
 */

const CopyGlyph = (): React.ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" strokeLinecap="round" />
  </svg>
)
const CheckGlyph = (): React.ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
    <path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ExportGlyph = (): React.ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M12 16V4M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" strokeLinecap="round" />
  </svg>
)
const LedgerGlyph = (): React.ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
  </svg>
)
const MoreGlyph = (): React.ReactElement => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
)

export interface FooterSources {
  count: number
  onOpen: () => void
}

export function AgentFooter({
  title,
  markdown,
  defaultName,
  sources,
  transcript,
  json,
  runDir,
}: {
  /** Heading for the report preview pane. */
  title: string
  /** Report/answer markdown — the Copy + Export payload. */
  markdown: string
  /** Suggested PDF filename for the preview's Save-as-PDF. */
  defaultName: string
  /** Per-agent source entry; omitted for the answer card. */
  sources?: FooterSources
  /** Full-thread markdown for the … overflow; omitted = no entry. */
  transcript?: string
  /** Raw report JSON for the … overflow; omitted = no entry. */
  json?: string
  /** Run output dir for "Open run folder"; omitted = no entry. */
  runDir?: string
}): React.ReactElement {
  const [copied, setCopied] = React.useState(false)
  const [menu, setMenu] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const openReport = useUiNav((s) => s.openReport)

  const flashCopied = (): void => {
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2600)
  }
  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text).then(flashCopied)
  }
  const exportReport = (): void => {
    openReport({ title, markdown, defaultName })
  }

  // Close the overflow menu on any outside click.
  React.useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenu(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menu])

  const hasOverflow = !!transcript || !!json || !!runDir
  return (
    <div className="agfoot">
      <button className="agfoot-act" title="Copy the report markdown" onClick={() => copy(markdown)}>
        {copied ? <CheckGlyph /> : <CopyGlyph />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button className="agfoot-act" title="Preview & export as PDF" onClick={exportReport}>
        <ExportGlyph />
        Export
      </button>
      {sources && (
        <button className="agfoot-act" title="Open this agent's sources" onClick={sources.onOpen}>
          <LedgerGlyph />
          Sources ({sources.count})
        </button>
      )}
      {hasOverflow && (
        <div className="agfoot-more" ref={wrapRef}>
          <button className="agfoot-act icon" title="More" onClick={() => setMenu((m) => !m)}>
            <MoreGlyph />
          </button>
          {menu && (
            <div className="agfoot-menu">
              {transcript && (
                <button
                  onClick={() => {
                    copy(transcript)
                    setMenu(false)
                  }}
                >
                  Copy full thread
                </button>
              )}
              {json && (
                <button
                  onClick={() => {
                    copy(json)
                    setMenu(false)
                  }}
                >
                  Copy report JSON
                </button>
              )}
              {runDir && (
                <button
                  onClick={() => {
                    window.reasoning.revealItem(runDir)
                    setMenu(false)
                  }}
                >
                  Open run folder
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
