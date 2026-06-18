import React from 'react'
import type { AppState } from '../../tui-ink/state'
import { dispatch } from '../bridge'
import { IconSearch, IconSettings } from '../icons'
import { Gauge } from './Gauge'

export function Header({
  state,
  onOpenSettings,
}: {
  state: AppState
  onOpenSettings: () => void
}): React.ReactElement {
  const mode = state.mode ?? 'flat'
  const setMode = (m: 'flat' | 'deep'): void => {
    if (m !== mode) dispatch({ type: 'change_mode', mode: m })
  }
  return (
    <div className="hdr">
      <div className="wsbtn brand">
        <span className="glyph">R</span>
        <span className="nm">reasoning.run</span>
      </div>
      {state.query && (
        <div className="hcrumb">
          <b>{state.query}</b>
        </div>
      )}
      <div className="hspace" />
      <div className="modesw">
        <button className={mode === 'flat' ? 'on' : ''} onClick={() => setMode('flat')}>
          <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
            <path d="M5 5v14M19 5v14M12 4v4" strokeLinecap="round" />
            <circle cx="12" cy="3" r="1.6" />
          </svg>
          Parallel
        </button>
        <button className={mode === 'deep' ? 'on' : ''} onClick={() => setMode('deep')}>
          <svg className="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
            <circle cx="12" cy="4" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="20" r="1.8" />
            <path d="M12 6v4M12 14v4" />
          </svg>
          Deep
        </button>
      </div>
      <div className="hspace" />
      <div className="localdot">
        <span className="orb" />
        <b>Local</b>
      </div>
      <Gauge pct={state.pressure?.pct ?? 0} />
      <button className="hpill" onClick={onOpenSettings}>
        <IconSearch />
        <b>{state.sourceCount}</b>
      </button>
      <button className="iconbtn" title="Settings" onClick={onOpenSettings}>
        <IconSettings />
      </button>
    </div>
  )
}
