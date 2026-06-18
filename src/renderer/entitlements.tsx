import React from 'react'
import type { AppState } from '../tui-ink/state'

/**
 * The four signed entitlement keys (publish-worker `ENTITLEMENTS`, schema-
 * enforced) rendered as live status chips. Every one is inferable the same way:
 * an in-flight tool call belongs to an app that declared the entitlement, so the
 * call IS the entitlement in use. `network` / `data-egress` collapse — egress
 * implies network, so an app that declares egress shows the (stronger) egress
 * chip and never a redundant Network chip. Palette tones: Network = blue (Wi-Fi,
 * "reaching the internet"); data egress = amber (up-arrow, "your data leaving");
 * local files = violet; credentials = rose. Never red — "caution, in use", not
 * "alarm". The same `EntChip` renders in the toolbar (live) and the Welcome
 * legend (key), so they match.
 */
export const ENT_ORDER = ['data-egress', 'network', 'local-files', 'credentials'] as const
export type EntKey = (typeof ENT_ORDER)[number]

export const ENT_CHIP: Record<EntKey, { label: string; tone: 'wifi' | 'egress' | 'files' | 'creds'; title: string }> = {
  'data-egress': {
    label: 'Potential data egress',
    tone: 'egress',
    title: 'A reviewed app is reaching the internet on your behalf — your data could be leaving the device',
  },
  network: {
    label: 'Network',
    tone: 'wifi',
    title: 'A reviewed app is reaching the internet (it does not declare sending your data out)',
  },
  'local-files': {
    label: 'Local files',
    tone: 'files',
    title: 'An app is reading files on your device — nothing leaves the device',
  },
  credentials: {
    label: 'Credentials',
    tone: 'creds',
    title: 'An app is using an account you connected',
  },
}

function EntIcon({ kind }: { kind: EntKey }): React.ReactElement {
  const common = {
    className: 'ic',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (kind === 'network') {
    // Wi-Fi — reaching the internet (browsing, not necessarily egressing).
    return (
      <svg {...common}>
        <path d="M1.4 8.6a16 16 0 0 1 21.2 0" />
        <path d="M5 12.2a11 11 0 0 1 14 0" />
        <path d="M8.5 15.7a6 6 0 0 1 7 0" />
        <line x1="12" y1="19.3" x2="12.01" y2="19.3" />
      </svg>
    )
  }
  if (kind === 'local-files') {
    return (
      <svg {...common}>
        <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      </svg>
    )
  }
  if (kind === 'credentials') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="4" />
        <path d="M11 11l8 8M16 16l2-2M19 19l2-2" />
      </svg>
    )
  }
  // data-egress — upward arrow = your data leaving the device
  return (
    <svg {...common} strokeWidth={2.2}>
      <path d="M12 19V6M6 12l6-6 6 6" />
    </svg>
  )
}

/** One entitlement chip — identical in the live toolbar and the Welcome legend. */
export function EntChip({ kind }: { kind: EntKey }): React.ReactElement {
  const c = ENT_CHIP[kind]
  return (
    <span className={`actchip ${c.tone}`} title={c.title}>
      <EntIcon kind={kind} />
      <b>{c.label}</b>
    </span>
  )
}

/**
 * The set of entitlement keys in use RIGHT NOW: for every non-done agent with an
 * in-flight tool call (a `tool_call` with no matching `tool_result` by callId),
 * the owning app's declared entitlements. `data-egress` supersedes `network` for
 * the same app, so the two never double-show.
 */
export function activeEntitlements(state: AppState): Set<EntKey> {
  const toolEnts = new Map<string, readonly string[]>()
  for (const app of state.apps) for (const t of app.tools) toolEnts.set(t, app.entitlements)

  const out = new Set<EntKey>()
  for (const a of state.agents.values()) {
    if (a.phase === 'done') continue
    const resolved = new Set<number>()
    for (const it of a.timeline) if (it.kind === 'tool_result' && it.callId != null) resolved.add(it.callId)
    for (const it of a.timeline) {
      if (it.kind !== 'tool_call' || resolved.has(it.id)) continue
      const ents = toolEnts.get(it.tool)
      if (!ents) continue
      if (ents.includes('data-egress')) out.add('data-egress')
      else if (ents.includes('network')) out.add('network')
      if (ents.includes('local-files')) out.add('local-files')
      if (ents.includes('credentials')) out.add('credentials')
    }
  }
  return out
}
