// 0.12.117: changing viewKey cancels what was read for the old key. A sets answer (success or failure) for the old key never fills the
// list, so a person cannot pick an old key's set and Apply its filterSetId on the new view. The reads still in flight are aborted;
// a save in flight is not touched.
import assert from 'node:assert/strict'
import { FIELDS, button, byLabel, click, failure, fakeApi, find, flush, mountEditor, textOf } from './fixtures/filter-editor-harness.mjs'

const { createFilterEditorService } = await import(new URL('../src/filter-editor.js', import.meta.url).href)
const service = createFilterEditorService()
const SET_A = '11111111-2222-4333-8444-555555555555'
const setA = { id: SET_A, name: 'Set from A', mine: true, can_edit: true, shared: false, values_withheld: 0, definition: { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'hostname', operator: 'contains', value: 'a' }] } }

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const viewOf = (call) => new URL(call.path, 'http://x').searchParams.get('view_key')
const placeholder = (t) => byLabel(t.root, 'Saved filter sets')[0].props.placeholder

// ---- a late sets answer for the old key is dropped ----
{
  const held = deferred()
  const api = fakeApi({ fields: FIELDS, sets: (c) => (viewOf(c) === 'a' ? held.promise : { filter_sets: [] }) })
  const t = await mountEditor(service, { api, props: { viewKey: 'a' } })
  const first = api.of('sets')[0]
  assert.equal(viewOf(first), 'a')
  assert.equal(first.options.signal.aborted, false, 'the read is in flight')
  t.st.viewKey = 'b'
  await flush()
  assert.equal(first.options.signal.aborted, true, 'the old key read is aborted')
  assert.equal(api.of('sets').filter((c) => viewOf(c) === 'b').length, 1)
  held.resolve({ filter_sets: [setA] })
  await flush()
  assert.equal(placeholder(t), 'No saved filters yet', "the old key's set is not offered")
  click(button(t.root, 'Apply'))
  assert.deepEqual(t.events.apply, [{ definition: null, filterSetId: null }], 'Apply cannot send the old key set id')
  t.unmount()
}

// ---- the new key's sets read fails, then the old answer arrives ----
{
  const held = deferred()
  const api = fakeApi({ fields: FIELDS, sets: (c) => { if (viewOf(c) === 'a') return held.promise; throw failure(502, 'unavailable', 'The saved sets are not available right now.') } })
  const t = await mountEditor(service, { api, props: { viewKey: 'a' } })
  t.st.viewKey = 'b'
  await flush()
  assert.match(textOf(t.root), /The saved sets are not available right now\./, 'the new key shows its own message')
  held.resolve({ filter_sets: [setA] })
  await flush()
  assert.equal(placeholder(t), 'No saved filters yet', 'an empty list, no set of the old key')
  assert.match(textOf(t.root), /The saved sets are not available right now\./, 'and the message stays')
  click(button(t.root, 'Apply'))
  assert.deepEqual(t.events.apply.map((e) => e.filterSetId), [null])
  t.unmount()
}

// ---- an old failure does not show on the new key ----
{
  const held = deferred()
  const api = fakeApi({ fields: FIELDS, sets: (c) => (viewOf(c) === 'a' ? held.promise : { filter_sets: [] }) })
  const t = await mountEditor(service, { api, props: { viewKey: 'a' } })
  t.st.viewKey = 'b'
  await flush()
  held.reject(failure(500, 'boom', 'The old key failed.'))
  await flush()
  assert.equal(textOf(t.root).includes('The old key failed.'), false, "the old key's failure is not shown on the new key")
  t.unmount()
}

// ---- a fields read in flight for the old key is dropped ----
{
  const heldFields = deferred()
  const other = { ...FIELDS, fields: [{ id: 'only_a', label: 'Only in A', kind: 'text', operators: [{ id: 'contains', label: 'Contains' }], values: { source: 'none' } }] }
  const api = fakeApi({
    fields: (c) => (c.path.includes('module=agents') && api.of('fields').length === 1 ? heldFields.promise : FIELDS),
    sets: { filter_sets: [] },
  })
  const t = await mountEditor(service, { api, props: { viewKey: 'a' } })
  const first = api.of('fields')[0]
  assert.equal(first.options.signal.aborted, false)
  t.st.viewKey = 'b'
  await flush()
  assert.equal(first.options.signal.aborted, true, 'the fields read for the old key is aborted')
  heldFields.resolve(other)
  await flush()
  click(button(t.root, 'Add rule'))
  await flush()
  const options = find(t.root, (n) => n.tag === 'option').map((n) => textOf(n))
  assert.equal(options.includes('Only in A'), false, "the old key's fields answer is dropped")
  assert.equal(options.includes('Hostname'), true, "the new key's fields are shown")
  t.unmount()
}

// ---- a save in flight is not aborted by a viewKey change ----
{
  const held = deferred()
  const model = { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'hostname', operator: 'contains', value: 'srv' }] }
  const api = fakeApi({ fields: FIELDS, sets: (c) => (c.options.method === 'POST' ? held.promise : { filter_sets: [] }) })
  const t = await mountEditor(service, { api, userId: 7, props: { viewKey: 'a', modelValue: model } })
  click(button(t.root, 'Save as new set'))
  await flush()
  find(t.root, (n) => n.tag === 'input' && n.props.class === 'tt-input tt-filter-name')[0].props.onInput({ target: { value: 'Mine' } })
  await flush()
  find(t.root, (n) => n.tag === 'form')[0].props.onSubmit({ preventDefault() {} })
  await flush()
  const post = api.calls.find((c) => c.options.method === 'POST')
  assert.ok(post, 'the save was sent')
  t.st.viewKey = 'b'
  await flush()
  assert.equal(post.options.signal, undefined, 'a save carries no abort signal, so a view change cannot abort it')
  held.resolve({ id: SET_A, name: 'Mine', mine: true, can_edit: true, shared: false, definition: model })
  await flush()
  t.unmount()
}

console.log('filter-editor-viewkey-0.12.117: PASS')
