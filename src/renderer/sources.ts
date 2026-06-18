import type { AgentRuntime, AppState, SourceMeta } from '../tui-ink/state'

/**
 * Cross-agent source ledger — derived from the `tool_result` envelope, which
 * stays App-Protocol-agnostic (the protocol prescribes no result schema; the
 * reducer extracts per-source metadata consumer-side in `summarizeResult`).
 *
 * Two row granularities, best-available:
 *   · PAGE — when the tool surfaced per-source metadata (`sources[]`: web
 *     search/fetch already give url+title+snippet; image/icon arrive with web
 *     ≥1.2.0). Keyed by URL → a real page row: title + snippet + favicon/og
 *     thumbnail + click-through to the exact URL.
 *   · HOST/LOCAL — fallback for tools that only expose `hosts` (legacy) or a
 *     host-less `preview` (corpus-style). Keyed by host or tool+preview.
 *
 * Rows merge across every citing agent, collecting the task indices that cite
 * them so the drawer can show "Task 1 · Task 3".
 */
export interface SourceRow {
  /** Dedupe key: url (page), host (legacy), or `${tool}|${preview}` (local). */
  key: string
  kind: 'web' | 'local'
  /** Primary line: page title, else host, else preview. */
  label: string
  /** Display host (small secondary line), when known. */
  host: string | null
  /** Description / snippet line, when known. */
  snippet: string | null
  /** og:image URL (or local cache ref) — a thumbnail when present. */
  image?: string
  /** favicon URL — a small icon when present. */
  icon?: string
  /** Open target for web rows; null for local rows. */
  url: string | null
  tool: string
  /** True when ANY citation came from a content-open tool (fetch_page /
   *  read_file) — i.e. the agent opened this source, not just saw it in search.
   *  Drives the "Read closely" vs "Surveyed" grouping. Free signal — the tool
   *  is in every tool_result. */
  fetched: boolean
  /** True when the source's title/snippet appears (quoted) in the final answer
   *  — best-effort title match (the report cites titles, not URLs). Renders a
   *  ★. Computed in `collectSources` from `state.answer`. */
  cited: boolean
  /** Citing research-task indices (sorted, unique). */
  tasks: number[]
  /** Color index = first citing task index. */
  colorIdx: number
}

/** Content-open tools: the agent fetched/read the source rather than just
 *  seeing it in a search result. */
function isFetchTool(tool: string): boolean {
  return /fetch|read/i.test(tool)
}

/** The per-agent source rows (used by the card-footer count + merged by
 *  `collectSources`). */
export function agentSourceRows(agent: AgentRuntime): SourceRow[] {
  const rows = new Map<string, SourceRow>()
  const taskIdx = agent.taskIndex ?? 0
  for (const it of agent.timeline) {
    if (it.kind !== 'tool_result') continue

    if (it.sources && it.sources.length > 0) {
      for (const s of it.sources) addPageRow(rows, s, it.tool, taskIdx)
      continue
    }
    // Fallbacks for tools without per-source metadata.
    if (it.hosts.length > 0) {
      for (const host of it.hosts) {
        upsert(rows, {
          key: host,
          kind: 'web',
          label: host,
          host,
          snippet: it.preview,
          url: 'https://' + host,
          tool: it.tool,
          fetched: isFetchTool(it.tool),
          cited: false,
          tasks: [taskIdx],
          colorIdx: taskIdx,
        })
      }
    } else if (it.preview) {
      upsert(rows, {
        key: `${it.tool}|${it.preview}`,
        kind: 'local',
        label: it.preview,
        host: null,
        snippet: null,
        url: null,
        tool: it.tool,
        fetched: isFetchTool(it.tool),
        cited: false,
        tasks: [taskIdx],
        colorIdx: taskIdx,
      })
    }
  }
  return [...rows.values()]
}

function addPageRow(
  rows: Map<string, SourceRow>,
  s: SourceMeta,
  tool: string,
  taskIdx: number,
): void {
  const url = s.url ?? null
  const host = s.host ?? (url ? hostOf(url) : null)
  const label = s.title || host || url || tool
  upsert(rows, {
    key: url ?? `${tool}|${label}`,
    kind: url ? 'web' : 'local',
    label,
    host,
    snippet: s.snippet ?? null,
    image: s.image,
    icon: s.icon,
    url,
    tool,
    fetched: isFetchTool(tool),
    cited: false,
    tasks: [taskIdx],
    colorIdx: taskIdx,
  })
}

