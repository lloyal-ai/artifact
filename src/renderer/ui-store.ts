import { create } from 'zustand'

/**
 * Renderer-only UI navigation state — NOT engine state. The reduced `AppState`
 * is derived from the engine's `WorkflowEvent` stream and must stay pure; which
 * agent the user wants to jump to, and which inspector drawer is open, are local
 * view concerns, so they live here.
 *
 * `focusAgent(id)` bumps `focusNonce` so an agent card can re-trigger its
 * scroll-into-view + expand even when the same agent is focused twice in a row.
 *
 * The inspector `drawer` is a single multi-mode slide-over (the shell hoisted
 * out of Settings):
 *  · 'settings' — installed AgentApps + Advanced.
 *  · 'sources'  — the live cross-agent source ledger. `filterAgentId` scopes it
 *    to one agent (the footer "Sources (N)" entry); undefined = global (the
 *    header sources stat).
 */
export type DrawerMode = 'settings' | 'sources' | 'report'

/** Payload for the 'report' drawer — the right-side preview pane. */
export interface ReportPreview {
  title: string
  markdown: string
  /** Suggested PDF filename. */
  defaultName: string
}

export interface DrawerState {
  mode: DrawerMode
  filterAgentId?: number
  report?: ReportPreview
}

interface UiNavStore {
  focusAgentId: number | null
  focusNonce: number
  focusAgent: (id: number) => void
  drawer: DrawerState | null
  openDrawer: (mode: 'settings' | 'sources', filterAgentId?: number) => void
  /** Open the right-side report preview pane (with a Save-as-PDF action). */
  openReport: (report: ReportPreview) => void
  closeDrawer: () => void
}

export const useUiNav = create<UiNavStore>((set) => ({
  focusAgentId: null,
  focusNonce: 0,
  focusAgent: (id) => set((s) => ({ focusAgentId: id, focusNonce: s.focusNonce + 1 })),
  drawer: null,
  openDrawer: (mode, filterAgentId) => set({ drawer: { mode, filterAgentId } }),
  openReport: (report) => set({ drawer: { mode: 'report', report } }),
  closeDrawer: () => set({ drawer: null }),
}))
