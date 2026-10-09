// 0.12.89: confirm before a replacement switches a module off (AD-20, Core 1.17.11).
import assert from 'node:assert/strict'
import fs from 'node:fs'

globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'abc123' : null), setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const modulesSource = fs.readFileSync(new URL('../src/modules.js', import.meta.url), 'utf8')
  .replace(/from '[.][/]api'/, `from '${new URL('../src/api.js', import.meta.url).href}'`)
const { setModuleEnabled, installModuleArtifact } = await import(`data:text/javascript;base64,${Buffer.from(modulesSource).toString('base64')}`)
const rep = await import('../src/module-replacement.js')
const { willDisableIds, replacementConfirmLines, installConfirmSummary, confirmationRequired, replacementListChangedText, satisfiedByLine, conflictLine, replacementSummary } = rep

let calls = []
let reply = () => ({ status: 200, body: { job_id: 'j1' } })
globalThis.fetch = async (url, init) => {
  calls.push({ url, init })
  const { status, body } = reply()
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
const body = () => JSON.parse(calls[calls.length - 1].init.body)

// Request bodies.
await setModuleEnabled('pm', true)
assert.deepEqual(body(), { enabled: true, cascade: false })
await setModuleEnabled('pm', true, false, [])
assert.deepEqual(body(), { enabled: true, cascade: false })
assert.ok(!('disable_replaced' in body()))
await setModuleEnabled('pm', true, false, ['patching', 'x'])
assert.deepEqual(body(), { enabled: true, cascade: false, disable_replaced: ['patching', 'x'] })
assert.match(calls[calls.length - 1].url, /\/api\/tfd\/modules\/v2\/pm\/state\/$/)
await setModuleEnabled('pm', false, true)
assert.deepEqual(body(), { enabled: false, cascade: true })
await installModuleArtifact('up1', 'artifact', ['pm'])
assert.deepEqual(body(), { kind: 'artifact', order: ['pm'] })
await installModuleArtifact('up1', 'batch', ['pm'], [])
assert.ok(!('disable_replaced' in body()))
await installModuleArtifact('up1', 'artifact', ['pm'], ['patching'])
assert.deepEqual(body(), { kind: 'artifact', order: ['pm'], disable_replaced: ['patching'] })
assert.match(calls[calls.length - 1].url, /\/packages\/up1\/install\/$/)
await installModuleArtifact('up1', 'artifact', ['pm'], 'patching')
assert.ok(!('disable_replaced' in body()))

// A replacement_confirmation_required 400 yields the fresh list; others do not.
reply = () => ({ status: 400, body: { detail: 'Confirm that list.', code: 'replacement_confirmation_required', will_disable: ['patching', 'patching', 'win'] } })
let caught = null
try { await setModuleEnabled('pm', true, false, ['patching']) } catch (e) { caught = e }
assert.deepEqual(confirmationRequired(caught), ['patching', 'win'])
reply = () => ({ status: 400, body: { detail: 'Confirm that list.', code: 'replacement_confirmation_required', will_disable: [] } })
try { await setModuleEnabled('pm', true, false, ['patching']) } catch (e) { caught = e }
assert.deepEqual(confirmationRequired(caught), [])
reply = () => ({ status: 400, body: { detail: 'Nope.' } })
try { await installModuleArtifact('u', 'artifact', [], []) } catch (e) { caught = e }
assert.equal(confirmationRequired(caught), null)
assert.equal(caught.message, 'Nope.')
reply = () => ({ status: 400, body: { detail: 'Nope.', code: 'something_else', will_disable: ['x'] } })
try { await installModuleArtifact('u', 'artifact', [], []) } catch (e) { caught = e }
assert.equal(confirmationRequired(caught), null)
reply = () => ({ status: 500, body: { detail: 'x', code: 'replacement_confirmation_required' } })
try { await installModuleArtifact('u', 'artifact', [], []) } catch (e) { caught = e }
assert.equal(confirmationRequired(caught), null)
for (const bad of [null, undefined, {}, 'x', { status: 400 }, { status: 400, payload: 'text' }]) assert.equal(confirmationRequired(bad), null)
assert.deepEqual(confirmationRequired({ status: 400, payload: { code: 'replacement_confirmation_required', will_disable: 'x' } }), [])

// Sentences.
assert.deepEqual(replacementConfirmLines('pm', ['patching']), [
  'Enabling pm will switch off patching.',
  'patching stays installed.',
  'pm takes over its routes and contracts.',
  'You can switch patching back on later by disabling pm first.',
])
assert.deepEqual(replacementConfirmLines('pm', ['a', 'b']), [
  'Enabling pm will switch off a and b.',
  'They stay installed.',
  'pm takes over their routes and contracts.',
  'You can switch them back on later by disabling pm first.',
])
assert.match(replacementConfirmLines('pm', ['a', 'b', 'c'])[0], /a, b and c\./)
for (const bad of [undefined, null, 'patching', {}, [{ id: 'x' }], [null, 5, ''], [['a']], 7]) {
  assert.deepEqual(willDisableIds(bad), [])
  assert.deepEqual(replacementConfirmLines('pm', bad), [])
  assert.deepEqual(installConfirmSummary({ will_disable: bad }), { ids: [], lines: [] })
}
let plan = installConfirmSummary({ will_disable: ['patching'], actions: [{ id: 'pm', will_disable: ['patching'] }, { id: 'other', will_disable: [] }] })
assert.deepEqual(plan.ids, ['patching'])
assert.match(plan.lines.join('\n'), /This install will switch off patching\./)
assert.match(plan.lines.join('\n'), /pm switches off patching\./)
assert.ok(!plan.lines.join('\n').includes('other switches'))
plan = installConfirmSummary({ actions: [{ id: 'pm', will_disable: ['a'] }, { id: 'pm2', will_disable: ['b'] }] })
assert.deepEqual(plan.ids, ['a', 'b'])
assert.match(plan.lines.join('\n'), /switch off a and b\./)
assert.deepEqual(installConfirmSummary(null), { ids: [], lines: [] })
assert.deepEqual(installConfirmSummary({ actions: 'x' }), { ids: [], lines: [] })
assert.match(replacementListChangedText(['y']), /^The list changed while you were reading it\. It now switches off y\./)
assert.match(replacementListChangedText([]), /Nothing needs switching off now\./)

assert.equal(satisfiedByLine({ id: 'patching', satisfied_by: 'pm' }), 'met by pm (it replaces patching)')
assert.equal(satisfiedByLine({ id: 'patching', satisfied_by: null }), '')
assert.equal(satisfiedByLine({ satisfied_by: 5 }), '')
assert.equal(satisfiedByLine(null), '')
assert.equal(conflictLine({ id: 'pm', replaces: 'patching' }), 'Both were enabled. Core kept patching and is switching pm off.')
const s = replacementSummary({ id: 'pm', replaces: 'patching', replacement: { honoured: false, reason: 'target-enabled', conflict: true } })
assert.ok(s.lines.includes('Both were enabled. Core kept patching and is switching pm off.'))
assert.ok(!s.lines.join('\n').includes('disable the core module first'))
assert.ok(!replacementSummary({ id: 'pm', replaces: 'patching', replacement: { honoured: false, reason: 'target-enabled' } }).lines.join('\n').includes('Core kept'))

// Source: the view asks before Enable and Install, and never uses v-html.
const view = fs.readFileSync(new URL('../src/views/ModulesView.vue', import.meta.url), 'utf8')
assert.match(view, /setModuleEnabled\(item\.id, true, false, willDisableIds\(item\.will_disable\)\)/)
assert.match(view, /replacementConfirmLines\(confirmTarget\.value\.id, confirmTarget\.value\.will_disable\)/)
assert.match(view, /const summary = installConfirmSummary\(plan\.value\)\n\s*if \(summary\.ids\.length\) \{\n\s*installConfirm\.value = [^\n]*\n\s*return\n\s*\}\n\s*await runInstall\(\[\]\)/)
assert.match(view, /installModuleArtifact\(\n\s*staged\.value\.upload_id,[\s\S]*?installOrder\.value,\n\s*disableReplaced,/)
assert.match(view, /confirmationRequired\(e\)/)
assert.match(view, /v-if="installConfirm"/)
assert.match(view, /@click="confirmInstall"/)
assert.match(view, /satisfiedFor\(selected,id\)/)
assert.ok(!/v-html/.test(view))
const pkg = JSON.parse(fs.readFileSync(new URL('../tec_tac_package.json', import.meta.url), 'utf8'))
assert.equal(pkg.requires['tec-tac-framework'], '>=1.17.12,<2.0.0')
const helper = fs.readFileSync(new URL('../src/module-replacement.js', import.meta.url), 'utf8')
assert.ok(!/^import /m.test(helper))
console.log('module-replacement-confirm-0.12.89: ok')
