import React, { useEffect, useState } from 'react'
import type { Toast as ToastModel } from '../tui-ink/state'
import { useEngineState } from './bridge'
import { useUiNav } from './ui-store'
import { Boot } from './components/Boot'
import { Composer } from './components/Composer'
import { Drawer } from './components/Drawer'
import { Header } from './components/Header'
import { ReportView } from './components/ReportView'
import { SettingsBody } from './components/Settings'
import { SourcesBody } from './components/Sources'
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
      <Toast toast={state.toast} />
      <InspectorDrawer />
    </div>
  )
}

/**
 * The single multi-mode inspector slide-over, driven by `ui-store`:
 *  · 'settings' — installed AgentApps + Advanced.
 *  · 'sources'  — the live cross-agent source ledger; `filterAgentId` scopes it
 *    to one agent (from a card footer's "Sources (N)"). When filtered, a
 *    "Show all" action drops back to the global ledger.
 * Keyed by mode+filter so switching modes re-runs the Drawer's focus trap.
 */
function InspectorDrawer(): React.ReactElement | null {
  const drawer = useUiNav((s) => s.drawer)
  const openDrawer = useUiNav((s) => s.openDrawer)
  const closeDrawer = useUiNav((s) => s.closeDrawer)
  if (!drawer) return null

  if (drawer.mode === 'settings') {
    return (
      <Drawer key="settings" title="Settings" onClose={closeDrawer}>
        <SettingsBody />
      </Drawer>
    )
  }
  if (drawer.mode === 'report' && drawer.report) {
    return (
      <Drawer key="report" title={drawer.report.title} onClose={closeDrawer} wide>
        <ReportView report={drawer.report} />
      </Drawer>
    )
  }
  const filtered = drawer.filterAgentId != null
  return (
    <Drawer
      key={`sources-${drawer.filterAgentId ?? 'all'}`}
      title="Sources"
      onClose={closeDrawer}
      actions={
        filtered ? (
          <button className="drawer-act" onClick={() => openDrawer('sources')}>
            Show all
          </button>
        ) : undefined
      }
    >
      <SourcesBody filterAgentId={drawer.filterAgentId} />
    </Drawer>
  )
}

const TOAST_TONE: Record<ToastModel['tone'], string> = {
  success: 'var(--accent)',
  warn: 'var(--warn)',
  error: 'var(--hot)',
  info: 'var(--ink-2)',
}

/**
 * Transient feedback snackbar, driven by `state.toast`. Auto-dismisses ~4s
 * after a new toast lands — the effect is keyed on `toast.id`, so each fresh
 * toast (re)arms the timer and the cleanup clears the prior one. Dismissal is
 * purely visual (local `shown`); the reducer clears `state.toast` on the next
 * participation toggle. Sits above the fixed Composer so the two never overlap.
 */
function Toast({ toast }: { toast: ToastModel | null }): React.ReactElement | null {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!toast) {
      setShown(false)
      return
    }
    setShown(true)
    const timer = setTimeout(() => setShown(false), 4000)
    return () => clearTimeout(timer)
  }, [toast?.id])

  if (!toast || !shown) return null
  const kc = TOAST_TONE[toast.tone]
  return (
    <div className="toast" role="status" style={{ ['--kc' as string]: kc }}>
      <span className="toast-dot" />
      <span className="toast-msg">{toast.message}</span>
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
