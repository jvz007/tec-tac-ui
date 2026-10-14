// 0.12.107: the state of the thin loading bar at the top of the window. api.js counts every request it makes (begin before
// the fetch, end when it settles, whatever the outcome). The bar shows only when a request has been in flight for about
// 300 ms, so quick calls do not flash it, and it stays up for a short minimum so it does not flicker. Core's own background
// polls pass the internal `quiet` option and never reach this file. Nothing is stored and no request changes.

export const LOADING_BAR_SHOW_AFTER_MS = 300
export const LOADING_BAR_MIN_VISIBLE_MS = 400

let inFlight = 0
let visible = false
let showTimer = null
let hideTimer = null
let shownAt = 0
const listeners = new Set()

function setVisible(value) {
  if (visible === value) return
  visible = value
  shownAt = value ? Date.now() : 0
  for (const listener of [...listeners]) {
    try { listener(value) } catch { /* one listener's error never stops the others */ }
  }
}

// True while the bar is shown.
export function loadingBarVisible() {
  return visible
}

// Calls listener(true|false) whenever the bar shows or hides. Returns the function that stops it.
export function subscribeLoadingBar(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// A request starts. The bar appears after the delay if the request is still in flight then.
export function beginLoadingRequest() {
  inFlight += 1
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  if (!visible && !showTimer) {
    showTimer = setTimeout(() => {
      showTimer = null
      if (inFlight > 0) setVisible(true)
    }, LOADING_BAR_SHOW_AFTER_MS)
  }
}

// A request settles (resolved, rejected or aborted). When none is left, the bar hides, after its minimum on-time.
export function endLoadingRequest() {
  inFlight = Math.max(0, inFlight - 1)
  if (inFlight > 0) return
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  if (!visible) return
  const remaining = LOADING_BAR_MIN_VISIBLE_MS - (Date.now() - shownAt)
  if (remaining > 0) {
    if (!hideTimer) {
      hideTimer = setTimeout(() => {
        hideTimer = null
        if (inFlight === 0) setVisible(false)
      }, remaining)
    }
    return
  }
  setVisible(false)
}
