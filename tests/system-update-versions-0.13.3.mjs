// 0.13.3 (Core 1.18.43, AD-77): the System Updates version dropdown. Covers the two api.js calls (route, body, no hand-built
// header), the pure helper, the page wiring (dropdown, disabled option, stage call, stageRequest from the saved source, the 409
// sentence and reload, reload after a source save), the source check for a version stage, no browser storage, LF endings, and
// the 0.13.2 wording fix (Install of a staged batch asks only when modules would be replaced).
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const store = []
globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'tok-1' : null), setItem: (...a) => store.push(a), removeItem() {} }
globalThis.sessionStorage = { getItem: () => null, setItem: (...a) => store.push(a), removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const calls = []
globalThis.fetch = async (url, options) => {
  calls.push({ url, options })
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
}
const api = await import(new URL('../src/api.js', import.meta.url).href)
const v = await import(new URL('../src/system-update-versions.js', import.meta.url).href)
const { stageSourceCheck } = await import(new URL('../src/update-source.js', import.meta.url).href)

// (a) the list call
await api.getSystemUpdateVersions('framework')
assert.equal(calls.length, 1)
assert.match(String(calls[0].url), /\/api\/tfd\/system\/updates\/versions\/\?component=framework$/)
assert.ok(!calls[0].options || !calls[0].options.method || calls[0].options.method === 'GET')
await api.getSystemUpdateVersions('ui')
assert.match(String(calls[1].url), /component=ui$/)
await assert.rejects(() => api.getSystemUpdateVersions('modules'))
await assert.rejects(() => api.getSystemUpdateVersions(undefined))
assert.equal(calls.length, 2, 'a bad component is not sent')

// (b) the stage call
const sha = 'a'.repeat(40)
await api.stageSystemUpdateVersion('framework', '1.18.40', sha.toUpperCase())
await api.stageSystemUpdateVersion('ui', '0.13.1', null)
await api.stageSystemUpdateVersion('ui', '0.13.0', 'not-a-sha')
const stageCalls = calls.slice(2)
assert.equal(stageCalls.length, 3)
for (const call of stageCalls) {
  assert.match(String(call.url), /\/api\/tfd\/system\/updates\/online\/stage\/$/)
  assert.equal(call.options.method, 'POST')
}
assert.deepEqual(JSON.parse(stageCalls[0].options.body), { component: 'framework', source_type: 'version', version: '1.18.40', commit: sha })
assert.deepEqual(JSON.parse(stageCalls[1].options.body), { component: 'ui', source_type: 'version', version: '0.13.1' })
assert.deepEqual(JSON.parse(stageCalls[2].options.body), { component: 'ui', source_type: 'version', version: '0.13.0' })
for (const call of stageCalls) {
  const body = JSON.parse(call.options.body)
  for (const key of ['ref', 'allow_downgrade']) assert.equal(key in body, false, `${key} is never sent`)
  assert.equal(JSON.stringify(call.options.headers || {}).toLowerCase().includes('authorization'), false, 'no hand-built auth header')
}
const apiSource = read('../src/api.js')
const apiFn = apiSource.slice(apiSource.indexOf('export async function getSystemUpdateVersions'), apiSource.indexOf('export async function inspectSystemUpdatePackage'))
assert.doesNotMatch(apiFn, /localStorage|sessionStorage|Authorization|headers/)

// (c) the helper
const payload = {
  installed_version: '1.18.43',
  versions: [
    { version: '1.18.43', commit: sha, date: '2026-11-22', operation: 'reinstall', installable: true, reason: null },
    { version: '1.18.42', commit: null, date: '2026-11-21', operation: 'downgrade', installable: true },
    { version: '1.18.30', commit: null, operation: 'downgrade', installable: false, reason: 'Module governance needs Tec-Tac Framework 1.18.35 or newer.' },
    null, 'x', { version: '' }, { operation: 'update' },
  ],
}
const rows = v.normalizeVersions(payload)
assert.deepEqual(rows.map((r) => r.version), ['1.18.43', '1.18.42', '1.18.30'], 'order kept, odd rows dropped')
assert.equal(v.defaultVersion(rows), '1.18.43', 'the first row is preselected')
assert.equal(rows[2].installable, false)
assert.equal(v.versionLabel(rows[0]), '1.18.43 - reinstall (installed)')
assert.equal(v.versionLabel(rows[1]), '1.18.42 - downgrade')
assert.equal(v.versionLabel({ version: '1.18.44', operation: 'update', installable: true }), '1.18.44 - update')
assert.match(v.versionLabel(rows[2]), /1\.18\.30/)
assert.match(v.versionLabel(rows[2]), /Module governance needs Tec-Tac Framework 1\.18\.35 or newer\./)
for (const bad of [null, undefined, 5, 'text', {}, { versions: 'no' }, { versions: [] }]) {
  assert.deepEqual(v.normalizeVersions(bad), [])
}
assert.equal(v.defaultVersion([]), '')
assert.equal(v.versionRateLimitText({ versions: [] }), '')
const limited = v.versionRateLimitText({ github_rate_limit_error: { code: 'github_rate_limit_exceeded', reset_at: '2026-11-22T12:00:00Z', cached_data_available: true } }, Date.parse('2026-11-22T11:00:00Z'))
assert.match(limited, /used up/)
assert.match(limited, /saved result/)

// (d) the page
const view = read('../src/views/SystemUpdatesView.vue')
assert.match(view, /data-test="version-select"/)
assert.match(view, /v-model="picked\[component\.id\]"/)
assert.match(view, /:disabled="row\.installable === false"/, 'a not-installable row is a disabled option')
assert.match(view, /versionLabel\(row\)/)
assert.match(view, /data-test="version-reason"/)
assert.match(view, /data-test="version-retry"/)
assert.match(view, /data-test="version-rate-limit"/)
assert.match(view, /stageSystemUpdateVersion\(component, row\.version, row\.commit\)/)
assert.match(view, /stageRequest\.value = \{ component, type, ref, oneOff: false \}/, 'the request is the saved source')
assert.match(view, /VERSION_STALE_TEXT/)
assert.match(view, /isStaleCandidate\(err\)\) \{\s*versionStale\.value\[component\] = VERSION_STALE_TEXT\s*loadVersions\(component\)/)
assert.equal(v.VERSION_STALE_TEXT, 'The list changed after you opened it, so nothing was downloaded. The list was reloaded; pick again.')
assert.match(view, /if \(!row \|\| row\.installable === false \|\| stageBusy\.value \|\| onlineScope\.value\[component\]\) return/, 'one request at a time')
const apply = view.slice(view.indexOf('async function applySource'), view.indexOf('async function switchToRelease'))
assert.match(apply, /loadVersions\(component\)/, 'the list follows the saved source')
const mounted = view.slice(view.indexOf('onMounted(async'))
assert.match(mounted, /loadVersions\(component\)/)
assert.doesNotMatch(view.slice(view.indexOf('async function loadVersions'), view.indexOf('async function stageOnline')), /setInterval|localStorage|sessionStorage|Authorization|headers/)
assert.doesNotMatch(view, /localStorage\.|sessionStorage\./)
// the existing buttons are untouched
assert.match(view, /@click="stageOnline\(component\.id\)"/)
assert.match(view, /@click="stageOnline\(component\.id, 'branch'\)"/)
// the preview of a version stage carries the server's saved source, so there is no false mismatch
const releasePreview = { source: { type: 'release', ref: 'v1.18.40' } }
const branchPreview = { source: { type: 'branch', ref: 'dev' } }
assert.equal(stageSourceCheck({ requested: { component: 'framework', type: 'release', ref: null, oneOff: false }, preview: releasePreview, saved: { type: 'release', ref: null } }).state, 'match')
assert.equal(stageSourceCheck({ requested: { component: 'framework', type: 'branch', ref: 'dev', oneOff: false }, preview: branchPreview, saved: { type: 'branch', ref: 'dev' } }).state, 'match')

// (e) 0.13.2 wording: Install of a staged batch asks only when modules would be replaced
const modulesView = read('../src/views/ModulesView.vue')
const install = modulesView.slice(modulesView.indexOf('async function install() {'), modulesView.indexOf('// 0.12.95: cancelling a chained set'))
assert.match(install, /const summary = installConfirmSummary\(plan\.value\)\s*if \(summary\.ids\.length\) \{/)
assert.match(install, /await runInstall\(\[\]\)/)

// (f) LF endings and no storage
for (const file of ['../src/api.js', '../src/system-update-versions.js', '../src/views/SystemUpdatesView.vue', '../src/help/articles/system-updates.md', '../tec_tac_package.json', '../RELEASE_NOTES_0.13.3.md', './system-update-versions-0.13.3.mjs']) {
  assert.equal(read(file).includes('\r'), false, `${file} uses LF`)
}
assert.deepEqual(store, [], 'nothing was written to browser storage')
assert.match(read('../src/help/articles/system-updates.md'), /## Choose a version/)
console.log('system-update-versions-0.13.3: PASS')
