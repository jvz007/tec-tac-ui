// 0.12.103: nothing toasts on the sign-in screen. While status is 'unauthenticated' the notification service shows and stores
// nothing, the loader loads no further module and refuses a module's api calls without a request, the first session message
// stays, and the toast stack never renders on the sign-in route.
import assert from 'node:assert/strict'
import fs from 'node:fs'

// A browser stand-in: an event target for window, a map for localStorage, and a fetch that counts.
const pendingTimers = []
const win = new EventTarget()
win.setTimeout = (fn) => { pendingTimers.push(fn); return pendingTimers.length }
win.clearTimeout = () => {}
win._env_ = { PROD_URL: 'https://tactical.example.test' }
win.location = { origin: 'https://tec-tac.example.test', href: 'https://tec-tac.example.test/', hash: '' }
globalThis.window = win
const store = new Map()
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)) },
  removeItem: (key) => { store.delete(key) },
}
win.localStorage = globalThis.localStorage
let fetchCalls = 0
globalThis.fetch = async () => { fetchCalls += 1; throw new Error('fetch must not be called') }

const { createNotificationService } = await import(new URL('../src/notifications.js', import.meta.url).href)
const apiModule = await import(new URL('../src/api.js', import.meta.url).href)
const { TACTICAL_SESSION_INVALID_EVENT } = apiModule

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const { state, loadContext } = await dataModule('../src/state.js', [
  ["import { reactive } from 'vue'", 'const reactive = (value) => value'],
  ["from './api'", `from '${new URL('../src/api.js', import.meta.url).href}'`],
  ["from './runtime-context'", `from '${new URL('../src/runtime-context.js', import.meta.url).href}'`],
])
const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

// (a) the notification service
{
  let signedOut = true
  const calls = []
  const service = createNotificationService({ api: async (path, options) => { calls.push({ path, options }); return {} }, isSignedOut: () => signedOut })
  const notes = service.forModule('software')
  assert.equal(notes.show({ message: 'a' }), null)
  assert.equal(notes.info('b'), null)
  assert.equal(notes.warning('c'), null)
  assert.equal(notes.error('d'), null)
  assert.equal(notes.success('e'), null)
  await tick()
  assert.equal(service.toasts.length, 0, 'no toast while signed out')
  assert.equal(calls.length, 0, 'no persist POST while signed out')

  signedOut = false
  assert.ok(notes.warning('f'), 'toasts again once signed in')
  await tick()
  assert.equal(service.toasts.length, 1)
  assert.equal(calls.length, 1, 'persists as before')

  // (b) clearAll drops every toast and timer; a toast raised before sign-out is gone after the status flips.
  notes.info('g', { duration: 5000 })
  assert.equal(service.toasts.length, 2)
  signedOut = true
  service.clearAll()
  assert.equal(service.toasts.length, 0)
  assert.equal(notes.error('h'), null)
  assert.equal(service.toasts.length, 0)
  // A throwing probe never blocks notices.
  const odd = createNotificationService({ isSignedOut: () => { throw new Error('x') } })
  assert.ok(odd.forModule('m').info('still shows'))
  // No probe: as before.
  assert.ok(createNotificationService({}).forModule('m').info('plain'))
}

