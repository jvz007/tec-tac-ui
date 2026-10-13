// 0.12.101: the load phase of an access panel (API keys, single sign-on). The first load shows the Loading line and nothing
// else. A later load keeps the page mounted, so an open editor, a one-time key or a provider dialog survives it, and marks
// the page refreshing: the list controls wait. A denied or failed result still replaces the page, as before.
export function createLoadPhase() {
  return { loaded: false, loading: true, refreshing: false }
}

export function startLoadPhase(phase) {
  phase.loading = !phase.loaded
  phase.refreshing = phase.loaded
  return phase
}

export function finishLoadPhase(phase) {
  phase.loaded = true
  phase.loading = false
  phase.refreshing = false
  return phase
}
