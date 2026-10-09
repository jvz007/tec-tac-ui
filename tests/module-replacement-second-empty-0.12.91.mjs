// 0.12.91: a second-confirmation refusal with an empty or missing will_disable closes the dialog,
// shows Core's own words and reloads, instead of returning to step one.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { emptySecondConfirmationText, secondConfirmationRequiredPayload } = await import('../src/module-replacement.js')

const refusal = (extra) => Object.assign(new Error('x'), { status: 400, payload: { code: 'replacement_second_confirmation_required', module: 'patching', ...extra } })

// payload shape is unchanged
assert.deepEqual(secondConfirmationRequiredPayload(refusal({ will_disable: ['pm'], detail: 'D' })), { willDisable: ['pm'], detail: 'D', module: 'patching' })
assert.deepEqual(secondConfirmationRequiredPayload(refusal({ will_disable: [] })), { willDisable: [], detail: '', module: 'patching' })
assert.deepEqual(secondConfirmationRequiredPayload(refusal({})), { willDisable: [], detail: '', module: 'patching' })
assert.equal(secondConfirmationRequiredPayload(new Error('x')), null)

// text: Core's detail wins, else a plain sentence
assert.equal(emptySecondConfirmationText({ willDisable: [], detail: 'Core says: nothing to do.' }), 'Core says: nothing to do.')
for (const second of [{ willDisable: [], detail: '' }, { detail: '   ' }, {}, null, undefined]) {
  const t = emptySecondConfirmationText(second)
  assert.match(t, /second confirmation/)
  assert.match(t, /Nothing was changed/)
}

// the page: run handleEnableRefusal from the real source against stubs
const view = fs.readFileSync(new URL('../src/views/ModulesView.vue', import.meta.url), 'utf8')
const start = view.indexOf('function handleEnableRefusal(e, item) {')
assert.ok(start > 0)
let depth = 0
let end = start
for (let i = view.indexOf('{', start); i < view.length; i += 1) {
  if (view[i] === '{') depth += 1
  if (view[i] === '}') { depth -= 1; if (depth === 0) { end = i + 1; break } }
}
const body = view.slice(start, end)
const run = (error) => {
  const state = { confirmTarget: { value: { id: 'patching' } }, listChanged: { value: '' }, switchAck: { value: true }, confirmStep: { value: 2 }, confirmText: { value: 'patching' }, error: { value: '' }, refreshed: [], closed: 0 }
  const closeConfirm = () => { state.closed += 1; state.confirmTarget.value = null; state.confirmText.value = ''; state.switchAck.value = false; state.confirmStep.value = 1 }
  const refresh = (id) => { state.error.value = ''; state.refreshed.push(id) }
  const factory = new Function('secondConfirmationRequiredPayload', 'emptySecondConfirmationText', 'confirmationRequired', 'replacementListChangedText', 'confirmTarget', 'listChanged', 'switchAck', 'confirmStep', 'error', 'closeConfirm', 'refresh', `${body}; return handleEnableRefusal`)
  const fn = factory(secondConfirmationRequiredPayload, emptySecondConfirmationText, () => null, () => 'changed', state.confirmTarget, state.listChanged, state.switchAck, state.confirmStep, state.error, closeConfirm, refresh)
  const handled = fn(error, { id: 'patching', second_confirmation_required: true })
  return { handled, state }
}
for (const extra of [{ will_disable: [], detail: 'Core detail.' }, { detail: 'Core detail.' }]) {
  const { handled, state } = run(refusal(extra))
  assert.equal(handled, true)
  assert.equal(state.closed, 1, 'dialog closed')
  assert.equal(state.confirmTarget.value, null)
  assert.equal(state.confirmText.value, '')
  assert.equal(state.switchAck.value, false)
  assert.equal(state.error.value, 'Core detail.')
  assert.deepEqual(state.refreshed, ['patching'], 'rows reloaded')
}
{
  const { state } = run(refusal({ will_disable: [] }))
  assert.match(state.error.value, /second confirmation/, 'fallback sentence')
}
// a non-empty list still moves to step two
{
  const { handled, state } = run(refusal({ will_disable: ['pm'], detail: 'Fresh.' }))
  assert.equal(handled, true)
  assert.equal(state.closed, 0)
  assert.equal(state.confirmStep.value, 2)
  assert.equal(state.confirmTarget.value.second_confirmation_required, true)
  assert.deepEqual(state.confirmTarget.value.will_disable, ['pm'])
  assert.equal(state.listChanged.value, 'Fresh.')
  assert.equal(state.switchAck.value, false)
  assert.deepEqual(state.refreshed, [])
}
console.log('module-replacement-second-empty-0.12.91: ok')
