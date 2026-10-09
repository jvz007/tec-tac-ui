// 0.12.85: the stable release under a branch source (Core 1.17.4 stable_release).
import assert from 'node:assert/strict'
import fs from 'node:fs'

const storage = new Map([['access_token', 'abc123']])
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null },
  setItem(key, value) { storage.set(key, String(value)) },
  removeItem(key) { storage.delete(key) },
}
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {}, addEventListener() {} }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const { stableRelease, discoveredVersion, saveUpdateSource } = await import('../src/update-source.js')
const { checkOnlineSystemUpdate } = await import('../src/api.js')

const branchDev = { type: 'branch', ref: 'dev' }
const release = { type: 'release', ref: null }
const trust = { signed: true, trusted: true, acceptance_policy: { accepted: true, actual_label: 'Signed', minimum_label: 'Unsigned' } }
const row = { tag: '1.15.189', name: '1.15.189', published_at: '2026-10-01T08:00:00Z', html_url: 'https://example.test', commit: 'a'.repeat(40), release_trust: trust, operation: 'upgrade' }
const onlineBranch = { source: branchDev, latest_release: null, branch: { state: 'same', head_short: '9c578f6' }, branch_error: null, stable_release: row }

// (a) online result with stable_release; latest_release stays null.
let s = stableRelease({ saved: branchDev, online: onlineBranch, cached: null, sourcesSupported: true })
assert.equal(s.tag, '1.15.189')
assert.equal(s.date, '2026-10-01T08:00:00Z')
assert.equal(s.operation, 'upgrade')
assert.equal(s.acceptance.accepted, true)
assert.equal(s.trust, trust)
assert.equal(s.stale, false)
assert.equal(s.error, '')
assert.equal(onlineBranch.latest_release, null)

// (b) first load: only the release_cache row.
const cachedRow = { source: branchDev, latest_release: null, stable_release: row, cache: { stale: false } }
s = stableRelease({ saved: branchDev, online: null, cached: cachedRow, sourcesSupported: true })
assert.equal(s.tag, '1.15.189')
// an online result wins over the cache
s = stableRelease({ saved: branchDev, online: { ...onlineBranch, stable_release: { ...row, tag: '1.15.190' } }, cached: cachedRow, sourcesSupported: true })
assert.equal(s.tag, '1.15.190')

// (c) stale cached row.
s = stableRelease({ saved: branchDev, online: null, cached: { ...cachedRow, cache: { stale: true } }, sourcesSupported: true })
assert.equal(s.stale, true)
s = stableRelease({ saved: branchDev, online: { ...onlineBranch, cache: { stale: true } }, cached: null, sourcesSupported: true })
assert.equal(s.stale, true)

// (d) Core knows no release yet.
s = stableRelease({ saved: branchDev, online: null, cached: { ...cachedRow, stable_release: null }, sourcesSupported: true })
assert.deepEqual(s, { none: true, error: '' })

// (e) release_error with no row.
s = stableRelease({ saved: branchDev, online: { ...onlineBranch, stable_release: null, release_error: 'GitHub is unreachable' }, cached: null, sourcesSupported: true })
assert.deepEqual(s, { none: true, error: 'GitHub is unreachable' })
// release_error beside a stale row keeps both
s = stableRelease({ saved: branchDev, online: { ...onlineBranch, release_error: 'rate limited', cache: { stale: true } }, cached: null, sourcesSupported: true })
assert.equal(s.tag, '1.15.189'); assert.equal(s.error, 'rate limited'); assert.equal(s.stale, true)

// (f) branch_error leaves stable_release intact, and the headline stays as 0.12.84.
const failing = { ...onlineBranch, branch: null, branch_error: 'Branch not found' }
s = stableRelease({ saved: branchDev, online: failing, cached: null, sourcesSupported: true })
assert.equal(s.tag, '1.15.189'); assert.equal(s.error, '')
const head = discoveredVersion({ saved: branchDev, online: failing, sourcesSupported: true })
assert.equal(head.kind, 'branch'); assert.equal(head.branchError, 'Branch not found'); assert.ok(!JSON.stringify(head).includes('1.15.189'))
const headOk = discoveredVersion({ saved: branchDev, online: onlineBranch, sourcesSupported: true })
assert.equal(headOk.kind, 'branch'); assert.equal(headOk.headShort, '9c578f6'); assert.equal(headOk.checked, true)
assert.ok(!JSON.stringify(headOk).includes('1.15.189'))

