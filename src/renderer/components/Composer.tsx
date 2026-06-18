import React, { useEffect, useState } from 'react'
import type { AppState } from '../../tui-ink/state'
import { dispatch } from '../bridge'
import { IconSend } from '../icons'

/**
 * Floating composer. Drives `submit_query` (or `submit_clarification` when the
 * planner asked questions). Mode comes from the header switch (state.mode).
 */
export function Composer({ state }: { state: AppState }): React.ReactElement {
  const [q, setQ] = useState('')

  // Seed the input from `edit_plan` (reducer sets composerPrefill via
  // ui:composer). Keyed on the prefill value: a non-empty value re-seeds the
  // box, but we don't dispatch — so a later manual edit/clear sticks until the
  // next distinct prefill arrives.
  useEffect(() => {
    if (state.composerPrefill) setQ(state.composerPrefill)
  }, [state.composerPrefill])

  const clarifying = state.uiPhase === 'clarifying'
  const canSubmit = state.uiPhase === 'composer' || state.uiPhase === 'done' || clarifying
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

  const chint = clarifying
    ? 'The planner needs a little more to route this well'
    : (state.mode ?? 'flat') === 'deep'
      ? 'Deep · tasks chain down the spine · each builds on the last'
      : 'Parallel · agents fan out from the shared context · converge at synthesis'

  return (
    <div className="composer">
      <div className="cinner">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder={placeholder}
          disabled={!canSubmit}
          autoFocus
        />
        <button className="send" disabled={!canSubmit || !q.trim()} onClick={submit}>
          <IconSend />
        </button>
      </div>
      <div className="chint">{chint}</div>
    </div>
  )
}
