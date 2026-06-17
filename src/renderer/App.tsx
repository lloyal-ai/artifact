import React from 'react'
import { useEngineState } from './bridge'
import { Boot } from './components/Boot'
import { Composer } from './components/Composer'
import { Header } from './components/Header'
import { Timeline } from './components/Timeline'

const BOOT_PHASES = new Set(['boot', 'loading', 'downloading', 'boot_error'])

export function App(): React.ReactElement {
  const state = useEngineState()

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
      <Header state={state} />
      {fresh ? <Welcome /> : <Timeline state={state} />}
      <Composer state={state} />
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
