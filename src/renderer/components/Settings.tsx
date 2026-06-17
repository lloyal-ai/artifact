import React, { useState } from 'react'
import type { AppDescriptor } from '../../tui-ink/state'
import { dispatch, useEngineState, useEngineStore } from '../bridge'

/**
 * Settings slide-over — installed AgentApps + read-only Advanced.
 *
 * Driven by `useEngineStore(s => s.apps)` (the engine-built AppDescriptor
 * snapshot, forwarded over the `apps:state` event → reduce → state.apps) and
 * `useEngineState()` for the model/runtime rows in Advanced.
 *
 * Apps come from the signed channel, never hardwired. Each card renders from
 * the app's manifest joined with its signed catalog metadata. Config fields
 * are READ-ONLY in this increment — only the enable toggle is interactive
 * (dispatches the existing `toggle_participation` command). The "Install an
 * app" row opens apps.lloyal.ai in the system browser.
 */

// ── Entitlement pills ────────────────────────────────────────────
// Map a signed entitlement key → {icon, short label}. Uniform neutral tokens
// (styled by `.ent`); the icon is the only colour. Unknown keys fall back to
// the raw key as the label with a generic shield icon.

interface EntMeta {
  icon: React.ReactElement
  label: string
}

const sw = (inner: React.ReactNode): React.ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
    {inner}
  </svg>
)

const ENTITLEMENTS: Record<string, EntMeta> = {
  network: {
    label: 'Internet',
    icon: sw(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.4 2.5 2.4 15.5 0 18M12 3c-2.4 2.5-2.4 15.5 0 18" />
      </>,
    ),
  },
  'data-egress': {
    label: 'Data transfer',
    icon: sw(
      <>
        <path d="M12 15V4M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" strokeLinecap="round" />
      </>,
    ),
  },
  'local-files': {
    label: 'Local files',
    icon: sw(
      <>
        <path d="M7 3h7l5 5v13H7z" strokeLinejoin="round" />
        <path d="M14 3v5h5" strokeLinejoin="round" />
      </>,
    ),
  },
  credentials: {
    label: 'Account',
    icon: sw(
      <>
        <circle cx="9" cy="12" r="3.4" />
        <path d="M12.4 12H21M18 12v3M21 12v2.4" strokeLinecap="round" />
      </>,
    ),
  },
}