// (g) release source, unsupported Core, Core older than 1.17.4, other branch's cache.
assert.equal(stableRelease({ saved: release, online: onlineBranch, cached: cachedRow, sourcesSupported: true }), null)
assert.equal(stableRelease({ saved: branchDev, online: onlineBranch, cached: cachedRow, sourcesSupported: false }), null)
const { stable_release: _drop, ...old } = onlineBranch
assert.equal(stableRelease({ saved: branchDev, online: old, cached: null, sourcesSupported: true }), null)
assert.equal(stableRelease({ saved: branchDev, online: null, cached: { source: branchDev, latest_release: null }, sourcesSupported: true }), null)
assert.equal(stableRelease({ saved: branchDev, online: null, cached: { ...cachedRow, source: { type: 'branch', ref: 'main' } }, sourcesSupported: true }), null)
assert.equal(stableRelease({ saved: branchDev, online: null, cached: { ...cachedRow, source: { type: 'release', ref: null } }, sourcesSupported: true }), null)
assert.equal(stableRelease({}), null)
assert.equal(stableRelease(), null)

// Template and script scans.
const view = read('../src/views/SystemUpdatesView.vue')
const script = view.slice(0, view.indexOf('</script>'))
const template = view.slice(view.indexOf('<template>'))
assert.equal(template.split('data-test="stable-release"').length, 2)
const rowAt = template.indexOf('data-test="stable-release"')
const comparisonAt = template.indexOf('<dt>Comparison</dt>')
const lastChecked = template.indexOf('<dt>Last checked</dt>')
const discoveredAt = template.indexOf('data-test="discovered-version"')
assert.ok(comparisonAt > 0 && rowAt > comparisonAt && rowAt < lastChecked, 'stable row sits after the branch rows and before Last checked')
const discoveredDd = template.slice(discoveredAt, template.indexOf('</dd>', discoveredAt))
assert.ok(!discoveredDd.includes('stable'), 'not inside the discovered-version row')
const rowBlock = template.slice(template.lastIndexOf('<template v-if="stable(component.id)">', rowAt), lastChecked)
assert.match(rowBlock, /<button v-if="canEditSource && savedIsBranch\(component\.id\)"/)
assert.match(rowBlock, /:disabled="sourceSaving\[component\.id\]"/)
assert.match(rowBlock, /@click="switchToRelease\(component\.id\)"/)
assert.match(rowBlock, /Not checked yet/)
assert.match(rowBlock, /stable\(component\.id\)\.error/)
assert.match(rowBlock, /STALE/)
assert.match(rowBlock, /<ReleaseTrustBadge/)
// release_error under a branch renders in the stable row only.
assert.match(template, /discovered\(component\.id\)\.kind !== 'branch' && online\[component\.id\]\?\.release_error/)
assert.ok(!/branchError[^\n]*release_error|release_error[^\n]*branchError/.test(template))
// One copy of the badge markup: the popover lives in the shared block only.
assert.ok(!template.slice(0, template.indexOf('<span>Trust</span>')).includes('system-trust-popover'), 'card rows use the shared badge (the staged-package Trust cell keeps its own wording)')
assert.match(read('../src/components/ReleaseTrustBadge.vue'), /class="system-trust-popover"/)
// loadStatus: the release seeding is unchanged and the cache row is kept apart.
assert.match(script, /latest_release && !savedIsBranch\(component\)\) online\.value\[component\] = cached/)
assert.match(script, /cachedStable\.value\[component\] = savedIsBranch\(component\)/)
assert.match(script, /cached: cachedStable\.value\[component\]/)
// Shared save helper, no copy.
assert.equal(script.split('await saveUpdateSource(').length, 2)
assert.match(script, /async function switchToRelease\(component\)/)
assert.match(script, /applySource\(component, 'release', null\)/)
// Headline, Check, Download and the mismatch block are unchanged.
assert.match(template, /data-test="discovered-version"/)
assert.match(template, /<dt>Installed<\/dt>/)
assert.match(script, /Download & inspect branch/)
assert.match(script, /stageSourceCheck\(/)

// Behaviour: run the real applySource and switchToRelease with stubs.
{
  const a = script.indexOf('async function saveSource')
  const b = script.indexOf('async function applySource')
  const c = script.indexOf('async function switchToRelease')
  const d = script.indexOf('// The secondary Stable release line')
  assert.ok(a > 0 && b > a && c > b && d > c)
  const body = script.slice(a, d)
  const make = new Function('deps', `const { sourceSaving, sourceError, saveUpdateSource, status, syncSourceDraft, onlineRequestGate, checkOnline, canEditSource, savedIsBranch, draftState, sourceDraft } = deps\n${body}\nreturn { switchToRelease, applySource, saveSource }`)
  const calls = []
  const deps = (over = {}) => ({
    sourceSaving: { value: { framework: false, ui: false } },
    sourceError: { value: { framework: '', ui: '' } },
    saveUpdateSource: async (component, type, ref) => { calls.push(['save', component, type, ref]); return { update_sources: { [component]: { type, ref } } } },
    status: { value: { update_sources: { framework: branchDev, ui: branchDev } } },
    syncSourceDraft: (component) => calls.push(['sync', component]),
    onlineRequestGate: { invalidate: (component) => calls.push(['invalidate', component]) },
    checkOnline: async (component, options) => { calls.push(['check', component, options]) },
    canEditSource: { value: true },
    savedIsBranch: () => true,
    draftState: () => ({ valid: true, dirty: false }),
    sourceDraft: { value: {} },
    ...over,
  })
  let d1 = deps()
  await make(d1).switchToRelease('ui')
  assert.deepEqual(calls, [['save', 'ui', 'release', null], ['sync', 'ui'], ['invalidate', 'ui'], ['check', 'ui', { force: true }]])
  assert.deepEqual(d1.status.value.update_sources.ui, { type: 'release', ref: null })
  assert.equal(d1.status.value.update_sources.framework, branchDev, 'the other component is untouched')
  assert.equal(d1.sourceSaving.value.ui, false)
  // not allowed: no edit permission, not a branch, or already saving
  for (const over of [{ canEditSource: { value: false } }, { savedIsBranch: () => false }]) {
    calls.length = 0
    await make(deps(over)).switchToRelease('ui')
    assert.deepEqual(calls, [])
  }
  calls.length = 0
  const busy = deps(); busy.sourceSaving.value.ui = true
  await make(busy).switchToRelease('ui')
  assert.deepEqual(calls, [])
  // a refusal from Core reaches sourceError unchanged and nothing is checked
  calls.length = 0
  const denied = deps({ saveUpdateSource: async () => { throw Object.assign(new Error('Tec-Tac core.runtime_settings.manage permission is required.'), { status: 403 }) } })
  await make(denied).switchToRelease('ui')
  assert.equal(denied.sourceError.value.ui, 'Tec-Tac core.runtime_settings.manage permission is required.')
  assert.deepEqual(calls, [])
  assert.equal(denied.sourceSaving.value.ui, false)
}

// Wire level: PATCH body through the real saveUpdateSource, then force=1 online.
{
  const seen = []
  globalThis.fetch = async (url, options) => { seen.push({ url, options }); return json({ update_sources: { ui: { type: 'release', ref: null } } }) }
  await saveUpdateSource('ui', 'release', null)
  assert.equal(seen[0].url, 'https://rmm.example.test/api/tfd/system/update-source/')
  assert.equal(seen[0].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(seen[0].options.body), { component: 'ui', type: 'release', ref: null })
  await checkOnlineSystemUpdate('ui', { force: true })
  assert.match(seen[1].url, /\/api\/tfd\/system\/updates\/online\/\?component=ui&force=1$/)
  globalThis.fetch = async () => json({ detail: 'Tec-Tac core.runtime_settings.manage permission is required.' }, 403)
  await assert.rejects(() => saveUpdateSource('ui', 'release', null), (error) => error.status === 403 && error.message === 'Tec-Tac core.runtime_settings.manage permission is required.')
}
for (const file of ['../src/update-source.js', '../src/components/ReleaseTrustBadge.vue']) {
  assert.doesNotMatch(read(file), /Authorization|localStorage|sessionStorage|fetch\(/)
}
assert.doesNotMatch(script, /localStorage|sessionStorage|Authorization/)

// Metadata.
assert.match(read('../VERSION').trim(), /^0\.12\.\d+/)
const pkg = JSON.parse(read('../tec_tac_package.json'))
assert.match(pkg.requires['tec-tac-framework'], /^>=1\.17\.\d+,<2\.0\.0$/)
assert.match(read('../package.json'), /discovered-version-0\.12\.84\.mjs && node tests\/stable-release-0\.12\.85\.mjs/)
assert.ok(fs.existsSync(new URL('../docs/releases/RELEASE_NOTES_0.12.85.md', import.meta.url)))

// The component compiles.
try {
  const { parse, compileScript, compileTemplate } = await import('@vue/compiler-sfc')
  for (const file of ['../src/views/SystemUpdatesView.vue', '../src/components/ReleaseTrustBadge.vue']) {
    const { descriptor, errors } = parse(read(file), { filename: file })
    assert.equal(errors.length, 0)
    compileScript(descriptor, { id: 'x' })
    const compiled = compileTemplate({ source: descriptor.template.content, filename: file, id: 'x' })
    assert.equal(compiled.errors.length, 0, JSON.stringify(compiled.errors))
  }
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
}
console.log('stable-release-0.12.85 ok')
