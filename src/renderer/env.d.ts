/// <reference types="vite/client" />
import type { ReasoningBridge } from '../../electron/preload'

declare global {
  interface Window {
    reasoning: ReasoningBridge
  }
}

export {}
