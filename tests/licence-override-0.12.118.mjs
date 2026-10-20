// 0.12.118: the audited licence override on stage and install (Core 1.17.58, part 3). The control shows only for a superuser after an
// enforce-mode 403 'licensing_requirement_failed'. The field name and encoding per route, the body of a call without a reason
// (exactly what it was), the reason cleared after each try and never carried from stage to install, the validation, the two plain
// errors, the Yes or No, and that the reason text never reaches the console or browser storage.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { moduleManagerSource } from './helpers/module-manager-source.mjs'

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
const modulesSource = read('../src/modules.js').replace(/from '[.][/]api'/, `from '${new URL('../src/api.js', import.meta.url).href}'`)
const modules = await import(`data:text/javascript;base64,${Buffer.from(modulesSource).toString('base64')}`)
const lic = await import(new URL('../src/licensing.js', import.meta.url).href)

const refusal403 = (over = {}) => Object.assign(new Error('Product reportmanager is not licensed.'), {
  status: 403,
  code: 'licensing_requirement_failed',
  payload: { detail: "Product 'reportmanager' is not licensed.", code: 'licensing_requirement_failed', licensing: { required: true, module: 'reportmanager', module_version: '1.0.0', state: 'unlicensed', enforcement_mode: 'enforce', reason: 'provider words' }, ...over },
})

// ---- when the control appears ----
const refusal = lic.readLicenceRefusal(refusal403())
assert.deepEqual(refusal, { detail: "Product 'reportmanager' is not licensed.", module: 'reportmanager', moduleVersion: '1.0.0', state: 'unlicensed' }, 'only the allow-listed fields')
assert.ok(!JSON.stringify(refusal).includes('provider words'), "a provider's own words are not shown")
const superuser = { user: { superuser: true } }
const manager = { user: { superuser: false }, permissions: ['core.privileged_operations'] }
assert.equal(lic.showOverride(superuser, refusal), true, 'superuser + enforce + licensing_requirement_failed')
assert.equal(lic.showOverride(manager, refusal), false, 'a non-superuser sees the plain refusal and no control')
assert.equal(lic.showOverride({}, refusal), false)
assert.equal(lic.showOverride(superuser, null), false)
const logOnly = refusal403(); logOnly.payload.licensing.enforcement_mode = 'log-only'
const off = refusal403(); off.payload.licensing.enforcement_mode = 'off'
const noMode = refusal403(); delete noMode.payload.licensing.enforcement_mode
assert.equal(lic.readLicenceRefusal(logOnly), null, 'never in log-only')
assert.equal(lic.readLicenceRefusal(off), null, 'never in off')
assert.equal(lic.readLicenceRefusal(noMode), null, 'an older Core that does not say the mode gets no control')
assert.equal(lic.readLicenceRefusal(Object.assign(new Error('x'), { status: 403, payload: { code: 'other_403', licensing: { enforcement_mode: 'enforce' } } })), null, 'another 403')
assert.equal(lic.readLicenceRefusal(Object.assign(new Error('x'), { status: 400, payload: { code: 'licensing_requirement_failed', licensing: { enforcement_mode: 'enforce' } } })), null, 'not a 403')
assert.equal(lic.readLicenceRefusal(null), null)
assert.equal(lic.readLicenceRefusal(new Error('plain')), null)

// ---- the request: field name and encoding per route ----
const fileLike = (name) => new File(['x'], name)
calls.length = 0
await modules.inspectModulePackages([fileLike('a.zip')], 'Emergency fix for ticket 42')
let body = calls[0].options.body
assert.ok(body instanceof FormData, 'inspect is multipart')
assert.equal(body.get('licence_override_reason'), 'Emergency fix for ticket 42', 'a form field on inspect')
assert.equal(calls[0].url, 'https://rmm.example.test/api/tfd/modules/v2/packages/inspect/')
calls.length = 0
await modules.installModuleArtifact('up1', 'artifact', ['a'], ['b'], 'Because')
assert.equal(calls[0].url, 'https://rmm.example.test/api/tfd/modules/v2/packages/up1/install/')
assert.deepEqual(JSON.parse(calls[0].options.body), { kind: 'artifact', order: ['a'], disable_replaced: ['b'], licence_override_reason: 'Because' }, 'a JSON string on install, added last, with the other fields unchanged')
assert.deepEqual(Object.keys(JSON.parse(calls[0].options.body)).pop(), 'licence_override_reason', 'the reason is the last key')
calls.length = 0
await modules.stageOnlineModulePackage('repo1', 'agents', '1.2.3', 'Because')
assert.equal(calls[0].url, 'https://rmm.example.test/api/tfd/modules/catalog/online/stage/')
assert.deepEqual(JSON.parse(calls[0].options.body), { repository_id: 'repo1', module_id: 'agents', version: '1.2.3', licence_override_reason: 'Because' })

