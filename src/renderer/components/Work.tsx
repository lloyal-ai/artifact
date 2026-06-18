import React from 'react'
import type { AgentRuntime, TimelineItem } from '../../tui-ink/state'
import { IconThink, toolIcon } from '../icons'

// Maps an agent's chronological `timeline` into the mock's work-rows + source
// chips. Pairs each tool_call with its tool_result (via callId) so the verb and
// its "✓ N results" meta render on one row, exactly like design/research-timeline.

function toolVerb(tool: string, done: boolean): string {
  if (/search/i.test(tool)) return done ? 'Searched' : 'Searching'
  return done ? 'Read' : 'Reading'
}

function resultMeta(r: Extract<TimelineItem, { kind: 'tool_result' }>): string {
  const head =
    r.resultCount != null ? `${r.resultCount} results` : `${(r.byteLength / 1000).toFixed(1)} kb`
  const hosts = r.hosts.slice(0, 2).join(' · ')
  return hosts ? `${head} · ${hosts}` : head
}

export function WorkRows({ agent }: { agent: AgentRuntime }): React.ReactElement {
  const resultByCall = new Map<number, Extract<TimelineItem, { kind: 'tool_result' }>>()
  for (const it of agent.timeline) {
    if (it.kind === 'tool_result' && it.callId != null) resultByCall.set(it.callId, it)
  }
  const pairedResults = new Set<number>()

  const rows: React.ReactElement[] = []
  for (const it of agent.timeline) {
    if (it.kind === 'think') {
      rows.push(
        <div className="wrow live" key={it.id}>
          <span className="wic">
            <IconThink />
          </span>
          <div className="wbody">
            <div className="wverb">
              <span className="k">{it.live ? 'Thinking' : 'Thought'}</span>
            </div>
            <div className="wthink">
              {it.body}
              {it.live && <span className="caret" />}
            </div>
          </div>
        </div>,
      )
    } else if (it.kind === 'tool_call') {
      const res = resultByCall.get(it.id)
      if (res) pairedResults.add(res.id)
      const done = !!res
      const Ic = toolIcon(it.tool)
      rows.push(
        <div className={`wrow ${done ? 'done' : 'live'}`} key={it.id}>
          <span className="wic">
            <Ic />
          </span>
          <div className="wbody">
            <div className="wverb">
              <span className="k">{toolVerb(it.tool, done)}</span>{' '}
              <span className="q">{it.argsSummary}</span>
              {!done && !agent.retry && <span className="caret" />}
            </div>
            {res && (
              <div className="wmeta">
                <span className="ok">✓</span> {resultMeta(res)}
              </div>
            )}
            {!done && agent.retry && agent.retry.tool === it.tool && (
              <div className="retry">
                ⟲ rate-limited — retrying in ~
                {Math.max(0, Math.round((agent.retry.retryAt - Date.now()) / 1000))}s
              </div>
            )}
          </div>
        </div>,
      )
    }
    // standalone tool_result (no matching call) and report are not work rows.
  }

  return <div className="work">{rows}</div>
}

export function SourceChips({ agent }: { agent: AgentRuntime }): React.ReactElement | null {
  const hosts: string[] = []
  for (const it of agent.timeline) {
    if (it.kind === 'tool_result') {
      for (const h of it.hosts) if (!hosts.includes(h)) hosts.push(h)
    }
  }
  if (hosts.length === 0) return null
  return (
    <div className="csrc">
      {hosts.slice(0, 8).map((h) => (
        <span
          className="srcchip"
          key={h}
          title={h}
          onClick={() => window.reasoning.openExternal('https://' + h)}
        >
          <span className="host">{h}</span>
        </span>
      ))}
    </div>
  )
}
