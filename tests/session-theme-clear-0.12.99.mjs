// 0.12.99 (held Low, 0.12.98 review): clearSessionTheme never throws. A failed DELETE after Save preferences worked clears
// the local session theme anyway and sets a flag, so the page says the header theme may return on refresh instead of
// showing a save error.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const fileUrl = (rel) => new URL(rel, import.meta.url).href
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const store = new Map()
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)) }, removeItem: (k) => { store.delete(k) } }
globalThis.window = { _env_: { PROD_URL: 'https://api.example.test' }, location: { origin: 'https://ui.example.test' }, dispatchEvent() {}, setTimeout: () => 1, clearTimeout() {} }
let failDelete = false
const calls = []
const response = (payload, status = 200) => ({ ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', headers: { get: () => 'application/json' }, async json() { return payload }, async text() { return JSON.stringify(payload) }, clone() { return this } })
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url)
  calls.push({ path: u.pathname, method: options.method || 'GET' })
  if (failDelete && u.pathname === '/api/tfd/session/theme/' && options.method === 'DELETE') return response({ detail: 'Core is busy.' }, 503)
  return response({ ok: true })
}
const prefsSource = read('../src/preferences.js')
  .replace("from 'vue'", `from '${fileUrl('../node_modules/vue/index.mjs')}'`)
  .replace("from './api'", `from '${fileUrl('../src/api.js')}'`)
  .replace("from './runtime-context'", `from '${fileUrl('../src/runtime-context.js')}'`)
const prefs = await import(dataUrl(prefsSource))
store.set('access_token', 'token')

await prefs.setSessionTheme('light')
assert.equal(prefs.preferenceState.sessionTheme, 'light')
failDelete = true
const theme = await prefs.clearSessionTheme()   // must not throw
assert.equal(prefs.preferenceState.sessionTheme, null, 'the local session theme is cleared')
assert.equal(prefs.preferenceState.sessionThemeClearFailed, true)
assert.equal(theme, prefs.effectiveTheme())
failDelete = false
await prefs.setSessionTheme('light')
await prefs.clearSessionTheme()
assert.equal(prefs.preferenceState.sessionThemeClearFailed, false, 'a good DELETE resets the flag')
assert.equal(prefs.preferenceState.sessionTheme, null)

// Save preferences still reports success, with a line about the refresh when the DELETE failed.
const view = read('../src/views/PreferencesView.vue')
assert.match(view, /await clearSessionTheme\(\)\n    saved\.value = preferenceState\.sessionThemeClearFailed \? `Preferences saved\. \$\{SESSION_THEME_REFRESH_NOTICE\}` : 'Preferences saved\.'/)
assert.match(view, /may come back when you refresh the page/)
assert.match(view, /All preferences reset\. \$\{SESSION_THEME_REFRESH_NOTICE\}/)

// The api-contract test reads the two Core routes from the fixture, not a whitelist.
const fixture = JSON.parse(read('./fixtures/core-http-routes-1.17.25.json'))
assert.ok(fixture.routes.includes('/api/tfd/access/sessions/revoke-all/'))
assert.ok(fixture.routes.includes('/api/tfd/session/theme/'))
assert.doesNotMatch(read('./api-contract-routes-0.12.58-1.mjs'), /addedAfterFixture/)

console.log('session theme clear 0.12.99: PASS')
