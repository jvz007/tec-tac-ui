// 0.12.90: AD-20 hand-back (Core 1.17.12): second confirmation before a replaced module switches its replacement off,
// will_enable on a replacement, job switch lines, and the Core requirement.
import assert from 'node:assert/strict'
import fs from 'node:fs'

globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'abc123' : null), setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const modulesSource = read('../src/modules.js').replace(/from '[.][/]api'/, `from '${new URL('../src/api.js', import.meta.url).href}'`)
const { setModuleEnabled, installModuleArtifact } = await import(`data:text/javascript;base64,${Buffer.from(modulesSource).toString('base64')}`)
const rep = await import('../src/module-replacement.js')
const {
  secondConfirmationRequired, handBackEnableLines, secondConfirmationText, secondConfirmationRequiredPayload,
  willEnableIds, handBackDisableLines, jobSwitchLines, replacementSummary, replacementConfirmLines, confirmationRequired,
} = rep

// (1) request bodies
const calls = []
globalThis.fetch = async (url, init) => {
  calls.push({ url, init })
  return new Response(JSON.stringify({ job_id: 'j1' }), { status: 200, headers: { 'content-type': 'application/json' } })
}
const body = () => JSON.parse(calls[calls.length - 1].init.body)
await setModuleEnabled('agents', true)
assert.deepEqual(body(), { enabled: true, cascade: false })
await setModuleEnabled('agents', true, false, ['pm'])
assert.deepEqual(body(), { enabled: true, cascade: false, disable_replaced: ['pm'] })
await setModuleEnabled('agents', true, false, ['pm'], true)
assert.deepEqual(body(), { enabled: true, cascade: false, disable_replaced: ['pm'], confirm_replacement_switch: true })
for (const bad of [false, undefined, null, 'true', 1, {}, [true]]) {
  await setModuleEnabled('agents', true, false, ['pm'], bad)
  assert.ok(!('confirm_replacement_switch' in body()), `confirmSwitch ${JSON.stringify(bad)} adds nothing`)
}
await setModuleEnabled('pm', false, true)
assert.deepEqual(body(), { enabled: false, cascade: true })
await installModuleArtifact('u1', 'artifact', [], ['x'])
assert.ok(!('confirm_replacement_switch' in body()), 'install never sends the second flag')
assert.deepEqual(body().disable_replaced, ['x'])

// (2) secondConfirmationRequired
assert.equal(secondConfirmationRequired(null), false)
assert.equal(secondConfirmationRequired({}), false)
assert.equal(secondConfirmationRequired({ second_confirmation_required: false, will_disable: ['pm'] }), false)
assert.equal(secondConfirmationRequired({ second_confirmation_required: true, will_disable: [] }), false)
assert.equal(secondConfirmationRequired({ second_confirmation_required: true }), false)
assert.equal(secondConfirmationRequired({ second_confirmation_required: 'true', will_disable: ['pm'] }), false)
assert.equal(secondConfirmationRequired({ second_confirmation_required: true, will_disable: ['pm'] }), true)

// (3) wording
const one = handBackEnableLines('patching', ['pm'])
assert.equal(one[0], 'Enabling patching will switch off pm, the replacement, which is enabled now.')
assert.ok(one.some((l) => l === 'pm stays installed.'))
assert.ok(one.some((l) => l === 'patching takes its routes and contracts back.'))
assert.ok(one.some((l) => /Disabling pm later switches patching back on/.test(l)))
const two = handBackEnableLines('patching', ['pm', 'pm2'])
assert.match(two[0], /pm and pm2, the replacements, which are enabled now/)
assert.ok(two.includes('They stay installed.'))
assert.deepEqual(handBackEnableLines('patching', []), [])
assert.deepEqual(handBackEnableLines('patching', 'pm'), [])
assert.deepEqual(replacementConfirmLines('pm', ['patching']), [
  'Enabling pm will switch off patching.', 'patching stays installed.', 'pm takes over its routes and contracts.',
  'You can switch patching back on later by disabling pm first.',
], 'the replacement direction is unchanged')
const t1 = secondConfirmationText(['pm'], 'patching')
assert.equal(t1.checkbox, 'I understand pm will be switched off')
assert.equal(t1.button, 'Switch pm off and enable patching')
assert.match(t1.warning, /^pm is enabled and in use\./)
const t2 = secondConfirmationText(['a', 'b', 'c'], 'x')
assert.equal(t2.checkbox, 'I understand a, b and c will be switched off')
assert.equal(t2.button, 'Switch a, b and c off and enable x')
assert.deepEqual(secondConfirmationText([], 'x'), { warning: '', checkbox: '', button: '' })

