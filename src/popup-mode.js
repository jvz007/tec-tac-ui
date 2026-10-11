// Popup (chromeless) mode (0.12.95). A module's pop-out window opens at /tec-tac/#/popup/<moduleId>/<module route path>,
// for example /tec-tac/#/popup/take-control/take-control/12/vnc. The shell uses hash history, so no server change is needed.
// This file is pure: no imports and no DOM. main.js, module-loader.js and App.vue use it.

export const POPUP_HASH_PREFIX = '#/popup/'
export const POPUP_REFUSED_PATH = '/popup/refused'
export const POPUP_MESSAGE_UNAVAILABLE = 'This page is not available to you.'
export const POPUP_MESSAGE_NOT_POPUP = 'This page cannot open in its own window.'

const MODULE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
// One definition of junk, as in module-loader.js: C0 and C1 controls, DEL, zero-width and line-separator characters.
const JUNK_PATTERN = new RegExp('[\x00-\x1f\x7f-\x9f' + String.fromCharCode(0x200b) + '-' + String.fromCharCode(0x200f, 0x2028, 0x2029, 0xfeff) + ']')
const MAX_DEPTH = 16

// Decodes %XX sequences until nothing changes (bounded). Null when the bound is hit, so the caller refuses.
function decodeToFixedPoint(text) {
  let current = text
  for (let i = 0; i < 8; i += 1) {
    const next = current.replace(/%([0-9a-f]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    if (next === current) return current
    current = next
  }
  return null
}

// A concrete route path with no junk, no backslash, no query or fragment, and no '.', '..' or empty segment.
// Returns the decoded path, or null when it cannot be read safely.
function safePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return null
  const decoded = decodeToFixedPoint(path)
  if (decoded === null || JUNK_PATTERN.test(decoded)) return null
  if (/[\\?#]/.test(decoded)) return null
  const segments = decoded.slice(1).split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  return decoded
}

// { moduleId, path } from a popup hash, or null for anything else. A junk, encoded '..' or empty id or path is null.
export function parsePopupHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(POPUP_HASH_PREFIX)) return null
  const decoded = decodeToFixedPoint(hash.slice(1))
  if (decoded === null || JUNK_PATTERN.test(decoded) || /[\\?#]/.test(decoded)) return null
  const segments = decoded.split('/')
  // segments: ['', 'popup', <moduleId>, ...route path segments]
  if (segments[0] !== '' || segments[1] !== 'popup') return null
  const moduleId = segments[2] || ''
  if (!MODULE_ID_PATTERN.test(moduleId)) return null
  const rest = segments.slice(3)
  if (!rest.length || rest.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  return { moduleId, path: `/${rest.join('/')}` }
}

// The router path a module route is also reachable at in popup mode: /popup/<moduleId><route path>.
// '' when the id or the route path is not one this helper can build.
export function popupAliasPath(moduleId, path) {
  if (typeof moduleId !== 'string' || !MODULE_ID_PATTERN.test(moduleId)) return ''
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('..') || /[\\?#\s]/.test(path)) return ''
  return `/popup/${moduleId}${path}`
}

// The absolute URL of a module's popup window. The id is the calling module's, so a path cannot point at another
// module's popup. A path starting with 'popup' is refused for the same reason. '' for any path it cannot build safely.
export function popupHref(moduleId, path, origin = '') {
  if (typeof moduleId !== 'string' || !MODULE_ID_PATTERN.test(moduleId)) return ''
  const safe = safePath(path)
  if (safe === null || safe.split('/')[1] === 'popup') return ''
  if (typeof origin !== 'string') return ''
  return `${origin}/tec-tac/${POPUP_HASH_PREFIX}${moduleId}${safe}`
}

// Hard dependency ids of a descriptor. The sync script writes an array; an object (the manifest's own shape) is read by key.
function hardDependencyIds(descriptor) {
  const value = descriptor?.dependencies
  if (Array.isArray(value)) return value.filter((id) => typeof id === 'string' && id)
  if (value && typeof value === 'object') return Object.keys(value)
  return []
}

// The owning descriptor followed by its hard dependencies, dependencies first, so each one imports before its dependant.
// A dependency is included only when it has an authenticated entry and passes options.allowed(descriptor); one that does
// not is left out, and so is anything reached only through it. A cycle is cut at the repeated edge, and the walk stops at
// MAX_DEPTH. Returns [] for an unknown module or one that is not allowed.
export function popupModuleSet(descriptors, moduleId, options = {}) {
  const allowed = typeof options.allowed === 'function' ? options.allowed : () => true
  const byId = new Map()
  for (const descriptor of Array.isArray(descriptors) ? descriptors : []) {
    if (descriptor && typeof descriptor.id === 'string' && descriptor.entry && !byId.has(descriptor.id)) byId.set(descriptor.id, descriptor)
  }
  const owner = byId.get(moduleId)
  if (!owner || !allowed(owner)) return []

  const ordered = []
  const done = new Set()
  const inProgress = new Set()
  const visit = (descriptor, depth) => {
    if (done.has(descriptor.id) || inProgress.has(descriptor.id) || depth > MAX_DEPTH) return
    inProgress.add(descriptor.id)
    for (const id of hardDependencyIds(descriptor)) {
      const dependency = byId.get(id)
      if (dependency && allowed(dependency)) visit(dependency, depth + 1)
    }
    inProgress.delete(descriptor.id)
    done.add(descriptor.id)
    ordered.push(descriptor)
  }
  visit(owner, 0)
  return ordered
}

// Whether the person may open a popup route. Same code rule as navItemPermitted: a superuser passes and otherwise every
// code is required. A context that did not come from the backend is always denied (AD-12: the backend stays the authority).
export function popupRoutePermitted(meta, context = {}) {
  if (context?.source !== 'backend') return false
  // A malformed code is a refusal, never a silent pass.
  const codes = []
  if (meta?.permission !== undefined) {
    if (typeof meta.permission !== 'string' || !meta.permission) return false
    codes.push(meta.permission)
  }
  if (meta?.permissions !== undefined) {
    if (!Array.isArray(meta.permissions) || meta.permissions.some((code) => typeof code !== 'string' || !code)) return false
    codes.push(...meta.permissions)
  }
  if (!codes.length) return true
  if (context.user?.superuser) return true
  const granted = new Set(Array.isArray(context.permissions) ? context.permissions : [])
  return codes.every((code) => granted.has(code))
}
