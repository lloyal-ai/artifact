import React from 'react'
import type { AppState, DownloadStatus } from '../../tui-ink/state'
import { dispatch } from '../bridge'
import logoUrl from '../assets/logo.png'

/** Adaptive byte formatter (GB/MB/KB), matching the TUI BootStatus. */
function fmtBytes(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB'
  if (n >= 1e6) return (n / 1e6).toFixed(0) + ' MB'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB'
  return `${n} B`
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

/**
 * One model download. Three states, mirroring the TUI `BootStatus`:
 *   · done   — ✓ + total bytes
 *   · active — ● + bar + % + got/total + serving HOST (which mirror; also
 *              proves bytes are flowing). `started` alone isn't enough — there's
 *              a window between download:start and the first download:progress
 *              where no `url` yet; gate `active` on a host so a stalled mirror
 *              switch (HF → R2) stays legible instead of reading as a freeze.
 *   · queued — ○ dim + "queued · total"  (download:plan lists both up front)
 * Role label only — no gguf model names (Artifact divergence).
 */
function DownloadLine({ d }: { d: DownloadStatus }): React.ReactElement {
  const role = d.id.includes('reranker') ? 'Loading reranker' : 'Loading model'
  const host = d.url ? hostOf(d.url) : null
  const active = d.started && host !== null && !d.done
  const state = d.done ? 'done' : active ? 'active' : 'queued'
  const pct = d.total > 0 ? Math.min(100, Math.floor((d.got / d.total) * 100)) : 0
  return (
    <div className={`dlrow ${state}`}>
      <span className="dlglyph">{d.done ? '✓' : active ? '●' : '○'}</span>
      <span className="nm">{role}</span>
      {d.done ? (
        <span className="pct">{fmtBytes(d.got)}</span>
      ) : active ? (
        <>
          <span className="dlbar">
            <i style={{ width: `${pct}%` }} />
          </span>
          <span className="pct">
            {pct}% · {fmtBytes(d.got)} / {fmtBytes(d.total)}
            {host && <span className="dlhost"> · {host}</span>}
          </span>
        </>
      ) : (
        <span className="pct">queued · {fmtBytes(d.total)}</span>
      )}
    </div>
  )
}

/**
 * Boot-error recovery: a `.gguf` path field that dispatches the existing
 * `set_model_path` / `set_reranker_path` command (per the failed component) —
 * the same retry-on-fail path the TUI's `/model` slash editor drives. Without
 * this the boot screen is a dead-end (message, no way to act).
 */
function BootRecovery({ kind }: { kind: 'llm' | 'reranker' }): React.ReactElement {
  const [path, setPath] = React.useState('')
  const submit = (): void => {
    const p = path.trim()
    if (!p) return
    dispatch(
      kind === 'llm' ? { type: 'set_model_path', path: p } : { type: 'set_reranker_path', path: p },
    )
  }
  return (
    <div className="bootrec">
      <input
        className="recinp"
        value={path}
        placeholder={`/path/to/${kind === 'llm' ? 'model' : 'reranker'}.gguf`}
        spellCheck={false}
        autoFocus
        onChange={(e) => setPath(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <div className="recacts">
        <button className="btn primary" disabled={!path.trim()} onClick={submit}>
          Load {kind === 'llm' ? 'model' : 'reranker'}
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'quit' })}>
          Quit
        </button>
      </div>
    </div>
  )
}

/** Boot / setup screen: downloading model, loading weights, or a recoverable error. */
export function Boot({ state }: { state: AppState }): React.ReactElement {
  const err = state.bootError
  const downloads = state.downloads
  return (
    <div className="boot">
      <div className="bootcard">
        <img className="logo" src={logoUrl} alt="Artifact" />
        <h1>Artifact</h1>
        <div className="sub">
          {err
            ? 'Boot failed — recover below'
            : downloads.length > 0
              ? 'Fetching local models — one time only'
              : 'Starting the local engine…'}
        </div>

        {!err && downloads.length > 0 && (
          <div>
            {downloads.map((d) => (
              <DownloadLine d={d} key={d.id} />
            ))}
          </div>
        )}

        {!err && downloads.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>
            <span className="bootspin" />
            Loading…
          </div>
        )}

        {err && (
          <>
            <div className="booterr">
              <b>{err.kind === 'llm' ? 'Model' : 'Reranker'} failed to load.</b>
              <div style={{ marginTop: 8 }}>{err.message}</div>
              <div style={{ marginTop: 12, color: 'var(--ink-3)' }}>
                Point it at a local <code>.gguf</code> to recover, or quit and retry.
              </div>
            </div>
            <BootRecovery kind={err.kind} />
          </>
        )}
      </div>
    </div>
  )
}