/** Quoted titles in the final answer — the report cites page titles in quotes
 *  (not URLs), so this is how we detect "cited in your answer". Lowercased,
 *  length-gated to avoid matching trivial quotes. */
function citedTitles(answer: string | null): string[] {
  if (!answer) return []
  const out: string[] = []
  for (const m of answer.matchAll(/[""„"](.+?)[""""]|"(.+?)"/g)) {
    const t = (m[1] ?? m[2] ?? '').trim().toLowerCase()
    if (t.length >= 12) out.push(t)
  }
  return out
}

/** A row is cited if a quoted answer-title contains (or is contained by) its
 *  title or snippet. Fuzzy by design — titles can be lightly reworded. */
function rowCited(row: SourceRow, titles: string[]): boolean {
  const hay = [row.label, row.snippet].filter(Boolean).map((s) => s!.toLowerCase())
  return titles.some((t) => hay.some((h) => h.length >= 12 && (t.includes(h) || h.includes(t))))
}

/** Ranking tier for the grouped ledger: featured (the agent opened it, or it's
 *  cited in the answer) vs surveyed (only seen in search). */
export function rowTier(row: SourceRow): 'featured' | 'surveyed' {
  return row.fetched || row.cited ? 'featured' : 'surveyed'
}

/** The full, deduped cross-agent ledger. `filterAgentId` scopes it to a single
 *  agent (the card footer's "Sources (N)" entry). */
export function collectSources(state: AppState, filterAgentId?: number): SourceRow[] {
  const merged = new Map<string, SourceRow>()
  for (const agent of researchAgents(state)) {
    if (filterAgentId != null && agent.id !== filterAgentId) continue
    for (const row of agentSourceRows(agent)) upsert(merged, row)
  }
  const titles = citedTitles(state.answer)
  const rows = [...merged.values()]
  for (const r of rows) r.cited = rowCited(r, titles)
  // Featured first (fetched/cited), then surveyed; cited above merely-read;
  // web before local; stable by label within.
  const rank = (r: SourceRow): number => (r.cited ? 0 : r.fetched ? 1 : 2)
  return rows.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    if (a.kind !== b.kind) return a.kind === 'web' ? -1 : 1
    return a.label.localeCompare(b.label)
  })
}

/** The canonical research-agent set for the current run: live agents
 *  (researchAgentIds) plus the finished snapshots in scrollback, deduped by id
 *  and filtered to THIS run via `s.agents.has`. Mirrors Timeline's merge. */
function researchAgents(s: AppState): AgentRuntime[] {
  const byId = new Map<number, AgentRuntime>()
  for (const id of s.researchAgentIds) {
    const a = s.agents.get(id)
    if (a) byId.set(a.id, a)
  }
  for (const it of s.scrollback) {
    if (it.kind === 'agent' && s.agents.has(it.agent.id)) byId.set(it.agent.id, it.agent)
  }
  return [...byId.values()].sort((a, b) => (a.taskIndex ?? 0) - (b.taskIndex ?? 0))
}

function upsert(map: Map<string, SourceRow>, row: SourceRow): void {
  const existing = map.get(row.key)
  if (!existing) {
    map.set(row.key, { ...row, tasks: [...row.tasks] })
    return
  }
  for (const t of row.tasks) if (!existing.tasks.includes(t)) existing.tasks.push(t)
  existing.tasks.sort((a, b) => a - b)
  existing.colorIdx = existing.tasks[0]
  // A source is "fetched" if ANY citation opened it (searched-then-fetched).
  existing.fetched = existing.fetched || row.fetched
  // Backfill richer fields from a later citation.
  if (!existing.snippet && row.snippet) existing.snippet = row.snippet
  if (!existing.image && row.image) existing.image = row.image
  if (!existing.icon && row.icon) existing.icon = row.icon
  if (!existing.host && row.host) existing.host = row.host
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
