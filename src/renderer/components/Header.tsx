import React from 'react'
import type { AppState } from '../../tui-ink/state'
import { useUiNav } from '../ui-store'
import { IconList, IconSettings } from '../icons'
import { Gauge } from './Gauge'
import logoUrl from '../assets/logo.png'

/** Activity-waveform glyph for the live trace pane. */
const IconTrace = (): React.ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h3l2 6 4-14 2 8h2.5l1.5-3H21" />
  </svg>
)

/** Upward arrow — "data leaving the device" cue on the live egress chip. */
const IconEgress = (): React.ReactElement => (
  <svg className="egr-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V6M6 12l6-6 6 6" />
  </svg>
)

/**
 * Live network-egress signal: true while any in-flight agent tool call belongs
 * to an app holding a `network` / `data-egress` entitlement. Entitlement-driven
 * (not tool-name-coded), so it generalizes to any networked AgentApp. An
 * "in-flight" call = a `tool_call` timeline item with no matching `tool_result`
 * yet (by callId), on a non-done agent. This is the "permissions visible while
 * active" promise made literal — the indicator lights ONLY while data is
 * actually leaving the device.
 */
function networkActive(state: AppState): boolean {
  const netTools = new Set<string>()
  for (const app of state.apps) {
    if (app.entitlements.some((e) => e === 'network' || e === 'data-egress')) {
      for (const t of app.tools) netTools.add(t)
    }
  }
  if (netTools.size === 0) return false
  for (const a of state.agents.values()) {
    if (a.phase === 'done') continue
    const resolved = new Set<number>()
    for (const it of a.timeline) if (it.kind === 'tool_result' && it.callId != null) resolved.add(it.callId)
    for (const it of a.timeline) {
      if (it.kind === 'tool_call' && !resolved.has(it.id) && netTools.has(it.tool)) return true
    }
  }
  return false
}

/** Latch `active` on, then hold for `holdMs` after it clears — so a sub-second
 *  network call still registers and a burst of calls doesn't strobe the chip. */
function useSticky(active: boolean, holdMs: number): boolean {
  const [on, setOn] = React.useState(active)
  React.useEffect(() => {
    if (active) {
      setOn(true)
      return
    }
    const t = setTimeout(() => setOn(false), holdMs)
    return () => clearTimeout(t)
  }, [active, holdMs])
  return on
}

export function Header({ state }: { state: AppState }): React.ReactElement {
  const openDrawer = useUiNav((s) => s.openDrawer)
  const egress = useSticky(networkActive(state), 1200)
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
          {egress && (
            <span className="egress" title="A networked AgentApp is reaching the internet right now — data is leaving your device">
              <IconEgress />
              <b>Network</b>
            </span>
          )}
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
