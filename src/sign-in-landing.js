// 0.12.112: the sign-in landing hook (Johan, 16 October 2026). A module registers one check in register(context). After the
// modules have loaded and the entry route is replayed, the shell runs the checks once per page load, in module load order.
// The first check that answers something acts; the later ones do not run. A check returns nothing (carry on to the
// dashboards), a route path, or { dialog: '<module id>.<dialog id>' } for a dialog the module registered.
//
// createSignInLandingRegistry() is shared. forModule(moduleId, { isAbandoned }) binds one registration to one module. The
// loader calls clear() on cleanup and removeProvider() on unload, so an unloaded module's check is never called.
// runSignInLanding() takes every dependency as an argument, so the rules are testable without the shell.
//
// Import-free: no vue, no router import. The shell passes the router, requestLeave and the dialog service in.

const LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const MODULE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const DEFAULT_LANDING = new Set(['/', '/dashboards'])
const DEFAULT_TIMEOUT_MS = 30000
const POPUP_PUBLIC_SSO = /^\/(popup|public|sso)(\/|$)/i
const CATCH_ALL = /:pathMatch/

function refuse(message) {
  return Object.assign(new Error(message), { status: 0, payload: null, code: null })
}

// Control, zero-width and line-separator characters, by code point (see isJunkCode in module-dialogs.js; repeated here so this file
// stays import-free). Whitespace is refused by the route rule below.
function hasJunk(text) {
  return [...text].some((ch) => {
    const code = ch.codePointAt(0)
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || (code >= 0x200b && code <= 0x200f)
      || code === 0x2028 || code === 0x2029 || code === 0xfeff
  })
}

export function createSignInLandingRegistry() {
  // moduleId -> { moduleId, id, permission, check }. Map order is the order the modules registered in, which is load order.
  const entries = new Map()

  function forModule(moduleId, { isAbandoned } = {}) {
    const provider = String(moduleId || '')
    if (!MODULE_ID.test(provider)) throw new Error('module ID is required for the sign-in landing')
    let shut = false
    const blocked = () => shut || (typeof isAbandoned === 'function' && isAbandoned() === true)

    return Object.freeze({
      // One registration per module. A second call replaces the first.
      register(options) {
        if (blocked()) throw refuse(`module ${provider} was abandoned or unloaded; signInLanding.register() is refused`)
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
          throw new TypeError('signInLanding.register(options) needs an object with an id and a check function')
        }
        const id = typeof options.id === 'string' ? options.id : ''
        if (!LOCAL_ID.test(id)) throw new TypeError('signInLanding.register: id uses letters, digits, "_" and "-" only, at most 64 characters')
        if (typeof options.check !== 'function') throw new TypeError('signInLanding.register: check must be a function')
        if (options.permission !== undefined && options.permission !== null && typeof options.permission !== 'string') {
          throw new TypeError('signInLanding.register: permission must be a permission code (text)')
        }
        entries.set(provider, Object.freeze({
          moduleId: provider,
          id,
          permission: typeof options.permission === 'string' ? options.permission : '',
          check: options.check,
        }))
      },
      clear() {
        shut = true
        entries.delete(provider)
      },
    })
  }

  // The shell's hook for a module that is switched off while the page is open.
  function removeProvider(moduleId) {
    entries.delete(String(moduleId || ''))
  }

  // The registrations in load order, as the runner reads them.
  function list() {
    return [...entries.values()]
  }

  return Object.freeze({ forModule, removeProvider, list })
}

