import React from 'react'
import { useEngineState } from '../bridge'
import { agentColor } from './cards'
import { collectSources, rowTier, type SourceRow } from '../sources'
import { toolIcon } from '../icons'

/**
 * The Sources inspector body — a live, deduped ledger of every source the
 * research agents cited, derived from the generic `tool_result` envelope (see
 * ../sources.ts). App-Protocol-agnostic: web pages and local (corpus-style)
 * citations render through the same row.
 *
 * Rows are per-PAGE when the tool surfaced metadata (title + snippet + exact
 * URL, already returned by web search/fetch), else per-host/local.
 *
 * Privacy guard: the avatar renders a thumbnail/favicon ONLY for LOCAL refs
 * (data:/file:/absolute path). A remote http(s) image is never loaded by the
 * renderer — that would leak to the source's CDN on display. The engine is
 * responsible for localizing og:image/favicon bytes (Stage 2); until then rows
 * fall back to a colored letter-tile. So nothing here phones home.
 *
 * `filterAgentId` scopes the ledger to a single agent (the card footer entry).
 */

function isLocalRef(s: string | undefined): s is string {
  return !!s && /^(data:|file:|\/)/.test(s)
}

const FolderGlyph = (): React.ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}>
    <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" strokeLinejoin="round" />
  </svg>
)

/** Avatar: local og:image thumbnail → local favicon → tool/letter tile. */
function Avatar({ row }: { row: SourceRow }): React.ReactElement {
  if (isLocalRef(row.image)) {
    return (
      <span className="srow-thumb">
        <img src={row.image} alt="" />
      </span>
    )
  }
  const color = agentColor(row.colorIdx)
  if (isLocalRef(row.icon)) {
    return (
      <span className="srow-ic" style={{ color }}>
        <img className="srow-fav" src={row.icon} alt="" />
      </span>
    )
  }
  if (row.kind === 'local') {
    return (
      <span className="srow-ic" style={{ color }}>
        <FolderGlyph />
      </span>
    )
  }
  // Letter tile from the host initial (search/fetch with no local image).
  const seed = row.host || row.label || '?'
  const letter = seed.replace(/^https?:\/\//, '').charAt(0).toUpperCase() || '?'
  // No host metadata at all → fall back to the tool glyph.
  if (!row.host) {
    const Ic = toolIcon(row.tool)
    return (
      <span className="srow-ic" style={{ color }}>
        <Ic />
      </span>
    )
  }
  return (
    <span className="srow-ic letter" style={{ color }}>
      {letter}
    </span>
  )
}

function Row({ row }: { row: SourceRow }): React.ReactElement {
  // The only pill is "Cited" — shown when the source made it into the answer.
  // Which task found it is noise here; the grouping + snippet already carry
  // the weight, so non-cited rows wear no pill.
  const badge = row.cited ? (
    <span className="srow-tasks">
      <span className="stask cited" title="Cited in your answer">
        Cited
      </span>
    </span>
  ) : null
  const inner = (
    <>
      <Avatar row={row} />
      <span className="srow-main">
        <span className="srow-top">
          <span className="srow-label">{row.label}</span>
          {badge}
        </span>
        {row.host && row.host !== row.label && <span className="srow-host">{row.host}</span>}
        {row.snippet && <span className="srow-snippet">{row.snippet}</span>}
      </span>
    </>
  )
  if (row.kind === 'web' && row.url) {
    return (
      <button
        className="srow web"
        title={`Open ${row.host ?? row.label}`}
        onClick={() => window.reasoning.openExternal(row.url!)}
      >
        {inner}
      </button>
    )
  }
  return (
    <div className="srow local" title="Local source">
      {inner}
    </div>
  )
}

function Section({
  heading,
  sub,
  rows,
}: {
  heading: string
  sub: string
  rows: SourceRow[]
}): React.ReactElement | null {
  if (rows.length === 0) return null
  return (
    <>
      <div className="srcsec">
        <span className="srcsec-h">{heading}</span>
        <span className="srcsec-n">{rows.length}</span>
        <span className="srcsec-s">{sub}</span>
      </div>
      {rows.map((row) => (
        <Row row={row} key={row.key} />
      ))}
    </>
  )
}

export function SourcesBody({ filterAgentId }: { filterAgentId?: number }): React.ReactElement {
  const state = useEngineState()
  const rows = collectSources(state, filterAgentId)

  if (rows.length === 0) {
    // During the probe/recon phase the header source count climbs (the probe is
    // mapping coverage), but the ledger only fills once research agents cite
    // sources — so set that expectation explicitly instead of reading as empty.
    const probing = state.phase === 'recon' || state.uiPhase === 'discovering'
    return (
      <div className="srcledger-empty">
        {probing
          ? 'Mapping coverage — sources will appear here once research begins, each traceable to the task that cited it.'
          : 'Sources the agents cite will appear here — each one traceable to the task that found it.'}
      </div>
    )
  }
  // Grouped: "Featured" (the agent opened it, or it's cited in the answer) vs
  // "Surveyed" (only seen in search). rowTier folds fetched + cited together.
  const featured = rows.filter((r) => rowTier(r) === 'featured')
  const surveyed = rows.filter((r) => rowTier(r) === 'surveyed')
  return (
    <div className="srcledger">
      <div className="srcledger-count">
        {rows.length} {rows.length === 1 ? 'source' : 'sources'}
        {filterAgentId != null ? ' · this agent' : ''}
      </div>
      <Section
        heading="Featured"
        sub="opened by the agent, or cited in your answer"
        rows={featured}
      />
      <Section heading="Surveyed" sub="also seen while researching" rows={surveyed} />
    </div>
  )
}
