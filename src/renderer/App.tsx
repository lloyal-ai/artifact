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
import { TraceView } from './components/TraceView'

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
  if (drawer.mode === 'trace') {
    return (
      <Drawer key="trace" title="Trace" onClose={closeDrawer} wide flush>
        <TraceView />
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

/** Up-arrow — "data leaving the device" cue; mirrors Header's IconEgress so the
 *  legend's Network pill matches the live one in the toolbar exactly. */
const IconEgress = (): React.ReactElement => (
  <svg
    className="egr-ic"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 19V6M6 12l6-6 6 6" />
  </svg>
)

function Welcome(): React.ReactElement {
  return (
    <div className="scroll">
      <div className="welcome">
        <div className="welcome-h">What do you want to understand?</div>
        <div className="welcome-sub">
          A private AI workspace for research, reasoning, and source-backed work.
        </div>

        {/* Transparency card — styled like the agent/spine cards. Lists every
            entitlement an app can hold. Live ones (Local, Network) describe the
            top-bar pill the user will see; the rest are declared per-app and
            surfaced in Settings, not the live bar. Pills are non-interactive. */}
        <div className="card welcome-card">
          <div className="wlegend">
            <div className="wlegend-cap">How Artifact’s AI transparency works:</div>

            <div className="wl-pill">
              <span className="localdot">
                <span className="orb" />
                <b>Local</b>
              </span>
            </div>
            <div className="wl-desc">
              Inference runs on your device by default — the baseline everything below is measured
              against.
            </div>

            <div className="wl-pill">
              <span className="egress">
                <IconEgress />
                <b>Network</b>
              </span>
            </div>
            <div className="wl-desc">
              Lights up in the top status bar while a reviewed app reaches the internet — so you see
              the moment data leaves your device.
            </div>

            <div className="wl-pill">
              <span className="entpill">
                <span className="dot files" />
                <b>Local files</b>
              </span>
            </div>
            <div className="wl-desc">
              Lets an app read files on your device. Doesn’t live in the top status bar — check which
              app uses it in Settings.
            </div>

            <div className="wl-pill">
              <span className="entpill">
                <span className="dot creds" />
                <b>Credentials</b>
              </span>
            </div>
            <div className="wl-desc">
              Lets an app use API keys you’ve stored. Doesn’t live in the top status bar — check which
              app uses it in Settings.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