// (4) the second-confirmation refusal
const refusal = (status, payload, code) => Object.assign(new Error('refused'), { status, payload, code })
assert.deepEqual(
  secondConfirmationRequiredPayload(refusal(400, { code: 'replacement_second_confirmation_required', detail: 'Confirm again.', will_disable: ['pm', 'pm', ''], module: 'patching' })),
  { willDisable: ['pm'], detail: 'Confirm again.', module: 'patching' },
)
assert.deepEqual(secondConfirmationRequiredPayload(refusal(400, null, 'replacement_second_confirmation_required')), { willDisable: [], detail: '', module: '' })
assert.equal(secondConfirmationRequiredPayload(refusal(400, { code: 'replacement_confirmation_required', will_disable: ['pm'] })), null)
assert.equal(secondConfirmationRequiredPayload(refusal(400, { detail: 'plain refusal' })), null)
assert.equal(secondConfirmationRequiredPayload(refusal(409, { code: 'replacement_second_confirmation_required' })), null)
assert.equal(secondConfirmationRequiredPayload(refusal(0, null)), null)
assert.equal(secondConfirmationRequiredPayload(null), null)
assert.equal(secondConfirmationRequiredPayload(undefined), null)
assert.equal(confirmationRequired(refusal(400, { code: 'replacement_second_confirmation_required', will_disable: ['pm'] })), null, 'the first-code helper ignores the second code')

// (5) will_enable on a replacement
assert.deepEqual(willEnableIds(undefined), [])
assert.deepEqual(willEnableIds('patching'), [])
assert.deepEqual(willEnableIds({}), [])
assert.deepEqual(willEnableIds([1, null, ' a ', 'a', '']), ['a'])
assert.deepEqual(handBackDisableLines('pm', []), [])
assert.deepEqual(handBackDisableLines('pm', 'patching'), [])
assert.deepEqual(handBackDisableLines('pm', ['patching']), ['Disabling pm switches patching back on in the same job.'])
assert.deepEqual(handBackDisableLines('pm', ['a', 'b']), ['Disabling pm switches a and b back on in the same job.'])
const active = replacementSummary({ id: 'pm', replaces: 'patching', will_enable: ['patching'], replacement: { honoured: true } })
assert.ok(active.lines.includes('Disabling this module switches patching back on in the same job.'))
const none = replacementSummary({ id: 'pm', replaces: 'patching', replacement: { honoured: true } })
assert.ok(!none.lines.some((l) => /back on/.test(l)))
const notActive = replacementSummary({ id: 'pm', replaces: 'patching', will_enable: ['patching'], replacement: { honoured: false, reason: 'replacement-disabled' } })
assert.ok(!notActive.lines.some((l) => /back on in the same job/.test(l)), 'only an enabled replacement hands back')

// (6) job rows
assert.deepEqual(jobSwitchLines({ disabled_modules: ['a'], enabled_modules: ['b', 'c'], reconciled_modules: ['d'] }),
  ['Switched off: a', 'Switched on: b, c', 'Conflict resolved: d'])
