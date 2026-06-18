import React, { useEffect, useRef } from 'react'

/**
 * The shared inspector slide-over shell — scrim, sliding `.panel`, a titled
 * header with a close button, and the focus-trap / Esc-to-close / restore-focus
 * behaviour. Hoisted out of Settings so multiple drawer modes (settings,
 * sources) share one chrome and one accessibility contract; the body is passed
 * as `children`, with optional header actions (e.g. the sources filter chip).
 *
 * `.panel`/`.scrim` carry `-webkit-app-region:no-drag` in styles.css so clicks
 * land on the controls and not the titlebar drag region behind them.
 */

// Tab-cycle focusable selector — interactive elements still in the tab order.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Drawer({
  title,
  onClose,
  actions,
  wide,
  flush,
  children,
}: {
  title: string
  onClose: () => void
  /** Optional right-aligned header controls (next to the close button). */
  actions?: React.ReactNode
  /** Wider panel — for the report preview pane. */
  wide?: boolean
  /** Drop the body padding so the child fills the pane edge-to-edge (Trace). */
  flush?: boolean
  children: React.ReactNode
}): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null)

  // Esc closes (the scrim also closes on click), and Tab/Shift+Tab is trapped
  // within the panel so focus can't escape to the app behind it. On open we
  // focus the first focusable element; on close we restore focus to whatever
  // opened the drawer (the header button).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const active = document.activeElement
      // Wrap at the edges; also pull focus back in if it has somehow escaped.
      if (e.shiftKey) {
        if (active === firstEl || !panel.contains(active)) {
          e.preventDefault()
          lastEl.focus()
        }
      } else if (active === lastEl || !panel.contains(active)) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [onClose])

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={`panel${wide ? ' wide' : ''}`} ref={panelRef}>
        <div className="panel-hd">
          <div className="t">{title}</div>
          {actions}
          <button className="x" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className={`panel-bd${flush ? ' flush' : ''}`}>{children}</div>
      </div>
    </>
  )
}
