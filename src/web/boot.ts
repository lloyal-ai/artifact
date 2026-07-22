/**
 * Side-effect module: installs the web `window.reasoning` BEFORE the renderer's
 * `bridge.ts` evaluates. `main.tsx` imports this FIRST (ES modules evaluate imports
 * depth-first in source order), so `window.reasoning` exists by the time
 * `../renderer/App` — and its transitive `bridge.ts` `connectEngine()` — runs.
 */
import { installWebBridge } from './reasoning-web'

installWebBridge()
