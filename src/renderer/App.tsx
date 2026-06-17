import React, { useState } from 'react'
import { useEngineState } from './bridge'
import { Boot } from './components/Boot'
import { Composer } from './components/Composer'
import { Header } from './components/Header'
import { Settings } from './components/Settings'
import { Timeline } from './components/Timeline'

const BOOT_PHASES = new Set(['boot', 'loading', 'downloading', 'boot_error'])

export function App(): React.ReactElement {
  const state = useEngineState()
  // Renderer-local: the Settings drawer's open/closed state. Self-contained —
  // no engine round-trip; the drawer reads engine state but the overlay is a
  // pure renderer concern.
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (BOOT_PHASES.has(state.uiPhase)) {
    return (
      <div className="page">
        <Boot state={state} />
      </div>
    )
  }

  // Fresh composer (no query yet) — a calm welcome, not an empty timeline.
  const fresh = state.uiPhase === 'composer' && !state.query
  return (
    <div className="page">
      <Header state={state} onOpenSettings={() => setSettingsOpen(true)} />
      {fresh ? <Welcome /> : <Timeline state={state} />}
      <Composer state={state} />
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function Welcome(): React.ReactElement {
  return (
    <div className="scroll">
      <div style={{ maxWidth: 720, margin: '14vh auto 0', textAlign: 'center' }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1.3,
          }}
        >
          What do you want to understand?
        </div>
        <div style={{ color: 'var(--ink-3)', marginTop: 14, fontSize: 15 }}>
          Ask directly for a fast answer, or pose a research question and watch the run unfold as a
          timeline — every task, every source, fully local.
        </div>
      </div>
    </div>
  )
}