function entMeta(key: string): EntMeta {
  return (
    ENTITLEMENTS[key] ?? {
      label: key,
      icon: sw(<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" strokeLinejoin="round" />),
    }
  )
}

const Chevron = (): React.ReactElement => (
  <span className="chev">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
)

// ── Config-field rendering (read-only this increment) ────────────

interface ConfigField {
  key: string
  /** REQUIRED / SECRET / OPTIONAL badge derived from the JSON Schema. */
  badge: 'REQUIRED' | 'SECRET' | 'OPTIONAL'
  /** Current stored value, masked for secrets. */
  value: string
}

function fieldsOf(descriptor: AppDescriptor): ConfigField[] {
  const schema = descriptor.configSchema as
    | { properties?: Record<string, unknown>; required?: string[] }
    | undefined
  const props = schema?.properties
  if (!props || typeof props !== 'object') return []
  const required = new Set(schema?.required ?? [])
  return Object.entries(props).map(([key, raw]) => {
    const prop = (raw ?? {}) as { 'x-secret'?: boolean }
    const isSecret = prop['x-secret'] === true
    const badge: ConfigField['badge'] = isSecret
      ? 'SECRET'
      : required.has(key)
        ? 'REQUIRED'
        : 'OPTIONAL'
    const stored = descriptor.config[key]
    let value: string
    if (stored === undefined || stored === null || stored === '') {
      value = ''
    } else if (isSecret) {
      // Mask secrets — show only that one is set, never the value.
      value = '••••••••'
    } else {
      value = String(stored)
    }
    return { key, badge, value }
  })
}

// ── App card ─────────────────────────────────────────────────────

function AppCard({ descriptor }: { descriptor: AppDescriptor }): React.ReactElement {
  const [open, setOpen] = useState(false)
  // Per-query participation (matches the TUI source chips): `!== false` = included
  // (default on). Reactive — `toggle_participation` flips `state.participation`
  // through the reducer, so the switch updates without re-emitting `apps:state`.
  const included = useEngineStore((s) => s.participation[descriptor.name] !== false)
  const fields = fieldsOf(descriptor)
  return (
    <div className={`app${open ? ' open' : ''}`}>
      <div className="app-hd" onClick={() => setOpen((v) => !v)}>
        <span className="app-ic">
          {descriptor.iconUrl ? (
            <img src={descriptor.iconUrl} alt="" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
              <rect x="4" y="4" width="16" height="16" rx="4" />
              <path d="M8 12h8M12 8v8" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <span className="app-meta">
          <div className="app-name">{descriptor.title}</div>
          <div className="app-desc">{descriptor.description}</div>
        </span>
        <span
          className={`sw${included ? ' on' : ''}`}
          onClick={(e) => {
            // Toggle participation without collapsing/expanding the card.
            e.stopPropagation()
            dispatch({ type: 'toggle_participation', name: descriptor.name })
          }}
        />
        <Chevron />
      </div>
      {open && (
        <div className="app-body">
          {descriptor.entitlements.length > 0 && (
            <div className="ents">
              {descriptor.entitlements.map((key) => {
                const meta = entMeta(key)
                return (
                  <span className="ent" key={key}>
                    {meta.icon}
                    {meta.label}
                  </span>
                )
              })}
            </div>
          )}
          {fields.length > 0 ? (
            fields.map((f) => (
              <div className="field" key={f.key}>
                <div className="field-l">
                  <span className="k">{f.key}</span>
                  <span className="badge">{f.badge}</span>
                </div>
                <div className="sel">
                  <span>{f.value || 'Not set'}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="nocfg">No configuration needed.</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Advanced — read-only model / runtime info ────────────────────

function Advanced(): React.ReactElement {
  const config = useEngineState().config
  const model = config?.model
  const modelName = model?.path ? basename(model.path) : '—'
  const rerankName = model?.reranker ? basename(model.reranker) : '—'
  const nCtx = model?.nCtx ?? 32768
  return (
    <div className="adv open">
      <div className="adv-row">
        <span className="at">Advanced</span>
        <Chevron />
      </div>
      <div className="adv-body">
        <div className="irow">
          <span className="il">Model</span>
          <span className="iv">{modelName}</span>
        </div>
        <div className="irow">
          <span className="il">Reranker</span>
          <span className="iv">{rerankName}</span>
        </div>
        <div className="irow">
          <span className="il">Backend</span>
          <span className="iv">Metal · auto</span>
        </div>
        <div className="irow">
          <span className="il">Context</span>
          <span className="iv">{nCtx.toLocaleString()} tokens</span>
        </div>
      </div>
      <div className="adv-note">
        Fixed to keep every app behaving exactly as tested · backend detected automatically.
      </div>
    </div>
  )
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i === -1 ? p : p.slice(i + 1)
}

// ── Drawer ───────────────────────────────────────────────────────

export function Settings({ onClose }: { onClose: () => void }): React.ReactElement {
  const apps = useEngineStore((s) => s.apps)
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="panel">
        <div className="panel-hd">
          <div className="t">Settings</div>
          <button className="x" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="panel-bd">
          <div className="sec-head">
            <span className="sh-t">Apps</span>
          </div>

          {apps.map((descriptor) => (
            <AppCard key={descriptor.name} descriptor={descriptor} />
          ))}

          <div
            className="install"
            onClick={() => window.reasoning.openExternal('https://apps.lloyal.ai')}
          >
            <span className="plus">＋</span>
            <div>
              <div className="it">Install an app</div>
              <div className="is">
                From the signed channel · <code>apps.lloyal.ai</code>
              </div>
            </div>
          </div>

          <Advanced />
        </div>
      </div>
    </>
  )
}
