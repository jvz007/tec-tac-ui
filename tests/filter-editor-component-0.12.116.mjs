// 0.12.116: FilterEditor rendered with a fake api (style of shared-select-server-search-0.12.112): the exact request URLs for fields and
// values, page 2 on more, the search cut at 100, a stale answer dropped, the old request aborted, a 502 turning the picker into a
// text box with no further values call, available:false, Core's own detail, and no v-html or browser storage in the source.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { FIELDS, byLabel, button, click, failure, fakeApi, find, flush, mountEditor, sleep, textOf } from './fixtures/filter-editor-harness.mjs'

const { createFilterEditorService } = await import(new URL('../src/filter-editor.js', import.meta.url).href)
const service = createFilterEditorService()
const rowsOf = (start, n) => Array.from({ length: n }, (_, i) => ({ value: `host-${start + i}`, label: `Host ${start + i}` }))
const page = (start, n, more) => ({ values: rowsOf(start, n), has_more: more, page: 1, page_size: 25 })
const focusPicker = async (t, label) => {
  const input = byLabel(t.root, label)[0]
  input.props.onFocus({ target: { select() {} } })
  await flush()
  return input
}
const optionsOf = (t) => find(t.root, (n) => n.props.role === 'option').map((n) => textOf(n))

// ---- the fields and sets requests ----
{
  const api = fakeApi({ fields: FIELDS, sets: { filter_sets: [], count: 0 } })
  const t = await mountEditor(service, { api })
  assert.deepEqual(api.calls.map((c) => c.path), ['/api/tfd/filter-sets/fields/?module=agents', '/api/tfd/filter-sets/?module=agents&view_key=agents'], 'exactly the fields route and the sets route, with the own module id')
  assert.equal(api.of('values').length, 0, 'no values are read until a picker opens')
  assert.equal(textOf(t.root).includes('Apply'), true)
  // an empty tree applies as null
  click(button(t.root, 'Apply'))
  assert.deepEqual(t.events.apply, [{ definition: null, filterSetId: null }], 'an empty tree is "no filter"')
  t.unmount()
}

// ---- values: first page, page 2 on more, search cut at 100 ----
{
  const api = fakeApi({ fields: FIELDS, sets: { filter_sets: [] }, values: (c) => (c.path.includes('page=2') ? page(25, 3, false) : page(0, 25, true)) })
  const t = await mountEditor(service, { api })
  click(button(t.root, 'Add rule'))
  await flush()
  assert.match(textOf(t.root), /Choose a value for Hostname\./, 'an unfinished rule says so')
  assert.equal(button(t.root, 'Apply').props.disabled, true, 'and keeps Apply off')
  await focusPicker(t, 'Value for Hostname')
  assert.equal(api.of('values').length, 1)
  assert.equal(api.of('values')[0].path, '/api/tfd/filter-values/?module=agents&field=hostname&page=1')
  assert.equal(typeof api.of('values')[0].options.signal?.aborted, 'boolean', 'the request carries an abort signal')
  assert.equal(optionsOf(t).length, 25)
  // scroll to the end: page 2, appended
  const list = find(t.root, (n) => n.tag === 'ul' && n.props.role === 'listbox' && !n.props.hidden)[0]
  list.props.onScroll({ target: { scrollHeight: 300, scrollTop: 200, clientHeight: 100 } })
  await flush()
  assert.equal(api.of('values')[1].path, '/api/tfd/filter-values/?module=agents&field=hostname&page=2')
  assert.equal(optionsOf(t).length, 28, 'pages are appended')
  // typing: debounced 250 ms, trimmed and cut to 100 characters, back to page 1
  const input = byLabel(t.root, 'Value for Hostname')[0]
  input.props.onInput({ target: { value: `  ${'q'.repeat(150)}  ` } })
  await flush()
  assert.equal(api.of('values').length, 2, 'nothing is sent before the debounce ends')
  await sleep(300)
  await flush()
  assert.equal(api.of('values').length, 3)
  assert.equal(api.of('values')[2].path, `/api/tfd/filter-values/?module=agents&field=hostname&search=${'q'.repeat(100)}&page=1`)
  // choosing stores the value text and keeps its label
  const row = find(t.root, (n) => n.props.role === 'option')[1]
  row.parent.props.onMousedown({ preventDefault() {}, target: { closest: () => ({ dataset: { i: '1' } }) } })
  await flush()
  assert.deepEqual(t.events.update.at(-1), { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'hostname', operator: 'equals', value: 'host-1' }] }, 'a text field stores the value text')
  assert.equal(byLabel(t.root, 'Value for Hostname')[0].props.value, 'Host 1', 'the chosen label stays shown')
  click(button(t.root, 'Apply'))
  assert.deepEqual(t.events.apply.at(-1), { definition: { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'hostname', operator: 'equals', value: 'host-1' }] }, filterSetId: null })
  t.unmount()
}

