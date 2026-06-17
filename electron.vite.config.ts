import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Three build targets:
//  · main     → out/main/{index,engine-host}.js   (Electron main process + the
//               engine that runs in a utilityProcess; deps externalized so the
//               native lloyal.node addon is require'd, never bundled)
//  · preload  → out/preload/index.js               (contextBridge → window.reasoning)
//  · renderer → out/renderer/                       (Vite React-DOM app; the timeline UI)
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts'),
          'engine-host': resolve(__dirname, 'electron/engine-host.ts'),
        },
      },
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
