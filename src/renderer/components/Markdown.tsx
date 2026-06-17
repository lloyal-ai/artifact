import React from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders a grounded answer as markdown (GitHub-flavored: headings, lists,
 * tables, links, code). Links are http(s) only and open in the system browser
 * via the preload bridge — the renderer never navigates away from the app.
 */
const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        if (href) window.reasoning.openExternal(href)
      }}
    >
      {children}
    </a>
  ),
}

function MarkdownInner({ text }: { text: string }): React.ReactElement {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {text}
    </ReactMarkdown>
  )
}

/** Memoized so re-renders elsewhere don't re-parse a long, static answer. */
export const Markdown = React.memo(MarkdownInner)
