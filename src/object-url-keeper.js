// 0.12.119: keeps one object URL alive long enough for the browser to take the file, then revokes it exactly once.
// Firefox and Safari can save an empty file when the URL is revoked in the same tick as click(), so the URL stays for 30 seconds
// and is revoked at once if the window closes first. Timers and revoke are passed in so node can test it with fake ones.
export const REVOKE_AFTER_MS = 30000

export function createUrlKeeper({ revoke = (url) => URL.revokeObjectURL(url), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id), delay = REVOKE_AFTER_MS } = {}) {
  let pending = ''
  let timer = null
  // Revokes the pending URL now. Safe to call again: the URL is forgotten before it is revoked, so it is revoked once.
  function flush() {
    if (timer !== null) { clearTimer(timer); timer = null }
    if (!pending) return
    const url = pending
    pending = ''
    revoke(url)
  }
  // A new download replaces the one before it, which the browser has long since taken or is no longer waiting for.
  function keep(url) {
    flush()
    if (!url) return
    pending = url
    timer = setTimer(() => { timer = null; flush() }, delay)
  }
  return { keep, flush, get pending() { return pending } }
}