// ---- a stale answer is dropped and the old request is aborted ----
{
  const pending = []
  const api = fakeApi({
    fields: FIELDS,
    sets: { filter_sets: [] },
    values: (c) => new Promise((resolve) => { pending.push({ c, resolve }) }),
  })
  const t = await mountEditor(service, { api })
  click(button(t.root, 'Add rule'))
  await flush()
  await focusPicker(t, 'Value for Hostname')
  assert.equal(pending.length, 1, 'the first open asks at once')
  byLabel(t.root, 'Value for Hostname')[0].props.onInput({ target: { value: 'abc' } })
  await sleep(300)
  await flush()
  assert.equal(pending.length, 2)
  assert.equal(pending[0].c.options.signal.aborted, true, 'the request in flight is aborted when a newer one starts')
  pending[1].resolve(page(100, 2, false))
  await flush()
  pending[0].resolve(page(0, 5, false))
  await flush()
  assert.deepEqual(optionsOf(t), ['Host 100', 'Host 101'], 'the older answer arrives last and is dropped')
  t.unmount()
  assert.equal(pending.length, 2)
}

// ---- unmount aborts what is in flight ----
{
  const pending = []
  const api = fakeApi({ fields: FIELDS, sets: { filter_sets: [] }, values: (c) => new Promise((resolve) => { pending.push({ c, resolve }) }) })
  const t = await mountEditor(service, { api })
  click(button(t.root, 'Add rule'))
  await flush()
  await focusPicker(t, 'Value for Hostname')
  t.unmount()
  assert.equal(pending[0].c.options.signal.aborted, true, 'leaving the page aborts the request')
}

// ---- 502 values_unavailable: a plain text box, the sentence, and no other source ----
{
  const api = fakeApi({ fields: FIELDS, sets: { filter_sets: [] }, values: () => { throw failure(502, 'values_unavailable', 'The values could not be read.') } })
  const t = await mountEditor(service, { api })
  click(button(t.root, 'Add rule'))
  await flush()
  await focusPicker(t, 'Value for Hostname')
  assert.equal(textOf(t.root).includes('The list of values could not load. Type the value instead.'), true)
  const box = byLabel(t.root, 'Value for Hostname')[0]
  assert.equal(box.props.role, undefined, 'it is a plain box, not a combobox')
  assert.equal(box.props.maxlength, 200)
  box.props.onInput({ target: { value: 'SRV-9' } })
  await flush()
  assert.deepEqual(t.events.update.at(-1).rules[0], { kind: 'rule', field: 'hostname', operator: 'equals', value: 'SRV-9' })
  assert.equal(api.of('values').length, 1, 'no further values call')
  assert.equal(api.calls.every((c) => c.kind !== 'other'), true, 'no other source was read')
  // an id field falls back to a whole-number box
  click(button(t.root, 'Add rule'))
  await flush()
  const ruleFields = byLabel(t.root, 'Field')
  ruleFields[1].props.onChange({ target: { value: 'client' } })
  await flush()
  await focusPicker(t, 'Value for Client')
  const idBox = byLabel(t.root, 'Value for Client')[0]
  assert.equal(idBox.props.inputmode, 'numeric')
  idBox.props.onInput({ target: { value: '12ab' } })
  await flush()
  assert.equal(t.events.update.at(-1).rules[1].value, 12, 'an id box sends a whole number')
  t.unmount()
}

// ---- static source: a local filter over the options, no values call ----
{
  const api = fakeApi({ fields: FIELDS, sets: { filter_sets: [] } })
  const t = await mountEditor(service, { api })
  click(button(t.root, 'Add rule'))
  await flush()
  byLabel(t.root, 'Field')[0].props.onChange({ target: { value: 'monitoring' } })
  await flush()
  await focusPicker(t, 'Value for Monitoring type')
  assert.deepEqual(optionsOf(t), ['Server', 'Workstation'])
  byLabel(t.root, 'Value for Monitoring type')[0].props.onInput({ target: { value: 'work' } })
  await flush()
  assert.deepEqual(optionsOf(t), ['Workstation'], 'filtered locally')
  assert.equal(api.of('values').length, 0, 'a static list never reads the values route')
  t.unmount()
}