// A route result is accepted only when it is one plain path of this app: a single leading '/', no scheme, '//', '..', backslash,
// '#', ':' or control or whitespace characters, not under /popup/, /public/ or /sso/, a real named route (never the catch-all),
// and owned by the same module or by Core (a named route with no module).
// Returns '' when it is acceptable, or the reason it is not.
export function landingRoutePathProblem(path, moduleId, router) {
  if (typeof path !== 'string' || path === '') return 'it is not a route path'
  if (!path.startsWith('/') || path.startsWith('//')) return 'a route must start with one /'
  if (/[\\#:]/.test(path)) return 'it contains a backslash, # or :'
  if (/\s/.test(path) || hasJunk(path)) return 'it contains whitespace or a control character'
  if (path.includes('..')) return "it contains '..'"
  if (POPUP_PUBLIC_SSO.test(path)) return 'a popup, public or sso address is not a landing'
  let resolved = null
  try {
    resolved = router.resolve(path)
  } catch {
    return 'it does not resolve'
  }
  const matched = Array.isArray(resolved?.matched) ? resolved.matched : []
  const last = matched[matched.length - 1]
  if (!last) return 'no route matches it'
  if (CATCH_ALL.test(String(last.path || '')) || last.redirect) return 'it is the catch-all or a redirect, not a page'
  const owner = last.meta?.dynamicModule
  if (owner) return owner === moduleId ? '' : `it belongs to ${owner}, not ${moduleId}`
  if (last.meta?.publicModule) return 'it is a public route'
  if (last.name) return ''
  return 'it is not a named Core route'
}

// Runs one check under the time limit. A late answer is ignored; a throw or a rejection reaches the caller. A sign-out (the signal
// aborts) stops the wait at once, so a check that never answers does not hold the page.
function callWithLimit(entry, args, ms, signal) {
  return new Promise((resolve, reject) => {
    let done = false
    let timer = null
    const onAbort = () => finish(reject, Object.assign(new Error('signed out'), { aborted: true }))
    const finish = (fn, value) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      fn(value)
    }
    timer = setTimeout(() => finish(reject, Object.assign(new Error('timed out'), { timedOut: true })), ms)
    if (signal?.aborted) { onAbort(); return }
    signal?.addEventListener?.('abort', onAbort, { once: true })
    let value
    try {
      value = entry.check(args)
    } catch (error) {
      finish(reject, error)
      return
    }
    Promise.resolve(value).then((answer) => finish(resolve, answer), (error) => finish(reject, error))
  })
}

// Runs the checks once. Returns what happened, for the tests and for the shell's logs: { acted, kind, moduleId, ... } or
// { acted: false, reason }. `checks` is registry.list(); `dialogs` is the shell's dialog service (or null).
export async function runSignInLanding({
  checks = [],
  initialTarget = null,
  popup = false,
  signedIn = false,
  trusted = false,
  router,
  isDirty = () => false,
  requestLeave,
  hasPermission = () => false,
  dialogs = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal = null,
  context = null,
  warn = (...args) => console.warn(...args),
} = {}) {
  const say = (...args) => { try { warn(...args) } catch { /* a broken logger never blocks the landing */ } }
  // Gates first. A deep link, a bookmarked page, a reload on another page, a popup, a public or sso page, a signed-out page
  // and an untrusted context are never redirected.
  if (popup) return { acted: false, reason: 'popup' }
  if (!signedIn) return { acted: false, reason: 'signed-out' }
  if (!trusted) return { acted: false, reason: 'untrusted' }
  if (initialTarget !== null && !DEFAULT_LANDING.has(initialTarget)) return { acted: false, reason: 'not-default-landing' }
  if (!router || typeof requestLeave !== 'function') return { acted: false, reason: 'no-router' }

  for (const entry of checks) {
    if (signal?.aborted) return { acted: false, reason: 'signed-out' }
    if (entry.permission && !hasPermission(entry.permission)) continue

    let answer
    try {
      answer = await callWithLimit(entry, { reason: 'landing', signal, context }, timeoutMs, signal)
    } catch (error) {
      if (error?.aborted || signal?.aborted) return { acted: false, reason: 'signed-out' }
      if (error?.timedOut) say(`[TEC-TAC-UI] sign-in landing check of ${entry.moduleId} did not answer in time; ignored.`)
      else say(`[TEC-TAC-UI] sign-in landing check of ${entry.moduleId} failed; ignored.`, error?.message || error)
      continue
    }
    if (signal?.aborted) return { acted: false, reason: 'signed-out' }
    if (answer === undefined || answer === null || answer === false) continue

    if (typeof answer === 'string') {
      const problem = landingRoutePathProblem(answer, entry.moduleId, router)
      if (problem) {
        say(`[TEC-TAC-UI] sign-in landing route from ${entry.moduleId} refused: ${problem}.`)
        continue
      }
      // Unsaved changes win: a dirty page keeps the person where they are, and the landing is dropped, not retried.
      if (isDirty()) return { acted: false, reason: 'unsaved-changes', moduleId: entry.moduleId }
      requestLeave(() => { Promise.resolve(router.replace(answer)).catch((error) => say(`[TEC-TAC-UI] sign-in landing route ${answer} did not open.`, error?.message || error)) })
      return { acted: true, kind: 'route', moduleId: entry.moduleId, path: answer }
    }

    if (typeof answer === 'object' && !Array.isArray(answer) && typeof answer.dialog === 'string') {
      const fullId = answer.dialog
      const prefix = `${entry.moduleId}.`
      const local = fullId.startsWith(prefix) ? fullId.slice(prefix.length) : ''
      if (!LOCAL_ID.test(local) || !dialogs || typeof dialogs.isRegistered !== 'function' || !dialogs.isRegistered(fullId)) {
        say(`[TEC-TAC-UI] sign-in landing dialog from ${entry.moduleId} refused: it is not a dialog this module registered.`)
        continue
      }
      // Unsaved changes win for a dialog too: a dirty page is not covered by the landing, and the landing is dropped.
      if (isDirty()) return { acted: false, reason: 'unsaved-changes', moduleId: entry.moduleId }
      try {
        dialogs.openRegistered(fullId)
      } catch (error) {
        say(`[TEC-TAC-UI] sign-in landing dialog ${fullId} could not open.`, error?.message || error)
        continue
      }
      return { acted: true, kind: 'dialog', moduleId: entry.moduleId, dialog: fullId }
    }

    say(`[TEC-TAC-UI] sign-in landing check of ${entry.moduleId} returned a value the shell cannot use; ignored.`)
  }
  return { acted: false, reason: 'no-check-acted' }
}

// One run per page load, kept in memory. A second call does nothing.
export function createSignInLandingRunner() {
  let ran = false
  return async function runOnce(options) {
    if (ran) return { acted: false, reason: 'already-ran' }
    ran = true
    return runSignInLanding(options)
  }
}
