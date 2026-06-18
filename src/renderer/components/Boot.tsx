import React from 'react'
import type { AppState } from '../../tui-ink/state'
import { dispatch } from '../bridge'

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
        <div className="logo">R</div>
        <h1>reasoning.run</h1>
        <div className="sub">
          {err
            ? 'Boot failed — recover below'
            : downloads.length > 0
              ? 'Fetching local models — one time only'
              : state.loadingLabel ?? 'Starting the local engine…'}
        </div>

        {!err && downloads.length > 0 && (
          <div>
            {downloads.map((d) => {
              const pct = d.total > 0 ? Math.round((100 * d.got) / d.total) : 0
              return (
                <div className="dlrow" key={d.id}>
                  <span className="nm">{d.label}</span>
                  <span className="dlbar">
                    <i style={{ width: `${pct}%` }} />
                  </span>
                  <span className="pct">
                    {(d.got / 1e9).toFixed(2)}/{(d.total / 1e9).toFixed(2)} GB
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {!err && downloads.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>
            <span className="bootspin" />
            {state.loadingLabel ?? 'Loading…'}
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
