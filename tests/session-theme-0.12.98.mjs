// 0.12.98 (Core 1.17.24, CO9): the header theme is kept for the session through /api/tfd/session/theme/. It never writes
// the saved preferences; Save preferences makes a theme permanent; clearing sign-out cache keeps the next user clean.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const fileUrl = (rel) => new URL(rel, import.meta.url).href
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`

// A Map-backed browser storage, and a fetch that records every call.
const store = new Map()
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)) },
  removeItem: (key) => { store.delete(key) },
}
const timers = []
globalThis.window = {
  _env_: { PROD_URL: 'https://api.example.test' },
  location: { origin: 'https://ui.example.test' },
  dispatchEvent() {},
  setTimeout: (fn) => { timers.push(fn); return timers.length },
  clearTimeout() {},
}
let failNext = null
const calls = []
function response(payload, status = 200) {
  return { ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', headers: { get: () => 'application/json' }, async json() { return payload }, async text() { return JSON.stringify(payload) }, clone() { return this } }
}
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url)
  const body = options.body ? JSON.parse(options.body) : null
  calls.push({ path: u.pathname, method: options.method || 'GET', body })
  if (failNext && u.pathname === failNext.path && (options.method || 'GET') === failNext.method) { failNext = null; return response({ detail: 'Core is busy.' }, 503) }
  if (u.pathname === '/api/tfd/ui/preferences/') return response({ preferences: body?.preferences || {}, updated_at: '2026-10-13T10:00:00Z' })
  return response({ ok: true })
}

const api = await import(fileUrl('../src/api.js'))
const runtimeContext = await import(fileUrl('../src/runtime-context.js'))
const pkg = JSON.parse(read('../tec_tac_package.json'))
assert.equal(pkg.requires['tec-tac-framework'], '>=1.17.32,<2.0.0')

// preferences.js imports from 'vue', './api' and './runtime-context'; the absolute file URLs keep the real modules.
const preferencesSource = read('../src/preferences.js')
  .replace("from 'vue'", `from '${fileUrl('../node_modules/vue/index.mjs')}'`)
  .replace("from './api'", `from '${fileUrl('../src/api.js')}'`)
  .replace("from './runtime-context'", `from '${fileUrl('../src/runtime-context.js')}'`)
const prefs = await import(dataUrl(preferencesSource))
const { preferenceState } = prefs
const savedPutCalls = () => calls.filter((call) => call.path === '/api/tfd/ui/preferences/' && call.method === 'PUT')
const themeCalls = () => calls.filter((call) => call.path === '/api/tfd/session/theme/')

store.set('access_token', 'token')
store.set('user_name', 'johan')
// Sign in as a user with a saved dark theme and no session theme.
await prefs.initializeUserPreferences({ user: { username: 'johan' }, preferences: { appearance: { theme: 'dark', font_scale: 1 } }, preferences_initialized: true, session_theme: null })
assert.equal(prefs.effectiveTheme(), 'dark')

// (a) The header choice: PUT to the session route, no call to the preferences route, saved theme unchanged.
calls.length = 0
assert.equal(await prefs.setSessionTheme('light'), 'light')
assert.deepEqual(calls.map((call) => [call.method, call.path, call.body]), [['PUT', '/api/tfd/session/theme/', { theme: 'light' }]])
assert.equal(calls.some((call) => call.path === '/api/tfd/ui/preferences/'), false, 'the header choice never reaches the preferences route')
assert.equal(prefs.effectiveTheme(), 'light')
assert.equal(preferenceState.preferences.appearance.theme, 'dark', 'the saved theme stays dark')
assert.equal(store.get('tec_tac_theme'), 'dark', 'the browser cache keeps the saved theme only')

// (b) An autosave of another setting keeps sending the saved theme.
calls.length = 0
preferenceState.initialized = true
prefs.updateUserPreferences((next) => { next.navigation.rail_collapsed = true; return next })
assert.equal(timers.length, 1, 'one autosave is scheduled')
timers.shift()()
await new Promise((resolve) => setImmediate(resolve))
assert.equal(savedPutCalls().length, 1)
assert.equal(savedPutCalls()[0].body.preferences.appearance.theme, 'dark', 'the autosave sends the saved theme, never the session theme')
assert.equal(savedPutCalls()[0].body.preferences.navigation.rail_collapsed, true)

// (c) Save on the Preferences page writes the chosen theme, then clears the session theme.
calls.length = 0
const chosen = JSON.parse(JSON.stringify(preferenceState.preferences))
chosen.appearance.theme = 'light'
await prefs.saveUserPreferences(chosen)
await prefs.clearSessionTheme()
assert.deepEqual(calls.map((call) => [call.method, call.path]), [['PUT', '/api/tfd/ui/preferences/'], ['DELETE', '/api/tfd/session/theme/']])
assert.equal(calls[0].body.preferences.appearance.theme, 'light')
assert.equal(preferenceState.preferences.appearance.theme, 'light')
assert.equal(prefs.effectiveTheme(), 'light')
assert.equal(store.get('tec_tac_theme'), 'light', 'the saved theme is the one cached')

// Reset all clears the session theme too.
await prefs.setSessionTheme('high-contrast')
assert.equal(prefs.effectiveTheme(), 'high-contrast')
calls.length = 0
await prefs.resetUserPreferences()
await prefs.clearSessionTheme()
assert.deepEqual(calls.map((call) => [call.method, call.path]), [['DELETE', '/api/tfd/ui/preferences/'], ['DELETE', '/api/tfd/session/theme/']])
assert.equal(preferenceState.sessionTheme, null)
assert.equal(prefs.effectiveTheme(), 'dark')

// Resetting navigation saves the saved theme only, so a session theme stays a session theme.
await prefs.setSessionTheme('light')
calls.length = 0
prefs.resetNavigationPreferences({ save: false })
await prefs.saveUserPreferences(preferenceState.preferences)
assert.equal(savedPutCalls().at(-1).body.preferences.appearance.theme, 'dark')
assert.equal(prefs.effectiveTheme(), 'light')
await prefs.clearSessionTheme()

// (d) A page refresh keeps the session theme Core holds.
await prefs.initializeUserPreferences({ user: { username: 'johan' }, preferences: { appearance: { theme: 'dark' } }, preferences_initialized: true, session_theme: 'high-contrast' })
assert.equal(preferenceState.sessionTheme, 'high-contrast')
assert.equal(prefs.effectiveTheme(), 'high-contrast')
assert.equal(preferenceState.preferences.appearance.theme, 'dark')

// (e) An invalid session theme is null.
await prefs.initializeUserPreferences({ user: { username: 'johan' }, preferences: { appearance: { theme: 'dark' } }, preferences_initialized: true, session_theme: 'blue' })
assert.equal(preferenceState.sessionTheme, null)
assert.equal(prefs.effectiveTheme(), 'dark')
for (const bad of ['blue', '', 7, null, undefined, { theme: 'light' }]) {
  assert.equal(runtimeContext.normalizeBackendRuntimeContext({ session_theme: bad }).session_theme, null, JSON.stringify(bad))
}
assert.equal(runtimeContext.normalizeBackendRuntimeContext({ session_theme: 'light' }).session_theme, 'light')
assert.equal(runtimeContext.normalizeBackendRuntimeContext({}).session_theme, null, 'an older Core sends none')
assert.equal(runtimeContext.emptyRuntimeContext({}).session_theme, null)

// (f) A failed PUT keeps the theme for this page load, saves nothing and throws nothing.
await prefs.initializeUserPreferences({ user: { username: 'johan' }, preferences: { appearance: { theme: 'dark' } }, preferences_initialized: true, session_theme: null })
failNext = { path: '/api/tfd/session/theme/', method: 'PUT' }
calls.length = 0
assert.equal(await prefs.setSessionTheme('light'), 'light')
assert.equal(prefs.effectiveTheme(), 'light')
assert.equal(calls.filter((call) => call.path === '/api/tfd/ui/preferences/').length, 0, 'nothing is saved')
assert.equal(preferenceState.preferences.appearance.theme, 'dark')

// Invalid choices from the header are ignored.
assert.equal(await prefs.setSessionTheme('blue'), 'light')
assert.equal(prefs.effectiveTheme(), 'light')

// (g) clearTacticalSession removes the browser's shared theme and menu cache, not another user's navigation key.
store.clear()
store.set('access_token', 'token')
store.set('user_name', 'johan')
store.set('tec_tac_theme', 'light')
store.set('tec_tac_font_scale', '1.1')
store.set('tec_tac_nav_rail_collapsed', '1')
store.set('tec_tac_nav_sections', '{"Core":true}')
store.set('tec_tac_nav_preferences:johan', '{"order":{}}')
store.set('tec_tac_nav_preferences:operator', '{"order":{}}')
api.clearTacticalSession()
for (const key of ['access_token', 'user_name', 'tec_tac_theme', 'tec_tac_font_scale', 'tec_tac_nav_rail_collapsed', 'tec_tac_nav_sections']) {
  assert.equal(store.has(key), false, `${key} is removed`)
}
assert.equal(store.has('tec_tac_nav_preferences:johan'), true, 'the per-user navigation key stays for migration')
assert.equal(store.has('tec_tac_nav_preferences:operator'), true, 'another user keeps their key')

// writeLegacyCache writes only the saved theme: a session theme never reaches the cache.
store.clear()
await prefs.initializeUserPreferences({ user: { username: 'johan' }, preferences: { appearance: { theme: 'dark' } }, preferences_initialized: true, session_theme: 'light' })
prefs.schedulePreferenceSave(0)
assert.equal(store.get('tec_tac_theme'), 'dark')

// Source checks: the header and the Preferences page follow the rules above.
const app = read('../src/App.vue')
assert.match(app, /const theme = computed\(\{\n  get: \(\) => effectiveTheme\(\),\n  set: \(value\) => \{ void setSessionTheme\(value\) \},\n\}\)/)
assert.doesNotMatch(app, /next\.appearance\.theme = value/, 'the header never saves the theme')
const prefsView = read('../src/views/PreferencesView.vue')
assert.match(prefsView, /<span>Theme \(saved when you press Save preferences\)<\/span>/)
assert.match(prefsView, /await saveUserPreferences\(draft\.value\)\n    \/\/ The theme on this page is now saved, so the header choice for this session ends\.\n    await clearSessionTheme\(\)/)
assert.match(prefsView, /await resetUserPreferences\(\)\n    await clearSessionTheme\(\)/)
assert.match(prefsView, /await saveUserPreferences\(preferenceState\.preferences\)/, 'reset navigation saves the saved theme only')
assert.match(prefsView, /copy\.appearance\.theme = effectiveTheme\(\)/)
const docs = read('../docs/user-preferences.md')
assert.match(docs, /session_theme/)
assert.match(docs, /PUT \/api\/tfd\/session\/theme\//)
const apiDocs = read('../docs/module-runtime-api.md')
assert.match(apiDocs, /context\.session_theme/)

console.log('session theme 0.12.98: PASS')
