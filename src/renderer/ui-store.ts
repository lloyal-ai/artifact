import { create } from 'zustand'

/**
 * Renderer-only UI navigation state — NOT engine state. The reduced `AppState`
 * is derived from the engine's `WorkflowEvent` stream and must stay pure; which
 * agent the user wants to jump to is a local view concern, so it lives here.
 *
 * `focusAgent(id)` bumps `focusNonce` so an agent card can re-trigger its
 * scroll-into-view + expand even when the same agent is focused twice in a row.
 */
interface UiNavStore {
  focusAgentId: number | null
  focusNonce: number
  focusAgent: (id: number) => void
}

export const useUiNav = create<UiNavStore>((set) => ({
  focusAgentId: null,
  focusNonce: 0,
  focusAgent: (id) => set((s) => ({ focusAgentId: id, focusNonce: s.focusNonce + 1 })),
}))
