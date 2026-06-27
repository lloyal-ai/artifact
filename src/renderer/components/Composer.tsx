import React, { useEffect, useRef, useState } from 'react'
import type { AppState } from '../../tui-ink/state'
import { dispatch } from '../bridge'
import { IconSend, IconStop } from '../icons'

/**
 * Floating composer. Drives `submit_query` (or `submit_clarification` when the
 * planner asked questions). Mode comes from the header switch (state.mode).
 *
 * While a run is in flight the primary action becomes Stop — the Send button is
 * replaced in place, so there is no separate Stop control in the header.
 */
export function Composer({ state }: { state: AppState }): React.ReactElement {
  const [q, setQ] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow the textarea to its content (up to a cap, then scroll) so a
  // multi-line clarify answer — one point per line — is visible as it's typed.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 132)}px`
  }, [q])

  // Seed the input from `edit_plan` (reducer sets composerPrefill via
  // ui:composer). Keyed on the prefill value: a non-empty value re-seeds the
  // box, but we don't dispatch — so a later manual edit/clear sticks until the
  // next distinct prefill arrives.
  useEffect(() => {
    if (state.composerPrefill) setQ(state.composerPrefill)
  }, [state.composerPrefill])

  const clarifying = state.uiPhase === 'clarifying'
  // A run the user can stop is in flight (the same engine-active phases the
  // header used to gate its Stop pill on). While this holds the composer's
  // primary action becomes Stop.
  const running =
    state.uiPhase === 'discovering' || state.uiPhase === 'planning' || state.uiPhase === 'research'
  // All-apps-excluded: every known app is opted out of participation. An app is
  // included when participation[name] !== false. Submitting with zero sources
  // would research nothing — so block it. Don't block on an empty app list
  // (boot/edge case) or while clarifying (the clarify answer needs no sources).
  const noSources =
    !clarifying &&
    state.apps.length > 0 &&
    state.apps.every((a) => state.participation[a.name] === false)
  const canSubmit =
    (state.uiPhase === 'composer' || state.uiPhase === 'done' || clarifying) && !noSources
  const placeholder = clarifying
    ? 'Answer to narrow this down…'
    : state.uiPhase === 'done'
      ? 'Ask a follow-up, or steer a task…'
      : 'Ask anything — direct, or grounded multi-agent research…'

  const submit = (): void => {
    const text = q.trim()
    if (!text || !canSubmit) return
    if (clarifying) dispatch({ type: 'submit_clarification', answer: text })
    else dispatch({ type: 'submit_query', query: text, mode: state.mode ?? 'flat' })
    setQ('')
  }

  const chint = noSources
    ? 'Every app is turned off — enable at least one in Settings to research'
    : clarifying
      ? 'The planner needs a little more · Shift+Enter for a new line'
      : (state.mode ?? 'flat') === 'deep'
        ? 'Deep · tasks chain down the spine · each builds on the last'
        : ''

  return (
    <div className="composer">
      <div className="cinner">
        <textarea
          ref={taRef}
          value={q}
          rows={1}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            // Enter submits; Shift+Enter inserts a newline (e.g. one clarify
            // point per line). preventDefault stops the stray newline on the
            // submit path; Shift+Enter falls through to the textarea default.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          disabled={state.uiPhase !== 'composer' && state.uiPhase !== 'done' && !clarifying}
          autoFocus
        />
        {running ? (
          <button
            className="send stop"
            title="Stop this run and return to the composer"
            onClick={() => dispatch({ type: 'stop' })}
          >
            <IconStop />
          </button>
        ) : (
          <button className="send" disabled={!canSubmit || !q.trim()} onClick={submit}>
            <IconSend />
          </button>
        )}
      </div>
      <div className="chint">
        {chint}
        {state.corpusStatus && (
          <span
            className="cidx"
            title={`Local corpus indexed: ${state.corpusStatus.fileCount} files, ${state.corpusStatus.chunkCount} chunks`}
          >
            ◆ {state.corpusStatus.fileCount.toLocaleString()} files ·{' '}
            {state.corpusStatus.chunkCount.toLocaleString()} chunks indexed
          </span>
        )}
      </div>
      <div className="cnote">AI can make mistakes — check the cited sources.</div>
    </div>
  )
}
