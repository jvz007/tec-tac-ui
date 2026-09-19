const values = new Map([
  ['access_token', 'token-before-test'],
  ['tec_tac_auth_stage', 'normal'],
  ['user_name', 'operator'],
  ['name', 'Operator'],
])

globalThis.localStorage = {
  getItem: (key) => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
}

const events = []
const bus = new EventTarget()
globalThis.window = {
  _env_: { PROD_URL: 'https://tactical.example' },
  addEventListener: (...args) => bus.addEventListener(...args),
  dispatchEvent: (event) => { events.push(event); return bus.dispatchEvent(event) },
}

const api = await import('../src/api.js')

function seed() {
  values.set('access_token', 'token')
  values.set('tec_tac_auth_stage', 'normal')
  values.set('user_name', 'operator')
  values.set('name', 'Operator')
  events.length = 0
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Authenticated 401: clear all Tactical browser state and emit the invalid event.
seed()
globalThis.fetch = async () => jsonResponse(401, { detail: 'Invalid token.' })
try { await api.apiFetch('/api/tfd/test/') } catch (error) {
  if (error.status !== 401) throw new Error(`expected 401 error, got ${error.status}`)
}
for (const key of ['access_token', 'tec_tac_auth_stage', 'user_name', 'name']) {
  if (values.has(key)) throw new Error(`401 left stale ${key}`)
}
if (events.length !== 1 || events[0].type !== api.TACTICAL_SESSION_INVALID_EVENT) {
  throw new Error('401 did not emit exactly one Tactical session invalidation event')
}

// Authenticated 403: preserve session and do not emit session invalidation.
seed()
globalThis.fetch = async () => jsonResponse(403, { detail: 'Permission denied.' })
try { await api.apiFetch('/api/tfd/restricted/') } catch (error) {
  if (error.status !== 403) throw new Error(`expected 403 error, got ${error.status}`)
}
if (values.get('access_token') !== 'token') throw new Error('403 incorrectly cleared Tactical token')
if (events.length !== 0) throw new Error('403 incorrectly emitted session invalidation')

// Public 401: public API is anonymous and must not touch Tactical auth state.
seed()
globalThis.fetch = async () => jsonResponse(401, { detail: 'Public request denied.' })
try { await api.publicApiFetch('/api/public/test/') } catch (error) {
  if (error.status !== 401) throw new Error(`expected public 401 error, got ${error.status}`)
}
if (values.get('access_token') !== 'token') throw new Error('public 401 incorrectly cleared Tactical token')
if (events.length !== 0) throw new Error('public 401 incorrectly emitted Tactical session invalidation')

console.log('[TEST] PASS session expiry: authenticated 401 invalidates, 403/public 401 preserve session')