// ---- text operators use a box (maxlength 200); bool offers Equals as Yes or No ----
{
  const api = fakeApi({ fields: FIELDS, sets: { filter_sets: [] } })
  const t = await mountEditor(service, { api })
  click(button(t.root, 'Add rule'))
  await flush()
  const operator = byLabel(t.root, 'How to compare Hostname')[0]
  assert.deepEqual(find(operator, (n) => n.tag === 'option').map(textOf), ['Equals', 'Does not equal', 'Contains'], "the operator list is the field's own")
  operator.props.onChange({ target: { value: 'contains' } })
  await flush()
  const box = byLabel(t.root, 'Value for Hostname')[0]
  assert.equal(box.tag, 'input')
  assert.equal(box.props.maxlength, 200)
  box.props.onInput({ target: { value: 'SRV\u0001' } })
  await flush()
  assert.equal(t.events.update.at(-1).rules[0].value, 'SRV', 'control characters are stripped')
  byLabel(t.root, 'Field')[0].props.onChange({ target: { value: 'offline' } })
  await flush()
  const choice = byLabel(t.root, 'Value for Offline')[0]
  assert.deepEqual(find(choice, (n) => n.tag === 'option').map(textOf), ['Choose Yes or No', 'Yes', 'No'])
  assert.deepEqual(find(byLabel(t.root, 'How to compare Offline')[0], (n) => n.tag === 'option').map(textOf), ['Equals'])
  choice.props.onChange({ target: { value: 'false' } })
  await flush()
  assert.equal(t.events.update.at(-1).rules[0].value, false, 'No sends false')
  t.unmount()
}

// ---- groups, match and the limits with a plain reason ----
{
  const api = fakeApi({ fields: { ...FIELDS, limits: { rules: 2, groups: 1, depth: 3, value_length: 200 } }, sets: { filter_sets: [] } })
  const t = await mountEditor(service, { api })
  click(button(t.root, 'Add rule'))
  click(button(t.root, 'Add group'))
  await flush()
  assert.equal(find(t.root, (n) => n.tag === 'button' && textOf(n) === 'Add group').every((b) => b.props.disabled), true, 'the group limit turns every Add group off')
  assert.equal(textOf(t.root).includes('A filter can have at most 1 groups.'), true, 'with its plain reason')
  const matches = byLabel(t.root, 'Match all or any rule in this group')
  assert.equal(matches.length, 2, 'every group has Match ALL or ANY')
  assert.deepEqual(find(matches[0], (n) => n.tag === 'option').map(textOf), ['ALL of these', 'ANY of these'])
  assert.equal(textOf(t.root).includes('Add a rule to this group or remove it.'), true, 'an empty group is named')
  t.unmount()
}

// ---- available:false: the plain sentence, no values and no sets read ----
{
  const api = fakeApi({ fields: { module: 'agents', available: false, fields: [], operators: [], limits: {} } })
  const t = await mountEditor(service, { api })
  assert.equal(textOf(t.root), 'This list has no filters yet.')
  assert.deepEqual(api.calls.map((c) => c.kind), ['fields'], 'one request only')
  t.unmount()
}

// ---- Core's refusal as sent ----
for (const [status, code] of [[403, 'permission_denied'], [404, 'filter_fields_unavailable']]) {
  const api = fakeApi({ fields: () => { throw failure(status, code, `Core says ${status}.`) } })
  const t = await mountEditor(service, { api })
  assert.equal(textOf(t.root).includes(`Core says ${status}.`), true, `${status} shows Core's own detail`)
  assert.equal(api.calls.length, 1)
  t.unmount()
}

// ---- a bad view key makes no request ----
{
  const api = fakeApi({ fields: FIELDS })
  const t = await mountEditor(service, { api, props: { viewKey: 'Bad Key' } })
  assert.equal(api.calls.length, 0)
  assert.match(textOf(t.root), /view key/)
  t.unmount()
}

// ---- a model from the page fills the draft ----
{
  const model = { version: 1, match: 'any', rules: [{ kind: 'rule', field: 'hostname', operator: 'contains', value: 'SRV' }] }
  const api = fakeApi({ fields: FIELDS, sets: { filter_sets: [] } })
  const t = await mountEditor(service, { api, props: { modelValue: model } })
  assert.equal(byLabel(t.root, 'Value for Hostname')[0].props.value, 'SRV')
  click(button(t.root, 'Apply'))
  assert.deepEqual(t.events.apply.at(-1), { definition: model, filterSetId: null })
  t.unmount()
}

// ---- the source: text nodes only, no browser storage ----
for (const file of ['../src/filter-editor.js', '../src/filter-editor-logic.js']) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8')
  assert.doesNotMatch(source, /v-html|innerHTML|outerHTML|insertAdjacentHTML/, `${file} never builds HTML from text`)
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/, `${file} keeps nothing in browser storage`)
  assert.doesNotMatch(source, /Authorization|Bearer|access_token/, `${file} builds no auth header`)
  assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest/, `${file} calls only through api()`)
}

console.log('filter-editor-component-0.12.116: PASS')
