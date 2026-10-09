// 0.12.86: stableRelease() ignores an online result for a different branch.
import assert from 'node:assert/strict'

globalThis.localStorage = { getItem() { return null }, setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {}, addEventListener() {} }
const { stableRelease } = await import('../src/update-source.js')

const A = { type: 'branch', ref: 'feature-a' }
const B = { type: 'branch', ref: 'dev' }
const row = (tag) => ({ tag, published_at: '2026-10-01T08:00:00Z', operation: 'upgrade' })
const onlineA = { source: A, stable_release: row('1.0.0'), release_error: 'rate limited', cache: { stale: true } }
const cachedB = { source: B, stable_release: row('2.0.0'), cache: { stale: true }, release_error: 'old B error' }

// (1) online for A, saved B
// 0.12.87: no result for B, so A's row is the last known one, marked not refreshed.
let s = stableRelease({ saved: B, online: onlineA, cached: null, sourcesSupported: true })
assert.equal(s.tag, '1.0.0')
assert.equal(s.notRefreshed, true)
s = stableRelease({ saved: B, online: onlineA, cached: cachedB, sourcesSupported: true })
assert.equal(s.tag, '2.0.0')
assert.equal(s.stale, true)
assert.equal(s.error, 'old B error')
// (2) A's error and stale flag never leak into B's row
s = stableRelease({ saved: B, online: onlineA, cached: { ...cachedB, cache: { stale: false }, release_error: '' }, sourcesSupported: true })
assert.equal(s.error, '')
assert.equal(s.stale, false)
assert.equal(s.tag, '2.0.0')
// (3) no source key, or a release source, is ignored
const noSource = { stable_release: row('3.0.0') }
// 0.12.87: a result with no source is not for B, so it is only the last known row.
assert.equal(stableRelease({ saved: B, online: noSource, cached: null, sourcesSupported: true }).notRefreshed, true)
assert.equal(stableRelease({ saved: B, online: { ...noSource, source: { type: 'release', ref: null } }, cached: null, sourcesSupported: true }).notRefreshed, true)
// (4) online for the same branch is used and wins over the cache
s = stableRelease({ saved: B, online: { source: B, stable_release: row('4.0.0') }, cached: cachedB, sourcesSupported: true })
assert.equal(s.tag, '4.0.0')
assert.equal(s.stale, false)
// (5) after a Save from A to B: stale A online, first-load cache for B
s = stableRelease({ saved: B, online: onlineA, cached: { source: B, stable_release: row('2.0.0'), cache: { stale: false } }, sourcesSupported: true })
assert.equal(s.tag, '2.0.0')
assert.equal(s.error, '')
// (6) release source and unsupported Core
assert.equal(stableRelease({ saved: { type: 'release', ref: null }, online: { source: B, stable_release: row('1') }, cached: null, sourcesSupported: true }), null)
assert.equal(stableRelease({ saved: B, online: { source: B, stable_release: row('1') }, cached: null, sourcesSupported: false }), null)
console.log('stable-release-branch-switch-0.12.86 ok')
