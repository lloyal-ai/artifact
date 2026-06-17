/**
 * Browser-safe POSIX subset of `node:path` used by the shared path util.
 *
 * Aliased in for the renderer target only (see electron.vite.config.ts). Only
 * `sep` is reached at runtime in the renderer (via `shortPath`); `join`/`resolve`
 * exist solely so the namespace import resolves — `resolvePath()` runs engine-side
 * where the real `node:path` is used. The engine never sees these shims.
 */
export const sep = '/'

export function join(...parts: string[]): string {
  return parts.filter(Boolean).join('/').replace(/\/{2,}/g, '/')
}

export function resolve(...parts: string[]): string {
  return ('/' + parts.filter(Boolean).join('/')).replace(/\/{2,}/g, '/')
}
