// 0.12.84: the discovered version follows the saved update source.
import assert from 'node:assert/strict'
import fs from 'node:fs'

globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {}, addEventListener() {} }
globalThis.localStorage = { getItem() { return null }, setItem() {}, removeItem() {} }
const { discoveredVersion, branchComparison } = await import('../src/update-source.js')

const branchDev = { type: 'branch', ref: 'dev' }
const release = { type: 'release', ref: null }
const latest = { tag: '1.15.189', release_trust: { signed: true, acceptance_policy: { accepted: true } } }
const branchOnline = {
  source: { type: 'branch', ref: 'dev' },
  latest_release: latest,
  branch: { state: 'differs', head_short: '9c578f6', head_date: '2026-10-08T10:00:00Z', installed_short: '1a2b3c4' },
}

// (a) branch saved, payload still carries latest_release
let d = discoveredVersion({ saved: branchDev, online: branchOnline, sourcesSupported: true })
assert.equal(d.kind, 'branch')
assert.equal(d.ref, 'dev')
assert.equal(d.headShort, '9c578f6')
assert.equal(d.checked, true)
assert.equal(d.comparison.label, 'DIFFERS')
assert.ok(!JSON.stringify(d).includes('1.15.189'))

// (b) other ref or no online result: not checked yet
d = discoveredVersion({ saved: branchDev, online: { ...branchOnline, source: { type: 'branch', ref: 'main' } }, sourcesSupported: true })
assert.equal(d.kind, 'branch'); assert.equal(d.checked, false); assert.equal(d.headShort, '')
d = discoveredVersion({ saved: branchDev, online: null, sourcesSupported: true })
assert.equal(d.kind, 'branch'); assert.equal(d.checked, false)
d = discoveredVersion({ saved: branchDev, online: { source: { type: 'release' }, latest_release: latest }, sourcesSupported: true })
assert.equal(d.checked, false)
d = discoveredVersion({ saved: branchDev, online: { source: branchDev, branch_error: 'rate limited' }, sourcesSupported: true })
assert.equal(d.checked, false); assert.equal(d.branchError, 'rate limited')

// (c) release with latest_release
d = discoveredVersion({ saved: release, online: { latest_release: latest }, sourcesSupported: true })
assert.equal(d.kind, 'release'); assert.equal(d.tag, '1.15.189')

// (d) release with null latest_release
d = discoveredVersion({ saved: release, online: { latest_release: null, release_error: 'no network' }, sourcesSupported: true })
assert.equal(d.kind, 'none'); assert.equal(d.tag, undefined); assert.equal(d.trust, undefined); assert.equal(d.error, 'no network')
assert.equal(discoveredVersion({ saved: release, online: null, sourcesSupported: true }).kind, 'none')

// (e) old Core: no update_sources behaves as release even if a branch is passed
d = discoveredVersion({ saved: branchDev, online: { latest_release: latest }, sourcesSupported: false })
assert.equal(d.kind, 'release'); assert.equal(d.tag, '1.15.189')

// (f) branchComparison
let c = branchComparison({ state: 'unknown', head_short: '9c578f6', installed_short: null, basis: null })
assert.equal(c.label, 'UNKNOWN')
assert.ok(c.text.includes('Installed commit not recorded. The next install from a branch records it.'))
assert.ok(c.text.includes('VERSION could not be compared'))
assert.ok(!c.text.includes('Stage and install once'))
assert.equal(c.installedShort, 'Not recorded')
assert.equal(c.installedNote, 'Installed commit not recorded. The next install from a branch records it.')
c = branchComparison({ state: 'unknown', head_short: '9c578f6' })
assert.equal(c.text, 'Installed commit not recorded. The next install from a branch records it.')
c = branchComparison({ state: 'same', basis: 'version', head_version: '0.12.84', installed_version: '0.12.84', head_short: 'abc1234' })
assert.equal(c.label, 'SAME'); assert.equal(c.pillClass, 'ok')
assert.ok(c.text.includes('Compared by VERSION (branch head 0.12.84, installed 0.12.84). A VERSION match does not prove the commits are equal.'))
c = branchComparison({ state: 'differs', basis: 'version', head_version: '0.12.85', installed_version: '0.12.84' })
assert.equal(c.label, 'DIFFERS'); assert.equal(c.pillClass, 'warn')
c = branchComparison({ state: 'same', basis: 'commit', installed_short: '9c578f6', head_short: '9c578f6' })
assert.equal(c.text, 'The installed build is the current head of this branch.')
assert.equal(c.installedNote, '')
c = branchComparison({ state: 'differs', basis: 'commit', installed_short: '1a2b3c4' })
assert.equal(c.text, 'The installed commit differs from the branch head. That does not mean the branch is newer.')

// (g) source scan
const view = fs.readFileSync(new URL('../src/views/SystemUpdatesView.vue', import.meta.url), 'utf8')
const stable = view.indexOf('<dt>Stable release</dt>')
assert.ok(stable > 0)
assert.equal(view.split('<dt>Stable release</dt>').length, 2)
const guard = view.lastIndexOf(`<template v-if="discovered(component.id).kind === 'release'">`, stable)
assert.ok(guard > 0 && stable - guard < 200, 'Stable release sits behind the release kind')
const lastChecked = view.indexOf('<dt>Last checked</dt>')
const guardEnd = view.indexOf('</template>\n          <dt>Last checked</dt>')
assert.ok(guardEnd > stable && guardEnd < lastChecked, 'release rows end before Last checked')
assert.ok(view.slice(guard, guardEnd).includes('<dt>Release trust</dt>') && view.slice(guard, guardEnd).includes('<dt>Acceptance</dt>'))
assert.match(view, /discovered\(component\.id\)\.kind !== 'branch' && online\[component\.id\]\?\.release_error/)
assert.match(view, /latest_release && !savedIsBranch\(component\)\) online\.value\[component\] = cached/)
assert.match(view, /checkedAtLocal\.value\[component\] = /)
assert.match(view, /\(this session\)/)
assert.match(view, /kind !== 'branch' && online\[component\.id\]\?\.cache\?\.stale/)
assert.match(view, /<dt>Discovered version<\/dt>/)
console.log('discovered-version-0.12.84 ok')
