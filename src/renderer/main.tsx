import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

// ── Phase 0 debug renderer ──
// Proves the three-process handshake: renderer ⇄ main ⇄ utility (engine).
// In Phase 3 this file mounts <App bus={…} dispatch={…}/> — the timeline UI.

type Msg = { t: string; payload?: { type?: string; seq?: number; text?: string } }

function App(): React.ReactElement {
  const [last, setLast] = useState<Msg | null>(null)
  const [log, setLog] = useState<string[]>([])

  useEffect(
    () =>
      window.reasoning.onMessage((raw) => {
        const msg = raw as Msg
        setLast(msg)
        setLog((l) => [`${new Date().toLocaleTimeString()}  ${JSON.stringify(msg)}`, ...l].slice(0, 14))
      }),
    [],
  )

  return (
    <div
      style={{
        color: '#eef1f7',
        font: '15px/1.55 -apple-system, Inter, system-ui, sans-serif',
        padding: '56px 40px',
        minHeight: '100vh',
        background:
          'radial-gradient(1200px 700px at 50% -12%, rgba(52,211,153,.09), transparent 60%), #0c0e15',
      }}
    >
      <h1 style={{ fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>
        reasoning.run <span style={{ color: '#6ee7b7' }}>· desktop</span>
      </h1>
      <p style={{ color: '#7c8493', maxWidth: 620 }}>
        Phase 0 skeleton — three-process handshake: <b>renderer ⇄ main ⇄ utility&nbsp;(engine)</b>. The engine
        heartbeats once a second; the button round-trips a command to it and back.
      </p>

      <div
        style={{
          marginTop: 20,
          padding: '14px 18px',
          borderRadius: 14,
          border: '1px solid #2a3040',
          background: 'linear-gradient(180deg, rgba(31,37,50,.5), rgba(21,25,35,.7))',
          maxWidth: 620,
        }}
      >
        <div style={{ fontSize: 12, color: '#7c8493', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          last engine message
        </div>
        <code style={{ color: '#6ee7b7', fontSize: 14 }}>{last ? JSON.stringify(last) : '— waiting —'}</code>
      </div>

      <button
        onClick={() => window.reasoning.send({ text: 'hello from renderer' })}
        style={{
          marginTop: 18,
          padding: '10px 18px',
          borderRadius: 11,
          border: 0,
          background: '#34d399',
          color: '#04241a',
          fontWeight: 650,
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        send command → engine
      </button>

      <pre style={{ marginTop: 22, color: '#9aa1b0', fontSize: 12.5, lineHeight: 1.7 }}>{log.join('\n')}</pre>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
