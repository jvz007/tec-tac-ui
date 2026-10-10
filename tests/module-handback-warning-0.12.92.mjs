// 0.12.92: the hand-back warning before a replacement is disabled or uninstalled while its replaced module cannot come
// back (Core 1.17.14 disable, 1.17.15 uninstall), the confirm_without_hand_back resend, and the step-two dependants.
import assert from 'node:assert/strict'
import fs from 'node:fs'

globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'abc123' : null), setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const modulesSource = read('../src/modules.js').replace(/from '[.][/]api'/, `from '${new URL('../src/api.js', import.meta.url).href}'`)
const { setModuleEnabled, removeModule } = await import(`data:text/javascript;base64,${Buffer.from(modulesSource).toString('base64')}`)
const rep = await import('../src/module-replacement.js')
const { handBackRequiredPayload, handBackWarning, handBackUnavailableRows, dependantLines, dependantsRows, secondConfirmationRequiredPayload, secondConfirmationRequired, willDisableIds } = rep

// (1) request bodies: the flag is sent only when it is exactly true; old callers send the old bodies
const calls = []
globalThis.fetch = async (url, init) => {
  calls.push({ url, init })
  return new Response(JSON.stringify({ job_id: 'j1' }), { status: 200, headers: { 'content-type': 'application/json' } })
}
const body = () => JSON.parse(calls[calls.length - 1].init.body)
await setModuleEnabled('patching', false, false)
assert.deepEqual(body(), { enabled: false, cascade: false }, 'old disable body unchanged')
await setModuleEnabled('patching', false, false, [], false, true)
assert.deepEqual(body(), { enabled: false, cascade: false, confirm_without_hand_back: true }, 'disable resend carries the flag')
assert.match(calls[calls.length - 1].url, /\/api\/tfd\/modules\/v2\/patching\/state\/$/)
for (const bad of [false, undefined, null, 'true', 1, {}, [true]]) {
  await setModuleEnabled('patching', false, false, [], false, bad)
  assert.ok(!('confirm_without_hand_back' in body()), `flag ${JSON.stringify(bad)} adds nothing`)
}
await removeModule('patching')
assert.equal(calls[calls.length - 1].init.body, '{}', 'old uninstall body unchanged')
assert.match(calls[calls.length - 1].url, /\/api\/tfd\/modules\/patching\/remove\/$/)
await removeModule('patching', true)
assert.deepEqual(body(), { confirm_without_hand_back: true }, 'uninstall resend carries the flag')
for (const bad of [false, 'true', 1, null]) {
  await removeModule('patching', bad)
  assert.equal(calls[calls.length - 1].init.body, '{}', `uninstall flag ${JSON.stringify(bad)} adds nothing`)
}

// (2) the refusal shapes (disable and uninstall use the same code and fields)
const unavailable = [{ module: 'pm', reasons: ['Licensing is disabled.', 'Its version is too old.'], required_modules: ['licensing'] }]
const refusal = (extra = {}, status = 400) => Object.assign(new Error('Core says no.'), {
  status,
  payload: { code: 'replacement_hand_back_confirmation_required', module: 'patching', detail: 'Core detail.', will_enable: ['other'], hand_back_unavailable: unavailable, ...extra },
  code: 'replacement_hand_back_confirmation_required',
})
const parsed = handBackRequiredPayload(refusal())
assert.deepEqual(parsed, {
  module: 'patching',
  willEnable: ['other'],
  unavailable: [{ module: 'pm', reasons: ['Licensing is disabled.', 'Its version is too old.'], required: ['licensing'] }],
  detail: 'Core detail.',
})
assert.equal(handBackRequiredPayload(refusal({}, 401)), null, 'not a 400 is not this refusal')
assert.equal(handBackRequiredPayload(refusal({ code: 'replacement_second_confirmation_required' })), null, 'another code is not this refusal')
assert.equal(handBackRequiredPayload(new Error('x')), null)
assert.deepEqual(handBackUnavailableRows([{ module: '', reasons: ['x'] }, null, 'pm', { module: 'b' }]), [{ module: 'b', reasons: [], required: [] }], 'malformed rows drop out')

