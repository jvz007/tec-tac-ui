// 0.12.89: the saved first-load Stable release row survives a Save.
import assert from 'node:assert/strict'
import fs from 'node:fs'

globalThis.localStorage = { getItem() { return null }, setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {}, addEventListener() {} }
const { stableRelease } = await import('../src/update-source.js')

const view = fs.readFileSync(new URL('../src/views/SystemUpdatesView.vue', import.meta.url), 'utf8')
const applySource = view.slice(view.indexOf('async function applySource'))
assert.ok(!/cachedStable\.value\[component\]\s*=\s*null/.test(applySource.slice(0, 1500)), 'applySource must not clear cachedStable')
assert.ok(!/cachedStable\.value\[component\]\s*=\s*null/.test(view))
assert.match(view, /cachedStable\.value\[component\] = cached && typeof cached === 'object' \? cached : null/)
const load = view.slice(view.indexOf('async function loadStatus'), view.indexOf('async function loadStatus') + 1500)
assert.ok(!/cachedStable[^\n]*savedIsBranch/.test(load), 'loadStatus keeps the cached object for any source type')

const A = { type: 'branch', ref: 'feature-a' }
const B = { type: 'branch', ref: 'dev' }
const cached = { source: A, stable_release: { tag: '1.0.0', published_at: '2026-10-01T08:00:00Z', operation: 'upgrade' }, release_error: 'old', cache: { stale: true } }
// Release to branch, then the forced check failed: the cached row shows, not refreshed.
let s = stableRelease({ saved: B, online: null, cached, sourcesSupported: true })
assert.equal(s.tag, '1.0.0')
assert.equal(s.notRefreshed, true)
assert.equal(s.error, '')
assert.equal(s.stale, false)
// Save to another branch: same.
s = stableRelease({ saved: { type: 'branch', ref: 'other' }, online: null, cached, sourcesSupported: true })
assert.equal(s.tag, '1.0.0')
assert.equal(s.notRefreshed, true)
// A release source still shows no row.
assert.equal(stableRelease({ saved: { type: 'release', ref: null }, online: null, cached, sourcesSupported: true }), null)
console.log('stable-release-cached-0.12.89 ok')
