// Engineer Console hand-off (UI 0.13.8). The Console opens #/console/sign-in or #/console/enrol and listens on 127.0.0.1.
// This file holds the pure helpers: the query validators, the one place that builds the loopback address, and the
// short-lived entry that keeps the route through a single sign-on round trip. It imports nothing.
// The one-time code Core returns is never stored here or anywhere else; the caller passes it straight to loopbackCallbackUrl.

const PORT = /^[1-9][0-9]{3,4}$/
const B64URL_43 = /^[A-Za-z0-9_-]{43}$/
const SERIAL = /^[0-9a-f]{32}$/

export const CONSOLE_SIGN_IN_PATH = '/console/sign-in'
export const CONSOLE_ENROL_PATH = '/console/enrol'
export const PENDING_KEY = 'tectac.console.pending'
export const PENDING_TTL_MS = 300 * 1000

export function validPort(value) {
  if (typeof value !== 'string' || !PORT.test(value)) return null
  const port = Number(value)
  return port >= 1024 && port <= 65535 ? port : null
}

function one(query, key) {
  const value = query?.[key]
  return typeof value === 'string' ? value : null
}

// { port, state, challenge, serial } or null. Anything else in the query is ignored and never used.
export function parseSignInQuery(query) {
  const port = validPort(one(query, 'port'))
  const state = one(query, 'state')
  const challenge = one(query, 'challenge')
  const serial = one(query, 'serial')
  if (port === null || !B64URL_43.test(state || '') || !B64URL_43.test(challenge || '') || !SERIAL.test(serial || '')) return null
  return { port, state, challenge, serial }
}

// { port, state, challenge } or null.
export function parseEnrolQuery(query) {
  const port = validPort(one(query, 'port'))
  const state = one(query, 'state')
  const challenge = one(query, 'challenge')
  if (port === null || !B64URL_43.test(state || '') || !B64URL_43.test(challenge || '')) return null
  return { port, state, challenge }
}

// The only place the loopback address is built: scheme, host and path are literals, the port is a validated integer.
export function loopbackCallbackUrl(port, code, state) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new TypeError('Invalid port')
  if (typeof code !== 'string' || !code || typeof state !== 'string' || !state) throw new TypeError('Invalid callback values')
  return `http://127.0.0.1:${port}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
}

export function authoriseBody(parsed) {
  return { serial: parsed.serial, code_challenge: parsed.challenge, redirect_port: parsed.port }
}

export function enrolBody(parsed) {
  return { code_challenge: parsed.challenge }
}

// The hash of the sign-in or enrol route for validated values, or '' when they do not pass.
export function consoleRouteHash(kind, values) {
  if (kind === 'sign-in') {
    const ok = parseSignInQuery({ port: String(values?.port), state: values?.state, challenge: values?.challenge, serial: values?.serial })
    if (!ok) return ''
    return `#${CONSOLE_SIGN_IN_PATH}?port=${ok.port}&state=${ok.state}&challenge=${ok.challenge}&serial=${ok.serial}`
  }
  if (kind === 'enrol') {
    const ok = parseEnrolQuery({ port: String(values?.port), state: values?.state, challenge: values?.challenge })
    if (!ok) return ''
    return `#${CONSOLE_ENROL_PATH}?port=${ok.port}&state=${ok.state}&challenge=${ok.challenge}`
  }
  return ''
}

// Reads a hash such as '#/console/sign-in?port=..' into { kind, values } or null.
export function parseConsoleHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#/')) return null
  const [path, ...rest] = hash.slice(1).split('?')
  const kind = path === CONSOLE_SIGN_IN_PATH ? 'sign-in' : path === CONSOLE_ENROL_PATH ? 'enrol' : null
  if (!kind) return null
  const params = new URLSearchParams(rest.join('?'))
  const query = {}
  for (const key of ['port', 'state', 'challenge', 'serial']) {
    const all = params.getAll(key)
    if (all.length > 1) return null
    if (all.length === 1) query[key] = all[0]
  }
  const values = kind === 'sign-in' ? parseSignInQuery(query) : parseEnrolQuery(query)
  return values ? { kind, values } : null
}

function store(storage) {
  if (storage) return storage
  try { return globalThis.sessionStorage || null } catch { return null }
}

export function clearPendingConsoleRoute({ storage } = {}) {
  try { store(storage)?.removeItem(PENDING_KEY) } catch { /* storage blocked: nothing lingers that we can reach */ }
}

// Keeps the validated values for one sign-on round trip. No token, no code, no credential.
export function savePendingConsoleRoute(hash, { storage, now = Date.now } = {}) {
  const parsed = parseConsoleHash(hash)
  if (!parsed) return false
  try {
    const target = store(storage)
    if (!target) return false
    target.setItem(PENDING_KEY, JSON.stringify({ kind: parsed.kind, values: parsed.values, savedAt: now() }))
    return true
  } catch { return false }
}

// Reads and deletes the entry. Returns the route hash to open, or '' when there is none, it is too old or it fails validation.
export function takePendingConsoleRoute({ storage, now = Date.now } = {}) {
  let raw = null
  try { raw = store(storage)?.getItem(PENDING_KEY) ?? null } catch { raw = null }
  clearPendingConsoleRoute({ storage })
  if (!raw) return ''
  let entry
  try { entry = JSON.parse(raw) } catch { return '' }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ''
  if (Object.keys(entry).sort().join(',') !== 'kind,savedAt,values') return ''
  if (typeof entry.savedAt !== 'number' || !Number.isFinite(entry.savedAt)) return ''
  const age = now() - entry.savedAt
  if (age < 0 || age > PENDING_TTL_MS) return ''
  const values = entry.values
  if (!values || typeof values !== 'object' || Array.isArray(values)) return ''
  const allowed = entry.kind === 'sign-in' ? 'challenge,port,serial,state' : entry.kind === 'enrol' ? 'challenge,port,state' : null
  if (!allowed || Object.keys(values).sort().join(',') !== allowed) return ''
  return consoleRouteHash(entry.kind, values)
}
