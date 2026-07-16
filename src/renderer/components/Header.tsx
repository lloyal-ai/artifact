import React from 'react'
import type { AppState } from 'reasoning.run/state'
import { useUiNav } from '../ui-store'
import { IconList, IconSettings } from '../icons'
import { Gauge } from './Gauge'
import { EntChip, ENT_ORDER, activeEntitlements, type EntKey } from '../entitlements'
import logoUrl from '../assets/logo.png'

/** Activity-waveform glyph for the live trace pane. */
const IconTrace = (): React.ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h3l2 6 4-14 2 8h2.5l1.5-3H21" />
  </svg>
)

/** Latch each active entitlement key on, then hold it for `holdMs` after it
 *  clears — so a sub-second tool call still registers and a burst doesn't
 *  strobe the chips. Per-key: chips appear/leave independently. */
function useStickyKeys(active: Set<EntKey>, holdMs: number): ReadonlySet<EntKey> {
  const [shown, setShown] = React.useState<ReadonlySet<EntKey>>(active)
  const timers = React.useRef(new Map<EntKey, ReturnType<typeof setTimeout>>())
  const key = [...active].sort().join('|')
  React.useEffect(() => {
    setShown((prev) => {
      const next = new Set(prev)
      for (const k of active) {
        next.add(k)
        const t = timers.current.get(k)
        if (t) {
          clearTimeout(t)
          timers.current.delete(k)
        }
      }
      for (const k of prev) {
        if (!active.has(k) && !timers.current.has(k)) {
          timers.current.set(
            k,
            setTimeout(() => {
              timers.current.delete(k)
              setShown((p) => {
                const n = new Set(p)
                n.delete(k)
                return n
              })
            }, holdMs),
          )
        }
      }
      return next
    })
    // `active` is rebuilt each render; gate on its serialized contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, holdMs])
  React.useEffect(() => {
    const t = timers.current
    return () => {
      for (const id of t.values()) clearTimeout(id)
    }
  }, [])
  return shown
}

export function Header({ state }: { state: AppState }): React.ReactElement {
  const openDrawer = useUiNav((s) => s.openDrawer)
  // Live permission chips: one per entitlement currently in use (an in-flight
  // tool call belonging to an app that declared it). "Permissions visible while
  // active" made literal — the chips light ONLY while the capability is in use.
  const liveEnts = useStickyKeys(activeEntitlements(state), 1200)
  // Two-tier header:
  //  · `.titlebar` is the custom dark drag strip carrying only the centered
  //    app name. It reserves space for the native window controls — macOS
  //    traffic-lights sit top-LEFT (pad-left), win/linux controls-overlay sits
  //    top-RIGHT (pad-right) — while the name stays absolutely centered.
  //  · `.toolbar` is the functional, NON-drag row (logo, breadcrumb, status,
  //    settings). Reasoning mode (Parallel/Deep) is chosen at plan review, not
  //    here — switching mid-run would invalidate an in-flight plan.
  const isMac = window.reasoning.platform === 'darwin'
  const titleCls = isMac ? 'titlebar mac' : 'titlebar win'
  return (
    <>
      <div className={titleCls}>
        <span className="appname">Artifact</span>
      </div>
      <div className="toolbar">
        <div className="wsbtn brand">
          <img className="glyph" src={logoUrl} alt="Artifact" />
        </div>
        {state.query && (
          <div className="hcrumb" title={state.query}>
            <b>{state.query}</b>
          </div>
        )}
        <div className="hspace" />
        <div className="netstatus">
          <span className="localdot">
            <span className="orb" />
            <b>Local</b>
          </span>
          {ENT_ORDER.filter((k) => liveEnts.has(k)).map((k) => (
            <EntChip key={k} kind={k} />
          ))}
        </div>
        <Gauge pct={state.pressure?.pct ?? 0} />
        <button
          className="hpill"
          title="Open the source ledger — every source the agents cited"
          onClick={() => openDrawer('sources')}
        >
          <IconList className="hpill-ic" />
          <b>{state.sourceCount}</b>
          <span className="lab">sources</span>
        </button>
        <button className="iconbtn" title="Live trace" onClick={() => openDrawer('trace')}>
          <IconTrace />
        </button>
        <button className="iconbtn" title="Settings" onClick={() => openDrawer('settings')}>
          <IconSettings />
        </button>
      </div>
    </>
  )
}
