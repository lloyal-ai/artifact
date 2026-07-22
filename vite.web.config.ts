import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Static web build of the Artifact renderer — the SAME `src/renderer/*` React app as
// the Electron desktop, but backed by binding's `connectWss` (see `src/web/reasoning-web.ts`)
// instead of the Electron IPC preload. `reasoning.run/{protocol,state}` (pure, node-free TS)
// + `@lloyal-labs/binding/web` (zero-dep browser) are bundled; there is no Electron
// main/preload here. `VITE_WSS_URL` (or a `?server=` query param) points at the served host.
export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'out/web'),
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'src/web/index.html') },
  },
})