// a call without a reason is what it was, byte for byte
calls.length = 0
await modules.inspectModulePackages([fileLike('a.zip')])
await modules.inspectModulePackages([fileLike('a.zip')], '')
await modules.inspectModulePackages([fileLike('a.zip')], undefined)
await modules.inspectModulePackages([fileLike('a.zip')], 42)
for (const call of calls) assert.equal(call.options.body.has('licence_override_reason'), false, 'inspect without a reason has no field')
calls.length = 0
await modules.installModuleArtifact('up1', 'artifact', ['a'], [])
await modules.installModuleArtifact('up1', 'artifact', ['a'], [], '')
await modules.installModuleArtifact('up1', 'artifact', ['a'], [], null)
for (const call of calls) assert.equal(call.options.body, '{"kind":"artifact","order":["a"]}', 'install without a reason is the old body exactly')
calls.length = 0
await modules.stageOnlineModulePackage('repo1', 'agents', '1.2.3')
await modules.stageOnlineModulePackage('repo1', 'agents', null, '')
assert.equal(calls[0].options.body, '{"repository_id":"repo1","module_id":"agents","version":"1.2.3"}', 'stage without a reason is the old body exactly')
assert.equal(calls[1].options.body, '{"repository_id":"repo1","module_id":"agents","version":null}')
// disable_replaced and the confirm flags are unchanged when an override is added
calls.length = 0
await modules.installModuleArtifact('up2', 'batch', ['x', 'y'], ['old'], 'R')
const withOverride = JSON.parse(calls[0].options.body)
await modules.installModuleArtifact('up2', 'batch', ['x', 'y'], ['old'])
const without = JSON.parse(calls[1].options.body)
delete withOverride.licence_override_reason
assert.deepEqual(withOverride, without, 'adding an override changes nothing else in the body')
assert.deepEqual(without, { kind: 'batch', order: ['x', 'y'], disable_replaced: ['old'] })