// (3) the warning text lists each module's reasons and the module it needs
const disable = handBackWarning('disable', 'patching', unavailable, ['other'])
assert.equal(disable.lines[0], 'Disabling patching leaves pm switched off, because it cannot come back cleanly.')
assert.ok(disable.lines.includes('pm: Licensing is disabled; Its version is too old. It needs licensing.'), disable.lines.join('\n'))
assert.ok(disable.lines.includes('other still comes back on.'))
assert.ok(disable.lines.some((line) => /nothing serves its routes and contracts/.test(line)))
assert.equal(disable.button, 'Disable patching and leave pm off')
const remove = handBackWarning('remove', 'patching', [
  { module: 'pm', reasons: [], required_modules: [] },
  { module: 'pm2', reasons: ['Not managed from the UI.'], required_modules: ['licensing', 'agents'] },
], [])
assert.equal(remove.lines[0], 'Uninstalling patching leaves pm and pm2 switched off, because they cannot come back cleanly.')
assert.ok(remove.lines.includes('pm: Core did not say why. '.trim()), remove.lines.join('\n'))
assert.ok(remove.lines.includes('pm2: Not managed from the UI. It needs licensing and agents.'))
assert.ok(!remove.lines.some((line) => /still comes back on/.test(line)), 'no line when nothing comes back')
assert.equal(remove.button, 'Uninstall patching and leave pm and pm2 off')
assert.deepEqual(handBackWarning('disable', 'patching', [], ['other']), { lines: [], button: '' }, 'nothing to warn about')

// (4) the step-two dependants: from the row field and from the refusal payload, matched to the module switched off
const rowDependants = [{ replacement: 'pm', modules: ['agents', 'scripts'] }, { replacement: 'other', modules: ['x'] }]
assert.deepEqual(dependantsRows([{ replacement: 'pm', modules: ['a', ''] }, { replacement: '', modules: ['b'] }, { replacement: 'pm', modules: [] }]), [{ replacement: 'pm', modules: ['a'] }])
assert.deepEqual(dependantLines(rowDependants, ['pm']), ['agents and scripts name pm as a dependency. They stay enabled. Check that they still work once pm is switched off.'])
assert.deepEqual(dependantLines(rowDependants, ['pm', 'other']).length, 2)
assert.deepEqual(dependantLines(rowDependants, ['missing']), [])
assert.deepEqual(dependantLines(undefined, ['pm']), [])
const second = secondConfirmationRequiredPayload(Object.assign(new Error('x'), {
  status: 400,
  payload: { code: 'replacement_second_confirmation_required', will_disable: ['pm'], module: 'patching', detail: 'D', dependants: [{ replacement: 'pm', modules: ['agents'] }] },
}))
assert.deepEqual(second, { willDisable: ['pm'], detail: 'D', module: 'patching', dependants: [{ replacement: 'pm', modules: ['agents'] }] })
assert.deepEqual(dependantLines(second.dependants, second.willDisable), ['agents names pm as a dependency. agents stays enabled. Check that it still works once pm is switched off.'])
assert.deepEqual(secondConfirmationRequiredPayload(Object.assign(new Error('x'), { status: 400, payload: { code: 'replacement_second_confirmation_required', will_disable: ['pm'], module: 'patching', detail: 'D' } })), { willDisable: ['pm'], detail: 'D', module: 'patching' }, 'an older answer keeps its shape')
assert.equal(secondConfirmationRequired({ second_confirmation_required: true, will_disable: willDisableIds(['pm']) }), true)

