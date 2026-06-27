import React from 'react'

// Inline SVG icons ported from design/research-timeline.html.
type P = { className?: string }
const svg = (inner: React.ReactNode, sw = 2) => (p: P) => (
  <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}>
    {inner}
  </svg>
)

export const IconSearch = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4-4" strokeLinecap="round" />
  </>,
  2.4,
)
export const IconRead = svg(<path d="M5 4h14v16H5zM8 9h8M8 13h6" strokeLinecap="round" />)
export const IconThink = svg(<path d="M12 3a6 6 0 0 1 4 10.5V16H8v-2.5A6 6 0 0 1 12 3z" />)
export const IconDone = svg(<path d="M5 12l4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />, 3)
export const IconChevron = svg(<path d="m6 9 6 6 6-6" />)
export const IconSend = svg(<path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />, 2.4)
// Filled rounded square — the universal "stop" glyph (interrupt the run).
export const IconStop = (p: P): React.ReactElement => (
  <svg className={p.className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
)
export const IconList = svg(<path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />)
export const IconSettings = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      strokeLinejoin="round"
    />
  </>,
  1.9,
)

/** Tool name → work-row icon. */
export function toolIcon(tool: string): (p: P) => React.ReactElement {
  if (/search|web_search/i.test(tool)) return IconSearch
  if (/fetch|read|read_file|fetch_page/i.test(tool)) return IconRead
  return IconSearch
}
