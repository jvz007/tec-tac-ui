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

const {
  UPDATE_SOURCE_PATH, getUpdateSource, saveUpdateSource, normalizeUpdateSources, validateBranchName,
  sourceDraftState, branchComparison, describeUpdateSource, supportsUpdateSource,
} = await import('../src/update-source.js')
const { stageOnlineSystemUpdate } = await import('../src/api.js')
const { createKeyedLatestRequestGate } = await import('../src/latest-request-gate.js')
const { canEditRuntimeSettings } = await import('../src/runtime-settings.js')

// Paths, methods and bodies.
{
  const calls = []
  const api = async (path, options) => {
    calls.push({ path, options })
    return { update_sources: { framework: { type: 'release', ref: null }, ui: { type: 'branch', ref: 'dev' } }, updated_at: '2026-10-08T10:00:00Z', updated_by: 'admin' }
  }
  const got = await getUpdateSource({ api })
  assert.equal(calls[0].path, '/api/tfd/system/update-source/')
  assert.equal(UPDATE_SOURCE_PATH, '/api/tfd/system/update-source/')
  assert.equal(calls[0].options, undefined)
  assert.deepEqual(got.update_sources.ui, { type: 'branch', ref: 'dev' })
  assert.equal(got.updated_by, 'admin')
  await saveUpdateSource('ui', 'branch', 'dev', { api })
  assert.equal(calls[1].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[1].options.body), { component: 'ui', type: 'branch', ref: 'dev' })
  await saveUpdateSource('framework', 'release', 'ignored', { api })
  assert.deepEqual(JSON.parse(calls[2].options.body), { component: 'framework', type: 'release', ref: null })
  await assert.rejects(() => saveUpdateSource('ui', 'branch', '-bad', { api: async () => { throw new Error('must not call') } }), /cannot start with/)
  await assert.rejects(() => saveUpdateSource('nope', 'release', null, { api }), /Unknown update component/)
}

