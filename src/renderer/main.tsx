import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'

// Phase 3 — the centred-spine timeline. The renderer reduces the forwarded
// WorkflowEvent stream itself (see bridge.ts) and renders the run as a timeline.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