// (5) the page: run the real confirm flow from the source against stubs
const view = read('../src/views/ModulesView.vue')
const extract = (name) => {
  const found = view.indexOf(`function ${name}(`)
  assert.ok(found > 0, `${name} exists`)
  const start = view.slice(found - 6, found) === 'async ' ? found - 6 : found
  const open = view.indexOf('{', start)
  let depth = 0
  for (let i = open; i < view.length; i += 1) {
    if (view[i] === '{') depth += 1
    if (view[i] === '}') { depth -= 1; if (depth === 0) return view.slice(start, i + 1) }
  }
  throw new Error(`${name} does not close`)
}
const source = ['showHandBackWarning', 'handBackRefused', 'confirmHandBack', 'closeConfirm', 'confirmAction'].map(extract).join('\n')

function harness({ target, mode, api = {}, cascadeValue = false, checkValid = true }) {
  const ref = (value) => ({ value })
  const state = {
    confirmTarget: ref(target), confirmMode: ref(mode), confirmText: ref(target.id), cascade: ref(cascadeValue),
    listChanged: ref(''), confirmStep: ref(1), switchAck: ref(false), handBack: ref(null), handBackBusy: ref(false), error: ref(''),
  }
  const log = { calls: [], jobs: [] }
  const params = {
    ...state,
    secondConfirmationRequired,
    handleEnableRefusal: () => false,
    willDisableIds,
    handBackRequiredPayload,
    handBackWarning,
    beginPoll: (job) => log.jobs.push(job),
    setModuleEnabled: async (...args) => { log.calls.push(['setModuleEnabled', ...args]); return api.setModuleEnabled(...args) },
    removeModule: async (...args) => { log.calls.push(['removeModule', ...args]); return api.removeModule(...args) },
    checkModuleRemoval: async () => ({ valid: checkValid, dependants: [] }),
  }
  const fns = new Function(...Object.keys(params), `${source}; return { confirmAction, confirmHandBack, closeConfirm }`)(...Object.values(params))
  return { ...fns, state, log }
}
const row = (extra = {}) => ({ id: 'patching', enabled: true, hand_back_confirmation_required: false, will_enable: ['other'], hand_back_unavailable: unavailable, ...extra })
const noCalls = async () => { throw new Error('must not be sent') }

// A. the row already says hand-back is needed: the warning comes first and nothing is sent
{
  const h = harness({ target: row({ hand_back_confirmation_required: true }), mode: 'disable', api: { setModuleEnabled: noCalls } })
  await h.confirmAction()
  assert.equal(h.log.calls.length, 0, 'nothing sent before the warning')
  assert.equal(h.state.handBack.value.mode, 'disable')
  assert.ok(h.state.handBack.value.lines.some((line) => line === 'pm: Licensing is disabled; Its version is too old. It needs licensing.'))
  h.closeConfirm() // Cancel
  assert.equal(h.state.handBack.value, null)
  assert.equal(h.state.confirmTarget.value, null)
  assert.equal(h.log.calls.length, 0, 'Cancel sends nothing')
  assert.equal(h.log.jobs.length, 0)
}

// B. the row does not say so: the first request is refused, nothing queued, then the warning; Continue resends with the flag
{
  const requests = []
  const h = harness({
    target: row(),
    mode: 'disable',
    cascadeValue: false,
    api: {
      setModuleEnabled: async (id, enabled, cascade, disable, confirmSwitch, confirmWithoutHandBack) => {
        requests.push({ id, enabled, cascade, disable, confirmSwitch, confirmWithoutHandBack })
        if (confirmWithoutHandBack === true) return { job_id: 'job-2' }
        throw refusal()
      },
    },
  })
  await h.confirmAction()
  assert.deepEqual(requests, [{ id: 'patching', enabled: false, cascade: false, disable: undefined, confirmSwitch: undefined, confirmWithoutHandBack: undefined }])
  assert.deepEqual(h.log.jobs, [], 'nothing queued by the refused request')
  assert.ok(h.state.handBack.value, 'warning shown')
  assert.equal(h.state.error.value, '')
  await h.confirmHandBack()
  assert.equal(requests.length, 2)
  assert.equal(requests[1].confirmWithoutHandBack, true, 'the resend carries the flag')
  assert.deepEqual(h.log.jobs, [{ job_id: 'job-2' }])
  assert.equal(h.state.confirmTarget.value, null, 'dialog closed after the job is queued')
}

