import React, { useEffect, useRef, useState } from 'react'
import type { AppState } from 'reasoning.run/state'
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
  // Stop-control menu (Wrap up | Halt). Only opens in the research phase, where a
  // pool exists to drain; in planning/scouting Stop halts directly.
  const [stopMenu, setStopMenu] = useState(false)
  // Research-mode lever (per-query intent). `Research` = planner → grounded
  // multi-agent (+ plan-review). `Ask` = skip the planner → a single agent gives
  // an immediate grounded answer; on a warm session it forks the trunk to dig
  // into the finished report. Default follows context: cold → Research (the
  // headline experience), warm → Ask (follow-up). Signal is scrollback length (a
  // finished report), NOT state.warm — warm is stale in the composer window (it
  // only refreshes on the next `query` event; see tui-ink Composer).
  const hasReport = state.scrollback.length > 0
  const [researchMode, setResearchMode] = useState<'research' | 'ask'>(
    hasReport ? 'ask' : 'research',
  )
  const taRef = useRef<HTMLTextAreaElement>(null)
  const stopWrapRef = useRef<HTMLDivElement>(null)
  const prevHasReport = useRef(hasReport)

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

  // Re-sync the mode default when the context flips — a first report completing
  // (cold → warm ⇒ default Ask) or a fresh session clearing scrollback (warm →
  // cold ⇒ default Research). A manual toggle sticks until the next flip.
  useEffect(() => {
    if (prevHasReport.current !== hasReport) {
      setResearchMode(hasReport ? 'ask' : 'research')
      prevHasReport.current = hasReport
    }
  }, [hasReport])

  // Close the stop menu whenever the run leaves the research phase (finished,
  // halted, or wrapped up) so a stale menu can't linger over the composer.
  useEffect(() => {
    if (state.uiPhase !== 'research') setStopMenu(false)
  }, [state.uiPhase])

  // Dismiss the stop menu on any interaction outside it — click/focus elsewhere
  // or Escape. (A fixed-position backdrop can't be used here: the composer's
  // backdrop-filter traps fixed descendants to its own box, so they never cover
  // the rest of the screen.)
  useEffect(() => {
    if (!stopMenu) return
    const onDown = (e: MouseEvent): void => {
      if (!stopWrapRef.current?.contains(e.target as Node)) setStopMenu(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setStopMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [stopMenu])

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
    else
      dispatch({
        type: 'submit_query',
        query: text,
        mode: state.mode ?? 'flat',
        skipPlanner: researchMode === 'ask',
      })
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
          <div className="stop-wrap" ref={stopWrapRef}>
            {stopMenu && state.uiPhase === 'research' && (
              <div className="stop-menu" role="menu">
                  <button
                    role="menuitem"
                    onClick={() => {
                      dispatch({ type: 'wrap_up' })
                      setStopMenu(false)
                    }}
                  >
                    <span className="sm-t">Wrap up</span>
                    <span className="sm-s">finish with what&apos;s found so far</span>
                  </button>
                  <button
                    role="menuitem"
                    className="sm-halt"
                    onClick={() => {
                      dispatch({ type: 'stop' })
                      setStopMenu(false)
                    }}
                  >
                    <span className="sm-t">Halt</span>
                    <span className="sm-s">discard this run &amp; return</span>
                  </button>
                </div>
            )}
            <button
              className="send stop"
              title={
                state.uiPhase === 'research'
                  ? 'Stop — wrap up or halt'
                  : 'Stop this run and return to the composer'
              }
              onClick={() => {
                if (state.uiPhase === 'research') setStopMenu((v) => !v)
                else dispatch({ type: 'stop' })
              }}
            >
              <IconStop />
            </button>
          </div>
        ) : (
          <button className="send" disabled={!canSubmit || !q.trim()} onClick={submit}>
            <IconSend />
          </button>
        )}
      </div>
      {!clarifying && (state.uiPhase === 'composer' || state.uiPhase === 'done') && (
        <div className="rmode" role="group" aria-label="Research mode">
          <button
            type="button"
            className={researchMode === 'research' ? 'on' : ''}
            onClick={() => setResearchMode('research')}
            title="Plan → grounded multi-agent research, with review"
          >
            Research
          </button>
          <button
            type="button"
            className={researchMode === 'ask' ? 'on' : ''}
            onClick={() => setResearchMode('ask')}
            title="One agent · an immediate grounded answer (digs into the report when following up)"
          >
            Ask
          </button>
        </div>
      )}
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
