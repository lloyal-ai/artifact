import React, { useEffect, useRef, useState } from 'react'
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

/** Generic app glyph — the fallback when no iconUrl is set or it fails to load. */
const AppGlyph = (): React.ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M8 12h8M12 8v8" strokeLinecap="round" />
  </svg>
)

/** App icon: the signed iconUrl, falling back to the glyph on a 404/broken
 *  image (so a bad URL never renders a torn-image placeholder). */
function AppIcon({ iconUrl }: { iconUrl?: string }): React.ReactElement {
  const [failed, setFailed] = useState(false)
  return (
    <span className="app-ic">
      {failed || !iconUrl ? (
        <AppGlyph />
      ) : (
        <img src={iconUrl} alt="" onError={() => setFailed(true)} />
      )}
    </span>
  )
}

const Chevron = (): React.ReactElement => (
  <span className="chev">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
)

// ── Config-field rendering (editable) ────────────────────────────

interface ConfigFieldSpec {
  key: string
  /** REQUIRED / SECRET / OPTIONAL badge derived from the JSON Schema. */
  badge: 'REQUIRED' | 'SECRET' | 'OPTIONAL'
  /** True when `x-secret` — render masked with a reveal toggle. */
  secret: boolean
  /** True when the property name implies a filesystem path — render a
   *  "Choose…" affordance alongside the text input. */
  pathLike: boolean
  /** Current stored value (raw string). */
  stored: string
}

/** Read the JSON-Schema properties off a descriptor into field specs. No app
 *  knowledge — purely schema-driven. */
function fieldsOf(descriptor: AppDescriptor): ConfigFieldSpec[] {
  const props = schemaProps(descriptor)
  if (!props) return []
  const required = new Set(schemaRequired(descriptor))
  return Object.entries(props).map(([key, raw]) => {
    const prop = (raw ?? {}) as { 'x-secret'?: boolean }
    const secret = prop['x-secret'] === true
    const badge: ConfigFieldSpec['badge'] = secret
      ? 'SECRET'
      : required.has(key)
        ? 'REQUIRED'
        : 'OPTIONAL'
    const raw0 = descriptor.config[key]
    const stored =
      raw0 === undefined || raw0 === null ? '' : String(raw0)
    return { key, badge, secret, pathLike: /path$/i.test(key), stored }
  })
}

function schemaProps(
  descriptor: AppDescriptor,
): Record<string, unknown> | null {
  const schema = descriptor.configSchema as
    | { properties?: Record<string, unknown> }
    | undefined
  const props = schema?.properties
  return props && typeof props === 'object' ? props : null
}

function schemaRequired(descriptor: AppDescriptor): string[] {
  const schema = descriptor.configSchema as { required?: string[] } | undefined
  return schema?.required ?? []
}

const Eye = ({ off }: { off: boolean }): React.ReactElement =>
  sw(
    off ? (
      <>
        <path d="M3 3l18 18" strokeLinecap="round" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.4 5.2A9.5 9.5 0 0 1 12 5c5 0 9 5 9 7a12 12 0 0 1-2 2.5M6.2 6.6C3.9 8 2 10.6 2 12c0 1.4 2.4 4.4 5 5.6" />
      </>
    ) : (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="2.6" />
      </>
    ),
  )

/** One editable config field: text input (masked + reveal for secrets), an
 *  optional "Choose…" affordance for path-like keys, and a Save button that
 *  dispatches a whole-replace `set_app_config` (merging the edited key into the
 *  app's current config so other keys survive). */