// ---- the page: reason cleared after each try, never carried, one retry per route ----
const view = moduleManagerSource()
assert.match(view, /\.\.\.\(typeof licenceReason === 'string' \? \[licenceReason\] : \[\]\)/, 'the reason is added to a call only when there is one')
assert.match(view, /noteLicenceRefusal\(e, \(reason\) => stageOnline\(item, reason\)/, 'a stage refusal retries the stage')
assert.match(view, /noteLicenceRefusal\(e, \(reason\) => runInstall\(disableReplaced, exact, afterSuccess, reloadHint, reason\)/, 'an install refusal retries the install with its own flags')
assert.match(view, /noteLicenceRefusal\(lastError, \(reason\) => runInspect\(reason\)/, 'an inspect refusal retries the inspect')
assert.match(view, /async function onLicenceOverride\(reason\)[\s\S]*await pending\.retry\(reason\)/, 'the reason goes straight into the retry')
assert.ok(!/ref\(''\)[^\n]*[Ll]icenceReason|licenceReason\s*=\s*ref|reasonCache|lastReason|savedReason/.test(view), 'the page stores no reason')
// stage -> install: the install does not reuse the stage's reason
const stageFn = view.slice(view.indexOf('async function stageOnline('), view.indexOf('async function refresh('))
assert.ok(!/installOrder[^\n]*licence|runInstall\([^)]*licenceReason/.test(stageFn), 'stage does not hand its reason to the install')
const installFn = view.slice(view.indexOf('async function runInstall('), view.indexOf('function notRunMessage('))
assert.ok(installFn.includes('licenceReason'), 'the install takes only a reason passed to this call')
assert.ok(!/confirmedDisable\.value\s*=\s*[^;\n]*licence/.test(installFn))
const component = read('../src/components/modules/LicenceOverride.vue')
assert.match(component, /const value = reason\.value\n\s*\/\/[^\n]*\n\s*reason\.value = ''\n\s*touched\.value = false\n\s*emit\('override', value\)/, 'the box is cleared as the reason is sent')
assert.match(component, /<LicenceOverride v-if|v-if="refusal"/)
assert.match(component, /<div v-if="allowed" class="mm-licence-reason">/, 'the box and button need a superuser')
assert.match(moduleManagerSource(), /<LicenceOverride v-if="licenceRefusal"/)
assert.match(view, /function clearLicence\(\) \{ licenceRefusal\.value = null; licenceFailure\.value = null \}/)
for (const fn of ['stageOnline', 'runInstall', 'runInspect']) {
  const start = view.indexOf(`async function ${fn}(`)
  assert.ok(view.slice(start, start + 900).includes('clearLicence()'), `${fn} clears the old refusal before it sends`)
}

// ---- reason validation (Core decides; this saves a round trip) ----
assert.equal(lic.validateOverrideReason('A good reason').valid, true)
assert.equal(lic.validateOverrideReason('x'.repeat(500)).valid, true, '500 is allowed')
assert.equal(lic.validateOverrideReason('x'.repeat(501)).valid, false, '501 is not')
assert.equal(lic.validateOverrideReason('').valid, false)
assert.equal(lic.validateOverrideReason('   ').valid, false, 'only spaces is empty')
assert.equal(lic.validateOverrideReason('bad\u0007bell').valid, false, 'a control character')
assert.equal(lic.validateOverrideReason('new\nline').valid, false)
assert.equal(lic.validateOverrideReason('hidden​space').valid, false, 'an invisible character')
assert.equal(lic.validateOverrideReason('bidi‮text').valid, false)
assert.equal(lic.validateOverrideReason(42).valid, false)
assert.equal(lic.validateOverrideReason(null).valid, false)
assert.equal(lic.OVERRIDE_MAX, 500)
assert.equal(lic.overrideReasonValue(''), null)
assert.equal(lic.overrideReasonValue('r'), 'r')
assert.equal(lic.overrideReasonValue(5), null)

// ---- the two plain errors ----
assert.equal(lic.overrideErrorSentence({ status: 403, code: 'licence_override_superuser_required', message: 'x' }), 'Only a superuser can override a licence refusal.')
assert.equal(lic.overrideErrorSentence({ status: 400, payload: { code: 'invalid_licence_override_reason' }, message: 'x' }), 'Enter a reason of 1 to 500 characters, with no control or hidden characters.')
assert.equal(lic.overrideErrorSentence({ status: 500, message: 'Server said no.' }), 'Server said no.')

// ---- Yes or No only; the words the person sees ----
assert.deepEqual(lic.overrideConfirmation('reportmanager'), { question: 'Let reportmanager through without a licence?', detail: 'Core records your reason and your name.', danger: true })
assert.match(component, /if \(!\(await askConfirm\(\{ question: ask\.question, detail: ask\.detail, danger: ask\.danger \}\)\)\) return/)
assert.ok(component.indexOf('await askConfirm') < component.indexOf("emit('override'"), 'the confirm comes before anything is sent')
assert.match(component, /Override and try again/)

// ---- the reason never reaches the console or storage ----
const all = component + read('../src/licensing.js') + view
assert.ok(!/console\.(log|info|warn|error|debug)/.test(component + read('../src/licensing.js')), 'no console output in the override code')
assert.ok(!/localStorage|sessionStorage|indexedDB/.test(component + read('../src/licensing.js')), 'no browser storage in the override code')
assert.ok(!/console\.[a-z]+\([^)]*[Rr]eason/.test(all), 'the reason is never logged')
assert.equal(store.length, 0, 'nothing was written to storage while the calls ran')
console.log('licence-override-0.12.118: ok')
