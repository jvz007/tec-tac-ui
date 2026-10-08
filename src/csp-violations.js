// Records browser Content-Security-Policy violations so an administrator can
// read them on Troubleshooting & Diagnostics without opening DevTools. The
// securitypolicyviolation event fires in report-only mode too.
//
// Memory only: no localStorage, no sessionStorage, no token. Only the directive,
// the disposition (report or enforce), the blocked origin without path or query,
// and the route the page was on are kept.

export const CSP_VIOLATION_LIMIT = 20

// Reduce a blockedURI to something safe to show: an origin, a scheme such as
// "data:", or a keyword such as "inline" or "eval". Never a path or query.
export function blockedOrigin(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^[a-z-]+$/i.test(text)) return text.toLowerCase()
  try {
    const url = new URL(text)
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'ws:' || url.protocol === 'wss:') return url.origin
    return url.protocol
  } catch {
    return ''
  }
}

function currentRoute() {
  try {
    const hash = String(globalThis.location?.hash || '')
    const path = hash.startsWith('#/') ? hash.slice(1) : String(globalThis.location?.pathname || '')
    return path.split(/[?#]/)[0].slice(0, 200)
  } catch {
    return ''
  }
}

export function createCspViolationRecorder({ limit = CSP_VIOLATION_LIMIT, route = currentRoute, log = (line) => console.warn(line) } = {}) {
  let entries = []
  const listeners = new Set()

  function record(event) {
    try {
      const directive = String(event?.effectiveDirective || event?.violatedDirective || '').split(/\s+/)[0].slice(0, 60)
      const disposition = event?.disposition === 'enforce' ? 'enforce' : 'report'
      const blocked = blockedOrigin(event?.blockedURI)
      if (!directive && !blocked) return null
      const key = `${directive}|${disposition}|${blocked}`
      const existing = entries.find((item) => item.key === key)
      if (existing) {
        existing.count += 1
        listeners.forEach((fn) => fn(entries))
        return existing
      }
      const entry = { key, directive, disposition, blocked, route: String(route() || ''), count: 1, at: new Date().toISOString() }
      entries = [entry, ...entries].slice(0, limit)
      try {
        log(`[TEC-TAC-UI] Browser policy ${disposition === 'enforce' ? 'blocked' : 'would block'}: ${directive || 'unknown directive'} ${blocked || '(unknown)'} on ${entry.route || '/'}`)
      } catch { /* logging must never break the page */ }
      listeners.forEach((fn) => fn(entries))
      return entry
    } catch {
      return null
    }
  }

  return {
    record,
    list: () => entries.map((item) => ({ ...item })),
    clear() { entries = []; listeners.forEach((fn) => fn(entries)) },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    summary() {
      return entries
        .map((item) => `${item.at} ${item.disposition} ${item.directive} ${item.blocked || '(unknown)'} route=${item.route || '/'} count=${item.count}`)
        .join('\n')
    },
  }
}

export const cspViolations = createCspViolationRecorder()

export function installCspViolationRecorder(target = globalThis.document, recorder = cspViolations) {
  if (!target || typeof target.addEventListener !== 'function') return recorder
  target.addEventListener('securitypolicyviolation', (event) => recorder.record(event))
  return recorder
}
