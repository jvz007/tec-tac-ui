// 0.12.87: the Stable release row stays when the forced check after a branch switch fails.
import assert from 'node:assert/strict'
import fs from 'node:fs'

globalThis.localStorage = { getItem() { return null }, setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {}, addEventListener() {} }
const { stableRelease } = await import('../src/update-source.js')

const A = { type: 'branch', ref: 'feature-a' }
const B = { type: 'branch', ref: 'dev' }
const row = (tag) => ({ tag, published_at: '2026-10-01T08:00:00Z', operation: 'upgrade' })
const onlineA = { source: A, stable_release: row('1.0.0'), release_error: 'rate limited', cache: { stale: true } }
const ok = true

// A to B, the check for B failed: A's tag, not refreshed, nothing leaks.
let s = stableRelease({ saved: B, online: onlineA, cached: null, sourcesSupported: ok })
assert.equal(s.tag, '1.0.0')
assert.equal(s.notRefreshed, true)
assert.equal(s.error, '')
assert.equal(s.stale, false)
// Falls back to a cached row of another branch when there is no online result.
s = stableRelease({ saved: B, online: null, cached: { source: A, stable_release: row('0.9.0'), cache: { stale: true }, release_error: 'x' }, sourcesSupported: ok })
assert.equal(s.tag, '0.9.0')
assert.equal(s.notRefreshed, true)
assert.equal(s.error, '')
assert.equal(s.stale, false)
// A successful B check removes the mark.
s = stableRelease({ saved: B, online: { source: B, stable_release: row('2.0.0') }, cached: null, sourcesSupported: ok })
assert.equal(s.tag, '2.0.0')
assert.equal(s.notRefreshed, false)
// A same-branch cached row still counts as current.
s = stableRelease({ saved: B, online: onlineA, cached: { source: B, stable_release: row('2.0.0') }, sourcesSupported: ok })
assert.equal(s.tag, '2.0.0')
assert.equal(s.notRefreshed, false)
// Release source and unsupported Core: null.
assert.equal(stableRelease({ saved: { type: 'release', ref: null }, online: onlineA, cached: null, sourcesSupported: ok }), null)
assert.equal(stableRelease({ saved: B, online: onlineA, cached: null, sourcesSupported: false }), null)
// No key anywhere: null (older Core).
assert.equal(stableRelease({ saved: B, online: { source: A }, cached: { source: A }, sourcesSupported: ok }), null)
assert.equal(stableRelease({ saved: B, online: null, cached: null, sourcesSupported: ok }), null)
// A key with no release anywhere: nothing to show as last known.
assert.equal(stableRelease({ saved: B, online: { source: A, stable_release: null }, cached: null, sourcesSupported: ok }), null)

const view = fs.readFileSync(new URL('../src/views/SystemUpdatesView.vue', import.meta.url), 'utf8')
assert.match(view, /Last known stable release, not refreshed/)
// 0.12.89: the saved first-load row survives a Save (see stable-release-cached-0.12.89.mjs).
assert.ok(!/cachedStable\.value\[component\] = null/.test(view))
assert.match(view, /v-if="canEditSource && savedIsBranch\(component\.id\)"[^>]*data-test="use-stable-release"/)
console.log('stable-release-not-refreshed-0.12.87 ok')
