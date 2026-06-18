import React from 'react'
import type { ReportPreview } from '../ui-store'
import { Markdown } from './Markdown'

/**
 * The right-side report preview pane (drawer mode 'report'). Renders the report
 * markdown and offers "Save as PDF" — which serializes the *rendered* DOM into a
 * print-styled (light) HTML document and hands it to the main process, where
 * Chromium's printToPDF produces the file. The preview reuses the app's `.md`
 * styling (dark, in-app); the PDF gets its own clean light theme below.
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/** Wrap the rendered report HTML in a complete, print-friendly document. */
function buildPdfHtml(title: string, bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font: 15px/1.6 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1d24; margin: 0; -webkit-print-color-adjust: exact; }
  .doc { max-width: 720px; margin: 0 auto; padding: 8px 6px 40px; }
  h1, h2, h3, h4 { line-height: 1.25; color: #0b0d12; letter-spacing: -0.01em; }
  h1 { font-size: 26px; margin: 0 0 14px; }
  h2 { font-size: 20px; margin: 28px 0 10px; border-bottom: 1px solid #e6e8ee; padding-bottom: 5px; }
  h3 { font-size: 16px; margin: 20px 0 8px; }
  p, li { font-size: 14.5px; }
  a { color: #1565c0; text-decoration: none; word-break: break-word; }
  code { font-family: ui-monospace, Menlo, monospace; background: #f1f3f7; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
  pre { background: #f6f8fb; padding: 14px 16px; border-radius: 8px; overflow: auto; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13.5px; }
  th, td { border: 1px solid #dfe3ea; padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #f4f6fa; }
  blockquote { border-left: 3px solid #cdd3de; margin: 12px 0; padding: 2px 0 2px 14px; color: #444b57; }
  hr { border: 0; border-top: 1px solid #e6e8ee; margin: 24px 0; }
</style></head><body><div class="doc">${bodyHtml}</div></body></html>`
}

export function ReportView({ report }: { report: ReportPreview }): React.ReactElement {
  const ref = React.useRef<HTMLDivElement>(null)
  const [saving, setSaving] = React.useState(false)

  const savePdf = (): void => {
    const body = ref.current?.innerHTML
    if (!body) return
    setSaving(true)
    void window.reasoning
      .exportPdf({ defaultName: report.defaultName, html: buildPdfHtml(report.title, body) })
      .finally(() => setSaving(false))
  }

  return (
    <>
      <div className="report-bar">
        <button className="btn primary" onClick={savePdf} disabled={saving}>
          {saving ? 'Saving…' : 'Save as PDF'}
        </button>
      </div>
      <div className="report-doc md" ref={ref}>
        <Markdown text={report.markdown} />
      </div>
    </>
  )
}