// apiFetch adds the token header; the helper never does.
{
  let seen = null
  globalThis.fetch = async (url, options) => { seen = { url, options }; return json({ update_sources: {} }) }
  await getUpdateSource()
  assert.equal(seen.url, 'https://rmm.example.test/api/tfd/system/update-source/')
  assert.equal(seen.options.headers.get('Authorization'), 'Token abc123')
  assert.doesNotMatch(read('../src/update-source.js'), /Authorization|localStorage|sessionStorage|fetch\(/)
  await saveUpdateSource('ui', 'release', null)
  assert.equal(seen.options.method, 'PATCH')
  assert.equal(seen.options.headers.get('Authorization'), 'Token abc123')
}

// Defaults.
const releaseOnly = { framework: { type: 'release', ref: null }, ui: { type: 'release', ref: null } }
assert.deepEqual(normalizeUpdateSources(undefined), releaseOnly)
assert.deepEqual(normalizeUpdateSources({}), releaseOnly)
assert.deepEqual(normalizeUpdateSources({ update_sources: { ui: { type: 'branch', ref: 'dev' }, framework: { type: 'branch', ref: '' } } }), { framework: { type: 'release', ref: null }, ui: { type: 'branch', ref: 'dev' } })
assert.deepEqual(normalizeUpdateSources({ ui: { type: 'weird', ref: 'x' } }).ui, { type: 'release', ref: null })
assert.equal(supportsUpdateSource({ update_sources: {} }), true)
assert.equal(supportsUpdateSource({}), false)
assert.equal(supportsUpdateSource(null), false)
assert.equal(describeUpdateSource({ type: 'branch', ref: 'dev' }), 'BRANCH dev')
assert.equal(describeUpdateSource({ type: 'release', ref: null }), 'RELEASE')

// Branch name rule.
for (const ok of ['dev', 'main', 'feature/x-1', 'release_1.2', 'a'.repeat(200), 'v1.2.3', 'a.b']) assert.equal(validateBranchName(ok).valid, true, ok)
for (const bad of ['', ' ', 'a b', 'a..b', 'a//b', '-x', '/x', 'x/', 'x.', 'x.lock', 'a'.repeat(201), 'é', 'a;b', 'a\nb', null, undefined, 7, ' dev']) {
  assert.equal(validateBranchName(bad).valid, false, `rejects ${JSON.stringify(bad)}`)
}

// Draft state.
{
  const saved = { type: 'branch', ref: 'dev' }
  assert.deepEqual(sourceDraftState({ saved, draft: { type: 'branch', ref: 'dev' } }), { dirty: false, valid: true, message: '' })
  const changed = sourceDraftState({ saved, draft: { type: 'branch', ref: 'main' } })
  assert.equal(changed.dirty, true)
  assert.equal(changed.valid, true)
  assert.equal(changed.message, 'Save to use this source.')
  assert.equal(sourceDraftState({ saved, draft: { type: 'release', ref: '' } }).dirty, true)
  assert.equal(sourceDraftState({ saved: { type: 'release', ref: null }, draft: { type: 'release', ref: 'stale' } }).dirty, false)
  const bad = sourceDraftState({ saved, draft: { type: 'branch', ref: '-x' } })
  assert.equal(bad.valid, false)
  assert.match(bad.message, /cannot start with/)
  assert.equal(sourceDraftState({ saved, draft: { type: 'branch', ref: '' } }).valid, false)
}

// Stage body.
{
  const bodies = []
  globalThis.fetch = async (url, options) => { bodies.push(JSON.parse(options.body)); return json({ ok: true }) }
  await stageOnlineSystemUpdate('ui')
  assert.deepEqual(bodies[0], { component: 'ui' })
  assert.equal('source_type' in bodies[0], false)
  assert.equal('ref' in bodies[0], false)
  await stageOnlineSystemUpdate('ui', 'branch', 'feature/x')
  assert.deepEqual(bodies[1], { component: 'ui', source_type: 'branch', ref: 'feature/x' })
  await stageOnlineSystemUpdate('framework', 'release')
  assert.deepEqual(bodies[2], { component: 'framework', source_type: 'release', ref: null })
}

// Branch comparison.
{
  const same = branchComparison({ state: 'same', head_short: 'abc1234', head_date: '2026-10-08', installed_short: 'abc1234' })
  assert.equal(same.label, 'SAME')
  assert.equal(same.pillClass, 'ok')
  assert.equal(same.headShort, 'abc1234')
  const differs = branchComparison({ state: 'differs', head_short: 'abc1234', head_date: 'd', installed_short: 'def5678', differs: true })
  assert.equal(differs.label, 'DIFFERS')
  assert.equal(differs.pillClass, 'warn')
  assert.match(differs.text, /does not mean the branch is newer/)
  assert.equal(differs.installedShort, 'def5678')
  const unknown = branchComparison({ state: 'unknown', head_short: 'abc1234', installed_short: null, differs: null })
  assert.equal(unknown.label, 'UNKNOWN')
  assert.equal(unknown.installedShort, 'Not recorded')
  assert.match(unknown.text, /Installed commit not recorded/)
  assert.equal(branchComparison({ head_short: 'a', differs: true }).state, 'differs')
  assert.equal(branchComparison({ head_short: 'a' }).state, 'unknown')
  assert.equal(branchComparison(undefined), null)
}

// Core's 400, 403 and 429 messages pass through.
for (const [status, detail] of [[400, 'Branch name is not valid.'], [403, 'Tec-Tac core.runtime_settings.manage permission is required.'], [429, 'Request was throttled.']]) {
  globalThis.fetch = async () => json({ detail }, status)
  await assert.rejects(() => saveUpdateSource('ui', 'branch', 'dev'), (error) => error.status === status && error.message === detail)
}

// The latest-request gate drops a stale answer after a save.
{
  const gate = createKeyedLatestRequestGate(['framework', 'ui'])
  const before = gate.begin('ui')
  gate.invalidate('ui')
  const recheck = gate.begin('ui')
  assert.equal(gate.isCurrent('ui', before), false)
  assert.equal(gate.isCurrent('ui', recheck), true)
}

// Display rule shared with the Modules card.
assert.equal(canEditRuntimeSettings({ user: {}, permissions: ['core.runtime_settings.manage'] }), true)
assert.equal(canEditRuntimeSettings({ user: {}, permissions: ['core.view'] }), false)

// The view: source assertions (there is no DOM here).
const view = read('../src/views/SystemUpdatesView.vue')
const template = view.slice(view.indexOf('<template>'))
const script = view.slice(0, view.indexOf('</script>'))
// 0.12.86: the source controls follow canChangeUpdateSource (superuser only).
assert.match(script, /import \{ canChangeUpdateSource \} from '\.\.\/runtime-settings'/)
assert.match(script, /canChangeUpdateSource\(appState\?\.context\)/)
// The saved source and the picker sit outside the advanced unlock.
const advancedAt = template.indexOf('v-if="!advancedUnlocked"')
assert.ok(advancedAt > 0)
for (const marker of ['data-test="saved-update-source"', 'class="update-source-form"', 'data-test="branch-check"', 'saveSource(component.id)']) {
  const at = template.indexOf(marker)
  assert.ok(at > 0 && at < advancedAt, `${marker} must come before the advanced unlock block`)
}
assert.doesNotMatch(template.slice(0, advancedAt), /advancedUnlocked/, 'nothing above the advanced block depends on the unlock')
// Branches load on mount without the unlock.
const mounted = script.slice(script.indexOf('onMounted('), script.indexOf('onBeforeUnmount('))
assert.match(mounted, /loadBranches\(component, \{ quiet: true \}\)/)
assert.doesNotMatch(mounted, /advancedUnlocked/)
// The saved source shows on load straight from status.update_sources.
assert.match(script, /supportsUpdateSource\(status\.value\)/)
assert.match(script, /normalizeUpdateSources\(status\.value\)/)
// Stage uses the saved source: no release literal in the template.
assert.match(template, /@click="stageOnline\(component\.id\)"/)
assert.doesNotMatch(template, /stageOnline\(component\.id, 'release'\)/)
assert.match(template, /stageOnline\(component\.id, 'branch'\)/, 'the Advanced one-off still sends an explicit branch')
// Older Core: keep sending explicit release.
// 0.12.83: the saved source is sent explicitly when supported; only an older Core falls back to release.
assert.match(script, /else if \(sourcesSupported\.value\)/)
assert.match(script, /let type = 'release'/)
// A text input takes over when the branch list fails.
assert.match(template, /v-if="branchListFailed\[component\.id\]"[^>]*type="text"/)
// Save replaces the entry, invalidates the gate and forces a re-check.
const save = script.slice(script.indexOf('async function saveSource'), script.indexOf('async function checkOnline'))
assert.match(save, /\[component\]: result\.update_sources\[component\]/)
assert.match(save, /onlineRequestGate\.invalidate\(component\)/)
assert.match(save, /checkOnline\(component, \{ force: true \}\)/)
// Check and Stage are blocked while the draft differs.
assert.match(template, /sourceBlocked\(component\.id\)/)
assert.match(template, /Save to use this source/)
assert.match(template, /Check for updates/)
assert.match(script, /Download & inspect branch \$\{savedBranchRef\(component\)\}/)
// The release cache is never shown as a finished branch check.
assert.match(script, /result\.source\?\.type !== 'branch'/)
// Core 1.17.2 is required and the help article explains the source.
assert.match(JSON.parse(read('../tec_tac_package.json')).requires['tec-tac-framework'], /^>=1\.17\.\d+,<2\.0\.0$/)
assert.match(read('../src/help/articles/system-updates.md'), /Remembered update source/)

// The component compiles.
try {
  const { parse, compileScript, compileTemplate } = await import('@vue/compiler-sfc')
  const { descriptor, errors } = parse(view, { filename: 'SystemUpdatesView.vue' })
  assert.equal(errors.length, 0)
  compileScript(descriptor, { id: 'x' })
  const compiled = compileTemplate({ source: descriptor.template.content, filename: 'SystemUpdatesView.vue', id: 'x' })
  assert.equal(compiled.errors.length, 0, JSON.stringify(compiled.errors))
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
}

console.log('[TEST] update source (0.12.82) OK')
