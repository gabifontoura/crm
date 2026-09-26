/// <reference types="vite/client" />

export {}

declare global {
  interface Window {
    /**
     * Optional base URL used by the What's New page fetch calls
     * (`${apiBase}/api/releases`). When empty, the current host is used.
     */
    __API_BASE__?: string
  }
}