assert.deepEqual(jobSwitchLines({ enabled_modules: ['b'] }), ['Switched on: b'])
assert.deepEqual(jobSwitchLines({}), [])
assert.deepEqual(jobSwitchLines(null), [])
assert.deepEqual(jobSwitchLines({ disabled_modules: 'a', enabled_modules: null, reconciled_modules: {} }), [])
assert.deepEqual(jobSwitchLines({ disabled_modules: [], enabled_modules: [''] }), [])

// (7) source scan of the Modules page
const view = read('../src/views/ModulesView.vue')
assert.match(view, /confirmStep/)
assert.match(view, /needsSecondConfirmation/)
assert.match(view, /v-model="switchAck"/)
assert.match(view, /@click="confirmSwitchAction"/)
// Only the second-step handler passes confirmSwitch = true.
assert.equal((view.match(/willDisableIds\(item\.will_disable\), true\)/g) || []).length, 1, 'exactly one call sends the confirm flag')
const switchHandler = view.slice(view.indexOf('async function confirmSwitchAction'), view.indexOf('function handleEnableRefusal'))
assert.match(switchHandler, /setModuleEnabled\(item\.id, true, false, willDisableIds\(item\.will_disable\), true\)/)
assert.match(switchHandler, /confirmStep\.value !== 2/)
assert.match(switchHandler, /!switchAck\.value/)
assert.match(switchHandler, /secondConfirmationRequired\(item\)/, 'a replacement-direction enable never reaches the flag')
const mainHandler = view.slice(view.indexOf('async function confirmAction'), view.indexOf('async function confirmSwitchAction'))
assert.ok(!mainHandler.includes('confirm_replacement_switch') && !mainHandler.includes('will_disable), true)'), 'the first handler sends no confirm flag')
assert.match(mainHandler, /secondConfirmationRequired\(item\)\) \{ confirmStep\.value = 2/)
assert.ok(!view.includes('confirm_replacement_switch'), 'the page never names the wire field; modules.js owns it')
// Stale rows: both Core codes are handled, one goes forward, one goes back.
const refusalHandler = view.slice(view.indexOf('function handleEnableRefusal'), view.indexOf('async function setVisibility'))
assert.match(refusalHandler, /secondConfirmationRequiredPayload\(e\)/)
assert.match(refusalHandler, /confirmationRequired\(e\)/)
assert.match(refusalHandler, /confirmStep\.value = 2/) // 0.12.91: an empty list no longer goes back to step one (module-replacement-second-empty-0.12.91.mjs)
assert.match(refusalHandler, /confirmStep\.value = 1/)
// The disable dialog shows will_enable and sends no confirm flag.
assert.match(view, /handBackDisableLines\(confirmTarget\.value\.id, confirmTarget\.value\.will_enable\)/)
assert.match(view, /v-for="\(line,index\) in disableNotice"/)
assert.match(view, /setModuleEnabled\(item\.id, false, cascade\.value\)/)
// Job lines in the active job and the history record.
assert.match(view, /jobSwitchLines\(activeJob\)/)
assert.match(view, /jobSwitchLines\(selectedHistory\)/)
// Hidden when denied is unchanged.
assert.match(view, /const canManage = computed\(\(\) => managerAllowed\.value/)

// (8) versions and the Core requirement
const version = read('../VERSION').trim()
assert.match(version, /^0\.12\.\d+/) // 0.12.91: pinned versions live in the newest test
assert.equal(JSON.parse(read('../package.json')).version, version)
const pkg = JSON.parse(read('../tec_tac_package.json'))
assert.equal(pkg.version, version)
assert.equal(pkg.requires['tec-tac-framework'], '>=1.17.15,<2.0.0')
const notes = read('../docs/releases/RELEASE_NOTES_0.12.90.md')
assert.match(notes, /Core 1\.17\.12/)
assert.match(notes, /contract export/)

console.log('module-replacement-handback-0.12.90: ok')