function ConfigFieldRow({
  appName,
  config,
  field,
}: {
  appName: string
  config: Record<string, unknown>
  field: ConfigFieldSpec
}): React.ReactElement {
  const [draft, setDraft] = useState(field.stored)
  const [reveal, setReveal] = useState(false)
  // Re-sync the draft if the stored value changes underneath us (e.g. a save
  // round-trips and apps:state re-emits).
  React.useEffect(() => setDraft(field.stored), [field.stored])

  const save = (): void => {
    dispatch({
      type: 'set_app_config',
      name: appName,
      values: { ...config, [field.key]: draft },
    })
  }

  return (
    <div className="field">
      <div className="field-l">
        <span className="k">{field.key}</span>
        <span className="badge">{field.badge}</span>
      </div>
      <div className="inp">
        {field.secret ? (
          <span className="secinp">
            <input
              type={reveal ? 'text' : 'password'}
              value={draft}
              placeholder="Not set"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <button
              className="eye"
              title={reveal ? 'Hide' : 'Reveal'}
              onClick={() => setReveal((v) => !v)}
            >
              <Eye off={reveal} />
            </button>
          </span>
        ) : (
          <input
            value={draft}
            placeholder="Not set"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        )}
        <button className="savebtn" onClick={save}>
          {field.pathLike ? 'Choose…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

/** "Search engine" selector — the web app's two-option UX. The web app's
 *  schema only declares `tavilyKey`; we surface it as a choice between the
 *  built-in keyless SERP (no config) and Tavily (reveals the key field).
 *  Detected by the presence of a `tavilyKey` property in the schema, NOT by
 *  app name — any app declaring `tavilyKey` gets this affordance. */
function EngineSelector({
  descriptor,
}: {
  descriptor: AppDescriptor
}): React.ReactElement {
  const storedKey = descriptor.config['tavilyKey']
  const hasKey = typeof storedKey === 'string' && storedKey !== ''
  // 'tavily' once the user picks Tavily OR a key is already stored.
  const [engine, setEngine] = useState<'serp' | 'tavily'>(
    hasKey ? 'tavily' : 'serp',
  )
  const [draft, setDraft] = useState(hasKey ? String(storedKey) : '')
  const [reveal, setReveal] = useState(false)
  React.useEffect(() => {
    setEngine(hasKey ? 'tavily' : 'serp')
    setDraft(hasKey ? String(storedKey) : '')
  }, [hasKey, storedKey])

  const chooseSerp = (): void => {
    setEngine('serp')
    // Built-in SERP = clear the key (whole-replace with an empty object).
    dispatch({ type: 'set_app_config', name: descriptor.name, values: {} })
  }
  const saveTavily = (): void => {
    dispatch({
      type: 'set_app_config',
      name: descriptor.name,
      values: { tavilyKey: draft },
    })
  }

  return (
    <div className="field">
      <div className="field-l">
        <span className="fl">Search engine</span>
      </div>
      <div className="engine-opts">
        <button
          className={`sel${engine === 'serp' ? ' on' : ''}`}
          onClick={chooseSerp}
        >
          <span>Built-in SERP</span>
          {engine === 'serp' && <Check />}
        </button>
        <button
          className={`sel${engine === 'tavily' ? ' on' : ''}`}
          onClick={() => setEngine('tavily')}
        >
          <span>Tavily</span>
          {engine === 'tavily' && <Check />}
        </button>
      </div>
      {engine === 'serp' ? (
        <div className="field-note">
          <span className="ok">●</span> DuckDuckGo + Marginalia · no account
          needed.
        </div>
      ) : (
        <div className="inp" style={{ marginTop: 9 }}>
          <span className="secinp">
            <input
              type={reveal ? 'text' : 'password'}
              value={draft}
              placeholder="tavilyKey"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveTavily()}
            />
            <button
              className="eye"
              title={reveal ? 'Hide' : 'Reveal'}
              onClick={() => setReveal((v) => !v)}
            >
              <Eye off={reveal} />
            </button>
          </span>
          <button className="savebtn" onClick={saveTavily}>
            Save
          </button>
        </div>
      )}
    </div>
  )
}

const Check = (): React.ReactElement => (
  <span className="sc">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 12l5 5 9-11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
)

// ── App card ─────────────────────────────────────────────────────

function AppCard({ descriptor }: { descriptor: AppDescriptor }): React.ReactElement {
  const [open, setOpen] = useState(false)
  // Per-query participation (matches the TUI source chips): `!== false` = included
  // (default on). Reactive — `toggle_participation` flips `state.participation`
  // through the reducer, so the switch updates without re-emitting `apps:state`.
  const participating = useEngineStore((s) => s.participation[descriptor.name] !== false)
  // The toggle is ON only when the app is registry-enabled AND included. A
  // disabled app (e.g. corpus with no corpusPath) reads OFF regardless of
  // participation — the way to turn it on is to configure it (saving config
  // calls set_app_config, which enables the app engine-side).
  const included = descriptor.enabled && participating
  const props = schemaProps(descriptor)
  // The web "Search engine" UX: any app whose schema declares `tavilyKey` is
  // rendered as the built-in-SERP / Tavily selector instead of a raw key field.
  const isEngineSelector = props !== null && 'tavilyKey' in props
  const fields = isEngineSelector ? [] : fieldsOf(descriptor)
  const hasConfig = props !== null && Object.keys(props).length > 0
  return (
    <div className={`app${open ? ' open' : ''}`}>
      <div className="app-hd" onClick={() => setOpen((v) => !v)}>
        <AppIcon iconUrl={descriptor.iconUrl} />
        <span className="app-meta">
          <div className="app-name">
            {descriptor.title}
            {!descriptor.enabled && <span className="needs-setup">Needs setup</span>}
          </div>
          <div className="app-desc">{descriptor.description}</div>
        </span>
        <span
          className={`sw${included ? ' on' : ''}${descriptor.enabled ? '' : ' off'}`}
          onClick={(e) => {
            // Toggle participation without collapsing/expanding the card. Only
            // an enabled app's switch is interactive — a disabled app is turned
            // on by configuring it (expand the card + save config), so its
            // switch is inert here.
            e.stopPropagation()
            if (descriptor.enabled) {
              dispatch({ type: 'toggle_participation', name: descriptor.name })
            }
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
          {isEngineSelector ? (
            <EngineSelector descriptor={descriptor} />
          ) : fields.length > 0 ? (
            fields.map((f) => (
              <ConfigFieldRow
                key={f.key}
                appName={descriptor.name}
                config={descriptor.config}
                field={f}
              />
            ))
          ) : hasConfig ? (
            <div className="nocfg">No editable configuration.</div>
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

// Tab-cycle focusable selector — interactive elements that aren't disabled or
// removed from the tab order.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Settings({ onClose }: { onClose: () => void }): React.ReactElement {
  const apps = useEngineStore((s) => s.apps)
  const panelRef = useRef<HTMLDivElement>(null)

  // Esc closes the drawer (the scrim also closes on click), and Tab/Shift+Tab
  // is trapped within the panel so focus can't escape to the app behind it.
  // On open we focus the first focusable element; on close we restore focus to
  // whatever opened the drawer (the Settings button).
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
      <div className="panel" ref={panelRef}>
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

          <div
            style={{
              fontSize: 12.5,
              color: 'var(--ink-4)',
              lineHeight: 1.5,
              padding: '14px 2px 2px',
            }}
          >
            App changes take effect on your next run — not one already in progress.
          </div>

          <Advanced />
        </div>
      </div>
    </>
  )
}
