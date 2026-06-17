import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { dispatch, useEngineState } from './bridge'

// ── Phase 1 debug renderer ──
// Renders the real harness AppState reduced renderer-side from the forwarded
// raw WorkflowEvent stream (engine → main forwards → renderer runs `reduce`).
// Phase 3 replaces this with the centred-spine timeline; this proves the
// engine + EventChannel + renderer-side reducer are live.

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'

function Row({ k, v }: { k: string; v: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '3px 0' }}>
      <span style={{ color: '#6a7180', width: 130, flex: 'none' }}>{k}</span>
      <span style={{ color: '#cdd2dc', fontFamily: mono, fontSize: 13 }}>{v}</span>
    </div>
  )
}

function App(): React.ReactElement {
  const s = useEngineState()
  const [q, setQ] = useState('What is the lloyal HDK?')
  const [mode, setMode] = useState<'flat' | 'deep'>('flat')

  // Proves the renderer reduces the forwarded stream itself (RR_DEBUG captures it).
  useEffect(() => {
    console.log('uiPhase:', s.uiPhase, '· phase:', s.phase)
  }, [s.uiPhase, s.phase])

  const agents = s.agents instanceof Map ? s.agents.size : 0
  const downloads = s.downloads ?? []
  const canSubmit = s.uiPhase === 'composer' || s.uiPhase === 'done'

  return (
    <div
      style={{
        color: '#eef1f7',
        font: '15px/1.55 -apple-system, Inter, system-ui, sans-serif',
        padding: '52px 40px 80px',
        minHeight: '100vh',
        background:
          'radial-gradient(1200px 700px at 50% -12%, rgba(52,211,153,.08), transparent 60%), #0c0e15',
      }}
    >
      <h1 style={{ fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>
        reasoning.run <span style={{ color: '#6ee7b7' }}>· desktop</span>{' '}
        <span style={{ fontSize: 13, color: '#565e6e', fontWeight: 500 }}>Phase 1 · live engine bridge</span>
      </h1>

      <div
        style={{
          marginTop: 22,
          padding: '16px 20px',
          borderRadius: 14,
          border: '1px solid #2a3040',
          background: 'linear-gradient(180deg, rgba(31,37,50,.45), rgba(21,25,35,.7))',
          maxWidth: 760,
        }}
      >
        <Row k="uiPhase" v={<b style={{ color: '#6ee7b7' }}>{s.uiPhase}</b>} />
        <Row k="phase" v={s.phase} />
        {s.loadingLabel && <Row k="loading" v={s.loadingLabel} />}
        {s.config && (
          <>
            <Row k="model" v={s.config.model?.path ?? '(default)'} />
            <Row k="reranker" v={s.config.model?.reranker ?? '(default)'} />
            <Row k="corpus" v={s.config.sources?.corpusPath ?? '—'} />
            <Row k="output" v={s.config.sources?.outputDir ?? '—'} />
          </>
        )}
        {downloads.length > 0 && (
          <Row
            k="downloads"
            v={downloads
              .map((d) => `${d.label}: ${(d.got / 1e9).toFixed(2)}/${(d.total / 1e9).toFixed(2)}GB`)
              .join('  ·  ')}
          />
        )}
        {s.corpusStatus && <Row k="corpus idx" v={`${s.corpusStatus.fileCount} files · ${s.corpusStatus.chunkCount} chunks`} />}
        {s.bootError && <Row k="boot error" v={<span style={{ color: '#fb7185' }}>{s.bootError.kind}: {s.bootError.message}</span>} />}
        <Row k="agents" v={`${agents} active · ${s.sourceCount ?? 0} sources`} />
        {s.plan && (
          <Row
            k="plan"
            v={`${s.plan.intent} · ${s.plan.tasks.length} tasks${s.plan.clarifyQuestions.length ? ` · ${s.plan.clarifyQuestions.length} clarify` : ''}`}
          />
        )}
        {s.pressure && <Row k="KV" v={`${s.pressure.pct}% · ${s.pressure.cellsUsed}/${s.pressure.nCtx}`} />}
        {s.answer && <Row k="answer" v={<span style={{ color: '#a0a6b2' }}>{s.answer.slice(0, 160)}…</span>} />}
      </div>

      {s.plan && s.plan.tasks.length > 0 && (
        <ol style={{ maxWidth: 760, color: '#a0a6b2', fontSize: 13.5, marginTop: 16, lineHeight: 1.6 }}>
          {s.plan.tasks.map((t, i) => (
            <li key={i}>
              {t.description} {t.app && <span style={{ color: '#6ee7b7' }}>[{t.app}]</span>}
            </li>
          ))}
        </ol>
      )}

      <div style={{ marginTop: 24, display: 'flex', gap: 10, maxWidth: 760, alignItems: 'center' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ask anything…"
          style={{
            flex: 1,
            padding: '11px 14px',
            borderRadius: 11,
            border: '1px solid #2a3040',
            background: '#141519',
            color: '#eef1f7',
            fontSize: 15,
            outline: 'none',
          }}
        />
        <select value={mode} onChange={(e) => setMode(e.target.value as 'flat' | 'deep')} style={{ padding: '10px', borderRadius: 10, background: '#141519', color: '#eef1f7', border: '1px solid #2a3040' }}>
          <option value="flat">Parallel</option>
          <option value="deep">Deep</option>
        </select>
        <button
          disabled={!canSubmit}
          onClick={() => dispatch({ type: 'submit_query', query: q, mode })}
          style={{
            padding: '11px 18px',
            borderRadius: 11,
            border: 0,
            background: canSubmit ? '#34d399' : '#222634',
            color: canSubmit ? '#04241a' : '#565e6e',
            fontWeight: 650,
            fontSize: 14,
            cursor: canSubmit ? 'pointer' : 'default',
          }}
        >
          submit_query →
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
