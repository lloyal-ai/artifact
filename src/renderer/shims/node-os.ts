/**
 * Browser-safe stub of the `node:os` surface the shared path util touches.
 *
 * Aliased in for the renderer target only (see electron.vite.config.ts) so the
 * shared `reduce` graph — which transitively imports `path-utils.ts` — runs in
 * the sandboxed renderer. The renderer has no real home dir; `shortPath()` (the
 * only consumer reached here) then returns paths un-abbreviated, which is purely
 * cosmetic. The engine keeps the real `node:os` via its own esbuild bundle.
 */
export function homedir(): string {
  return ''
}