// C. the list changed between the two calls: the dialog shows Core's fresh list and asks again, nothing queued
{
  let attempts = 0
  const h = harness({
    target: row({ hand_back_confirmation_required: true }),
    mode: 'disable',
    api: {
      setModuleEnabled: async () => {
        attempts += 1
        throw refusal({ hand_back_unavailable: [{ module: 'pm2', reasons: ['Gone.'], required_modules: [] }] })
      },
    },
  })
  await h.confirmAction()
  assert.equal(attempts, 0)
  await h.confirmHandBack()
  assert.equal(attempts, 1)
  assert.ok(h.state.handBack.value.lines.some((line) => line === 'pm2: Gone.'), 'fresh list shown')
  assert.ok(!h.state.handBack.value.lines.some((line) => /^pm:/.test(line)), 'old list gone')
  assert.match(h.state.listChanged.value, /changed while you were reading it/)
  assert.equal(h.state.confirmTarget.value.id, 'patching', 'dialog still open')
  assert.deepEqual(h.log.jobs, [])
}

// D. uninstall of a replacement: refused first, then the warning names uninstall; Continue sends the uninstall with the flag
{
  const sent = []
  const h = harness({
    target: row(),
    mode: 'remove',
    api: {
      removeModule: async (id, confirmWithoutHandBack) => {
        sent.push({ id, confirmWithoutHandBack })
        if (confirmWithoutHandBack === true) return { job_id: 'job-remove' }
        throw refusal()
      },
    },
  })
  await h.confirmAction()
  assert.deepEqual(sent, [{ id: 'patching', confirmWithoutHandBack: undefined }])
  assert.equal(h.state.handBack.value.mode, 'remove')
  assert.equal(h.state.handBack.value.button, 'Uninstall patching and leave pm off')
  assert.equal(h.state.handBack.value.lines[0], 'Uninstalling patching leaves pm switched off, because it cannot come back cleanly.')
  await h.confirmHandBack()
  assert.deepEqual(sent[1], { id: 'patching', confirmWithoutHandBack: true })
  assert.deepEqual(h.log.jobs, [{ job_id: 'job-remove' }])
}

// E. any other failure is shown as the error; no warning opens
{
  const h = harness({ target: row(), mode: 'disable', api: { setModuleEnabled: async () => { throw new Error('Network down') } } })
  await h.confirmAction()
  assert.equal(h.state.handBack.value, null)
  assert.equal(h.state.error.value, 'Network down')
}

// F. a refusal that names nothing to hand back is shown as Core's message, not as an empty warning
{
  const h = harness({ target: row(), mode: 'disable', api: { setModuleEnabled: async () => { throw refusal({ hand_back_unavailable: [] }) } } })
  await h.confirmAction()
  assert.equal(h.state.handBack.value, null)
  assert.equal(h.state.error.value, 'Core says no.')
}

// G. the page wires the step-two dependants and the dialog branch
assert.match(view, /const secondDependantLines = computed\(/)
assert.match(view, /dependantLines\(confirmTarget\.value\.replacement_dependants, confirmTarget\.value\.will_disable\)/)
assert.match(view, /v-for="\(line,index\) in secondDependantLines"/)
assert.match(view, /replacement_dependants: second\.dependants \?\? item\.replacement_dependants/)
assert.match(view, /<template v-if="handBack">/)
assert.match(view, /@click="confirmHandBack"/)
assert.match(view, /setModuleEnabled\(item\.id, false, cascade\.value\)/, 'the first disable request is unchanged')
assert.match(view, /removeModule\(item\.id\)/, 'the first uninstall request is unchanged')

console.log('module-handback-warning-0.12.92: ok')
