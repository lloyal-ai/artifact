import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Three build targets:
//  · main     → out/main/index.js    (Electron main process. BUNDLES reasoning.run's
//               node-free `./state`+`./protocol` — transpiled at build time (see the
//               detailed note below); the native lloyal.node addon stays external+require'd.
//               At RUNTIME main FORKS reasoning.run's prebuilt `bin/run.js` engine over IPC
//               — a child process, not a bundled import.)
//  · preload  → out/preload/index.js (contextBridge → window.reasoning)
//  · renderer → out/renderer/        (Vite React-DOM app; the timeline UI. Bundles
//               reasoning.run/{state,protocol} — pure, node-free TS — for the shared reduce)
export default defineConfig({
  main: {
    // reasoning.run's `.`/`./protocol`/`./state` exports are TS source (its `.`
    // also pulls `.eta`), so it must be BUNDLED (transpiled at build time), NOT
    // externalized+require'd at runtime — Electron's Node can't strip types under
    // node_modules. `main` only imports the node-free `reduce` + protocol types
    // (no `.eta`, no native), so bundling it is clean. Everything else (the native
    // lloyal.node addon etc.) stays external.
    plugins: [externalizeDepsPlugin({ exclude: ['reasoning.run'] })],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'electron/main.ts') } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve(__dirname, 'electron/preload.ts') } } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
})