// (c) the loader stops once the session ends
function loaderFixture(extra = {}) {
  const runtime = {
    state: { context: { permissions: [], user: {}, module_register_timeout_seconds: 30 }, contextSource: 'backend' },
    router: { currentRoute: { value: { path: '/', fullPath: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} },
    addNavigation() {},
    removeNavigation() {},
    api: async () => ({ ok: true }), apiRaw: async () => ({}), apiBlob: async () => ({}), apiText: async () => '',
    ...extra,
  }
  return runtime
}
{
  let signedOut = false
  globalThis.__order = []
  const first = entry(`export default { register() { globalThis.__order.push('first') ; globalThis.__flipSignedOut() } }`)
  const second = entry(`export default { register() { globalThis.__order.push('second') } }`)
  const third = entry(`export default { register() { globalThis.__order.push('third') } }`)
  globalThis.__flipSignedOut = () => { signedOut = true }
  const runtime = loaderFixture({ isSignedOut: () => signedOut })
  const result = await loader.loadUiModules(runtime, [
    { id: 'one', entry: first }, { id: 'two', entry: second }, { id: 'three', entry: third },
  ])
  assert.deepEqual(globalThis.__order, ['first'])
  assert.deepEqual(result.loaded, ['one'])
  assert.deepEqual(result.skipped, [{ id: 'two', reason: 'signed-out' }, { id: 'three', reason: 'signed-out' }])
  assert.deepEqual(result.failed, [])
}

// (d) the guarded transports refuse with 401 / signed_out, and the transport is never called
{
  let signedOut = false
  let transportCalls = 0
  const count = async () => { transportCalls += 1; return {} }
  const events = []
  win.addEventListener(TACTICAL_SESSION_INVALID_EVENT, () => events.push('invalid'))
  let seen = null
  globalThis.__seen = (context) => { seen = context }
  const probe = entry(`export default { register(context) { globalThis.__seen(context) } }`)
  const runtime = loaderFixture({ api: count, apiRaw: count, apiBlob: count, apiText: count, isSignedOut: () => signedOut })
  await loader.loadUiModules(runtime, [{ id: 'probe', entry: probe }])
  assert.ok(seen, 'module registered')
  assert.equal('isSignedOut' in seen, false, 'the probe is the shell\'s, not the module\'s')
  await seen.api('/api/tfd/x/')
  assert.equal(transportCalls, 1, 'works while signed in')
  signedOut = true
  for (const key of ['api', 'apiRaw', 'apiBlob', 'apiText']) {
    await assert.rejects(() => seen[key]('/api/tfd/x/'), (error) => {
      assert.equal(error.status, 401)
      assert.equal(error.code, 'signed_out')
      return true
    }, key)
  }
  assert.equal(transportCalls, 1, 'no call reaches the transport while signed out')
  assert.equal(fetchCalls, 0)
  assert.deepEqual(events, [], 'no session-invalid event')
}

// (e) a stand-in for Software's register(): the access read rejects 401 after sign-out, the warning is called, nothing shows
{
  let signedOut = false
  const service = createNotificationService({ api: async () => ({}), isSignedOut: () => signedOut })
  let warned = 0
  const notes = service.forModule('software')
  const warning = notes.warning
  const watched = { ...notes, warning: (...args) => { warned += 1; return warning(...args) } }
  globalThis.__software = { notes: watched, flip: () => { signedOut = true } }
  const software = entry(`export default {
    async register(context) {
      const { notes, flip } = globalThis.__software
      flip()
      try { await context.api('/api/tfd/software/access/') }
      catch (error) { notes.warning('Software is hidden because Tec-Tac could not check what your Tactical role may do.') }
    },
  }`)
  const runtime = loaderFixture({ isSignedOut: () => signedOut, notifications: service })
  const result = await loader.loadUiModules(runtime, [{ id: 'software', entry: software }])
  assert.deepEqual(result.loaded, ['software'])
  assert.equal(warned, 1, 'the module did call warning()')
  assert.equal(service.toasts.length, 0, 'but no toast exists')
}

// (f) state.js
{
  const invalid = (message, code) => win.dispatchEvent(new CustomEvent(TACTICAL_SESSION_INVALID_EVENT, { detail: { status: 401, message, code } }))
  state.status = 'ready'
  invalid('Your Tec-Tac session expired due to inactivity. Sign in again.', 'session_idle_timeout')
  assert.equal(state.status, 'unauthenticated')
  assert.equal(state.error.message, 'Your Tec-Tac session expired due to inactivity. Sign in again.')
  invalid('Your Tactical session is no longer valid. Sign in again.', null)
  invalid('Another message', 'x')
  assert.equal(state.error.message, 'Your Tec-Tac session expired due to inactivity. Sign in again.', 'the first message stays')
  assert.equal(state.error.code, 'session_idle_timeout')

  // The sign-in route makes no authenticated call: no token, zero fetches.
  store.clear()
  fetchCalls = 0
  await loadContext([])
  assert.equal(fetchCalls, 0)
  assert.equal(state.status, 'unauthenticated')
  // A later invalid event after a fresh load starts from 'loading' still lands once the status is ready again.
  state.status = 'ready'
  invalid('Second session ended.', null)
  assert.equal(state.error.message, 'Second session ended.')
}

// (g) source scan
{
  const app = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  assert.match(app, /v-if="state\.status !== 'unauthenticated' && notifications\?\.toasts\?\.length" class="toast-stack"/)
  assert.match(app, /status === 'unauthenticated'\) notifications\?\.clearAll/)
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(main, /isSignedOut = \(\) => state\.status === 'unauthenticated'/)
  assert.match(main, /createNotificationService\(\{[^}]*isSignedOut[^}]*\}\)/)
  assert.match(main, /loaderRuntime = \{[\s\S]*?\n      isSignedOut,/)
  assert.match(main, /notifications\.clearAll\(\)/)
  assert.doesNotMatch(main, /status === 'not ready'/)
  assert.equal(/localStorage|sessionStorage/.test(fs.readFileSync(new URL('../src/job-follow.js', import.meta.url), 'utf8')), false)
}

console.log('signed-out no toast 0.12.103: PASS')
