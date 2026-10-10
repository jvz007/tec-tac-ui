// 0.12.86: only a superuser changes the update source (Core 1.17.5, CQ12).
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

const { canChangeUpdateSource, canEditRuntimeSettings } = await import('../src/runtime-settings.js')
const { saveUpdateSource } = await import('../src/update-source.js')
const { coreNavigation } = await import('../src/core-navigation.js')

// (1) canChangeUpdateSource
assert.equal(canChangeUpdateSource({ user: { superuser: true } }), true)
assert.equal(canChangeUpdateSource({ user: {}, permissions: ['core.runtime_settings.manage'] }), false)
assert.equal(canChangeUpdateSource({ user: {}, permissions: ['core.privileged_operations'] }), false)
assert.equal(canChangeUpdateSource({ user: {}, permissions: ['core.runtime_settings.manage', 'core.privileged_operations'] }), false)
assert.equal(canChangeUpdateSource({ user: {}, permissions: [] }), false)
assert.equal(canChangeUpdateSource({ user: { superuser: 'true' } }), false)
assert.equal(canChangeUpdateSource({}), false)
assert.equal(canChangeUpdateSource(null), false)
assert.equal(canChangeUpdateSource(undefined), false)

// (2) canEditRuntimeSettings is unchanged; the nav entry and time-limit form stay.
assert.equal(canEditRuntimeSettings({ user: {}, permissions: ['core.runtime_settings.manage'] }), true)
assert.equal(canEditRuntimeSettings({ user: {}, permissions: ['core.privileged_operations'] }), true)
const entry = (context) => coreNavigation(context).find((item) => item.to === '/system/settings')
assert.equal(entry({ user: {}, permissions: ['core.runtime_settings.manage'] }).visible, true)
assert.equal(entry({ user: {}, permissions: [] }).visible, false)

// (3) The view.
const view = read('../src/views/SystemUpdatesView.vue')
const script = view.slice(0, view.indexOf('</script>'))
const template = view.slice(view.indexOf('<template>'))
assert.match(script, /const canEditSource = computed\(\(\) => canChangeUpdateSource\(appState\?\.context\)\)/)
assert.match(script, /import \{ canChangeUpdateSource \} from '\.\.\/runtime-settings'/)
assert.doesNotMatch(view, /canEditRuntimeSettings/)
assert.match(template, /Only a superuser can change the update source\./)
// Check, Stage, Install and the Advanced stage are not behind canEditSource.
for (const line of template.split('\n')) {
  if (/checkOnline\(|stageOnline\(|installStage|unlockAdvanced/.test(line)) {
    assert.doesNotMatch(line, /v-if="[^"]*canEditSource/, `ungated control: ${line.trim().slice(0, 80)}`)
  }
}
for (const marker of ['@click="installStage"', "stageOnline(component.id, 'branch')", 'unlockAdvanced', 'stageOnline(component.id)']) {
  assert.ok(template.includes(marker), marker)
}
// The saved source still shows for everyone.
assert.ok(template.includes('data-test="saved-update-source"'))
// The branch-list prefetch on mount and the switch guard follow canEditSource.
assert.match(script, /sourcesSupported\.value && canEditSource\.value/)
assert.match(script, /if \(!canEditSource\.value \|\| !savedIsBranch\(component\)/)
assert.match(script, /Core checks that you are a superuser/)

// (4) Behaviour with the real switchToRelease/applySource bodies.
const seen = []
globalThis.fetch = async (url, options) => { seen.push({ url, options }); return json({ update_sources: { ui: { type: 'release', ref: null } } }) }
{
  const a = script.indexOf('async function saveSource')
  const d = script.indexOf('// The secondary Stable release line')
  assert.ok(a > 0 && d > a)
  const make = new Function('deps', `const { sourceSaving, sourceError, cachedStable, saveUpdateSource, status, syncSourceDraft, onlineRequestGate, checkOnline, canEditSource, savedIsBranch, draftState, sourceDraft } = deps\n${script.slice(a, d)}\nreturn { switchToRelease }`)
  const deps = (allowed) => ({
    cachedStable: { value: { framework: null, ui: null } },
    sourceSaving: { value: { framework: false, ui: false } },
    sourceError: { value: { framework: '', ui: '' } },
    saveUpdateSource,
    status: { value: { update_sources: { framework: { type: 'release', ref: null }, ui: { type: 'branch', ref: 'dev' } } } },
    syncSourceDraft() {},
    onlineRequestGate: { invalidate() {} },
    checkOnline: async () => {},
    canEditSource: { value: allowed },
    savedIsBranch: () => true,
    draftState: () => ({ valid: true, dirty: false }),
    sourceDraft: { value: {} },
  })
  await make(deps(false)).switchToRelease('ui')
  assert.equal(seen.length, 0, 'no PATCH for a non-superuser')
  const ok = deps(true)
  await make(ok).switchToRelease('ui')
  assert.equal(seen.length, 1)
  assert.equal(seen[0].url, 'https://rmm.example.test/api/tfd/system/update-source/')
  assert.equal(seen[0].options.method, 'PATCH')
  // (5) Core's 403 text reaches sourceError unchanged.
  globalThis.fetch = async () => json({ detail: 'Only a Tec-Tac superuser may change the update source.' }, 403)
  const denied = deps(true)
  await make(denied).switchToRelease('ui')
  assert.equal(denied.sourceError.value.ui, 'Only a Tec-Tac superuser may change the update source.')
}

// (6) Requirement, notes, test wiring.
assert.equal(JSON.parse(read('../tec_tac_package.json')).requires['tec-tac-framework'], '>=1.17.15,<2.0.0')
assert.match(read('../package.json'), /stable-release-0\.12\.85\.mjs && node tests\/update-source-superuser-0\.12\.86\.mjs/)
assert.ok(fs.existsSync(new URL('../docs/releases/RELEASE_NOTES_0.12.86.md', import.meta.url)))
// (7) Help article.
assert.match(read('../src/help/articles/system-updates.md'), /Only a superuser can change it/)
console.log('update-source-superuser-0.12.86 ok')
