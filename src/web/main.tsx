import './boot' // MUST be first — installs window.reasoning before bridge.ts evaluates
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../renderer/styles.css'
import { App } from '../renderer/App'

// The web build of the Artifact renderer — the SAME centred-spine timeline as the
// Electron app, reducing the forwarded WorkflowEvent stream itself (see bridge.ts),
// but streamed over binding's `connectWss` from the served host instead of Electron IPC.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
