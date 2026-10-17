// 0.12.116: FilterEditor saved sets. Exact request bodies for create (readers = the person's own id, never empty) and update (only the
// changed keys), the list URL, a missing user id turning Save off, Core's 409 and 422 and 403 shown as sent with the panel kept open,
// delete asking Yes or No first, own and shared badges, a set owned by someone else drawing no rule values, and an unchanged set
// reporting filterSetId while an edited one reports the definition.
import assert from 'node:assert/strict'
import { FIELDS, button, byLabel, choose, click, failure, fakeApi, find, flush, mountEditor, textOf } from './fixtures/filter-editor-harness.mjs'

const { createFilterEditorService } = await import(new URL('../src/filter-editor.js', import.meta.url).href)
const service = createFilterEditorService()

const MINE = '11111111-2222-4333-8444-555555555551'
const THEIRS = '11111111-2222-4333-8444-555555555552'
const NEW = '11111111-2222-4333-8444-555555555553'
const def = { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'hostname', operator: 'contains', value: 'SRV' }] }
const model = { version: 1, match: 'any', rules: [{ kind: 'rule', field: 'hostname', operator: 'starts_with', value: 'DC' }] }
FIELDS.fields[0].operators.push({ id: 'starts_with', label: 'Starts with' })
const mine = { id: MINE, name: 'Servers', definition: def, shared: false, mine: true, can_edit: true, owner: { id: 7, username: 'me' }, readers: [7] }
const theirs = { id: THEIRS, name: 'Everyone list', definition: def, shared: true, mine: false, can_edit: false, owner: { id: 8, username: 'sam' } }
const setsAnswer = () => ({ filter_sets: [mine, theirs], count: 2 })
const submit = async (t) => { find(t.root, (n) => n.tag === 'form')[0].props.onSubmit({ preventDefault() {} }); await flush() }
const typeName = async (t, value) => { find(t.root, (n) => n.tag === 'input' && String(n.props.id || '').endsWith('-name'))[0].props.onInput({ target: { value } }); await flush() }
const optionTexts = (t) => find(t.root, (n) => n.props.role === 'option').map(textOf)

// ---- the list URL and the badges ----
{
  const api = fakeApi({ fields: FIELDS, sets: setsAnswer })
  const t = await mountEditor(service, { api })
  assert.equal(api.of('sets')[0].path, '/api/tfd/filter-sets/?module=agents&view_key=agents', 'module and view_key, the plain key')
  const input = byLabel(t.root, 'Saved filter sets')[0]
  input.props.onFocus({ target: { select() {} } })
  await flush()
  const texts = optionTexts(t)
  assert.equal(texts.length, 2)
  assert.match(texts[0], /Servers/)
  assert.match(texts[0], /Only you/, 'an own set')
  assert.doesNotMatch(texts[0], /Shared/)
  assert.match(texts[1], /Everyone list/)
  assert.match(texts[1], /Shared by sam/, 'the owner is named')
  assert.match(texts[1], /Shared$/, 'and the Shared badge shows')
  t.unmount()
}

// ---- create: exact body, Only me = readers [own id], the editor kept ----
{
  const api = fakeApi({ fields: FIELDS, sets: (c) => (c.options.method === 'POST' ? { ...mine, id: NEW, name: 'My DCs', definition: model } : { filter_sets: [] }) })
  const t = await mountEditor(service, { api, userId: 7, props: { modelValue: model } })
  click(button(t.root, 'Save as new set'))
  await flush()
  await typeName(t, '  My DCs  ')
  await submit(t)
  const post = api.calls.find((c) => c.options.method === 'POST')
  assert.equal(post.path, '/api/tfd/filter-sets/')
  assert.deepEqual(JSON.parse(post.options.body), { module_id: 'agents', view_key: 'agents', name: 'My DCs', definition: model, readers: [7] })
  assert.deepEqual(Object.keys(JSON.parse(post.options.body)), ['module_id', 'view_key', 'name', 'definition', 'readers'])
  assert.equal(find(t.root, (n) => n.tag === 'form').length, 0, 'the name panel closes after a save')
  assert.match(textOf(t.root), /Saved "My DCs"\. Only you can use it\./)
  assert.equal(button(t.root, 'Rename') !== undefined, true, 'the new set is the active set, so it can be renamed')
  t.unmount()
}

// ---- a missing user id turns Save off with the plain sentence, and never sends an empty readers list ----
{
  const api = fakeApi({ fields: FIELDS, sets: { filter_sets: [] } })
  const t = await mountEditor(service, { api, userId: null, props: { modelValue: model } })
  assert.equal(button(t.root, 'Save as new set').props.disabled, true)
  assert.equal(textOf(t.root).includes('Reload the page or sign in again to save a set only you can use.'), true)
  click(button(t.root, 'Save as new set'))
  await flush()
  assert.equal(api.calls.some((c) => c.options.method === 'POST'), false, 'no POST')
  t.unmount()
  for (const bad of [0, -2, 'abc']) {
    const a = fakeApi({ fields: FIELDS, sets: { filter_sets: [] } })
    const u = await mountEditor(service, { api: a, userId: bad, props: { modelValue: model } })
    assert.equal(button(u.root, 'Save as new set').props.disabled, true, `userId ${String(bad)}`)
    u.unmount()
  }
}

// ---- Core's refusals as sent; the panel stays open with the typed name ----
for (const [status, code, detail] of [[409, 'name_conflict', 'You already have a filter set called that.'], [422, 'field_unavailable', 'This filter set uses a field you cannot use.'], [403, 'permission_denied', 'You may not save sets here.'], [500, 'audit_failed', 'The audit row could not be written.']]) {
  const api = fakeApi({ fields: FIELDS, sets: (c) => { if (c.options.method === 'POST') throw failure(status, code, detail); return { filter_sets: [] } } })
  const t = await mountEditor(service, { api, props: { modelValue: model } })
  click(button(t.root, 'Save as new set'))
  await flush()
  await typeName(t, 'Keep me')
  await submit(t)
  assert.equal(textOf(t.root).includes(detail), true, `${status} ${code} is shown as sent`)
  const form = find(t.root, (n) => n.tag === 'form')[0]
  assert.ok(form, 'the panel stays open')
  assert.equal(find(form, (n) => n.tag === 'input')[0].props.value, 'Keep me', "the person's text is kept")
  assert.equal(api.of('sets').filter((c) => c.options.method === 'POST').length, 1, 'no automatic retry')
  t.unmount()
}

// ---- name rules before any request ----
{
  const api = fakeApi({ fields: FIELDS, sets: { filter_sets: [] } })
  const t = await mountEditor(service, { api, props: { modelValue: model } })
  click(button(t.root, 'Save as new set'))
  await flush()
  await typeName(t, '   ')
  await submit(t)
  assert.equal(textOf(t.root).includes('Enter a name for this set.'), true)
  await typeName(t, 'x'.repeat(200))
  assert.equal(find(t.root, (n) => n.tag === 'input' && String(n.props.id || '').endsWith('-name'))[0].props.maxlength, 160)
  assert.equal(api.calls.some((c) => c.options.method === 'POST'), false)
  t.unmount()
}

// ---- an own set loads into the editor; unchanged applies by id, edited applies the definition ----
{
  const api = fakeApi({ fields: FIELDS, sets: setsAnswer })
  const t = await mountEditor(service, { api })
  await choose(t.root, 'Saved filter sets', 0)
  assert.equal(byLabel(t.root, 'Value for Hostname')[0].props.value, 'SRV', 'the rules are drawn for an own set')
  click(button(t.root, 'Apply'))
  assert.deepEqual(t.events.apply.at(-1), { definition: null, filterSetId: MINE }, 'unchanged: the id')
  byLabel(t.root, 'Value for Hostname')[0].props.onInput({ target: { value: 'SRV2' } })
  await flush()
  click(button(t.root, 'Apply'))
  assert.deepEqual(t.events.apply.at(-1), { definition: { ...def, rules: [{ ...def.rules[0], value: 'SRV2' }] }, filterSetId: null }, 'edited: the definition')
  // change it back: unchanged again
  byLabel(t.root, 'Value for Hostname')[0].props.onInput({ target: { value: 'SRV' } })
  await flush()
  click(button(t.root, 'Apply'))
  assert.equal(t.events.apply.at(-1).filterSetId, MINE)
  t.unmount()
}

// ---- update sends only the changed keys ----
{
  const api = fakeApi({ fields: FIELDS, sets: (c) => { if (c.options.method === 'PUT') return { ...mine, ...JSON.parse(c.options.body) }; return setsAnswer() } })
  const t = await mountEditor(service, { api })
  await choose(t.root, 'Saved filter sets', 0)
  // rename
  click(button(t.root, 'Rename'))
  await flush()
  await typeName(t, 'Servers 2')
  await submit(t)
  let put = api.calls.filter((c) => c.options.method === 'PUT')
  assert.equal(put[0].path, `/api/tfd/filter-sets/${MINE}/`)
  assert.deepEqual(JSON.parse(put[0].options.body), { name: 'Servers 2' }, 'a rename sends the name only')
  // replace the definition
  byLabel(t.root, 'Value for Hostname')[0].props.onInput({ target: { value: 'SRV9' } })
  await flush()
  click(button(t.root, 'Save changes'))
  await flush()
  put = api.calls.filter((c) => c.options.method === 'PUT')
  assert.deepEqual(JSON.parse(put[1].options.body), { definition: { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'hostname', operator: 'contains', value: 'SRV9' }] } }, 'a replace sends the definition only')
  assert.equal(button(t.root, 'Save changes').props.disabled, true, 'saved, so nothing left to save')
  // a refusal on replace is shown as sent and the editor stays
  api.calls.length = 0
  t.unmount()
}
{
  const api = fakeApi({ fields: FIELDS, sets: (c) => { if (c.options.method === 'PUT') throw failure(422, 'field_unavailable', 'This filter set uses a field you cannot use.'); return setsAnswer() } })
  const t = await mountEditor(service, { api })
  await choose(t.root, 'Saved filter sets', 0)
  byLabel(t.root, 'Value for Hostname')[0].props.onInput({ target: { value: 'NEW' } })
  await flush()
  click(button(t.root, 'Save changes'))
  await flush()
  assert.equal(textOf(t.root).includes('This filter set uses a field you cannot use.'), true)
  assert.equal(byLabel(t.root, 'Value for Hostname')[0].props.value, 'NEW', 'the edit is kept')
  t.unmount()
}

// ---- delete asks first; No sends nothing; Yes sends DELETE ----
{
  const asked = []
  let answer = false
  const confirm = (options) => { asked.push(options); return Promise.resolve(answer) }
  const api = fakeApi({ fields: FIELDS, sets: (c) => (c.options.method === 'DELETE' ? null : setsAnswer()) })
  const t = await mountEditor(service, { api, confirm })
  await choose(t.root, 'Saved filter sets', 0)
  click(button(t.root, 'Delete'))
  await flush()
  assert.equal(asked.length, 1, 'one question')
  assert.match(asked[0].question, /Delete the filter set "Servers"\?/)
  assert.equal(asked[0].danger, true)
  assert.equal(Object.keys(asked[0]).some((k) => /type|confirmText|expect/i.test(k)), false, 'a plain Yes or No: nothing to type (AD-27)')
  assert.equal(api.calls.some((c) => c.options.method === 'DELETE'), false, 'No sends nothing')
  answer = true
  click(button(t.root, 'Delete'))
  await flush()
  const del = api.calls.find((c) => c.options.method === 'DELETE')
  assert.equal(del.path, `/api/tfd/filter-sets/${MINE}/`)
  assert.equal(button(t.root, 'Delete'), undefined, 'the set is gone and no set is active')
  assert.match(textOf(t.root), /Deleted "Servers"\./)
  t.unmount()
}
{
  const api = fakeApi({ fields: FIELDS, sets: (c) => { if (c.options.method === 'DELETE') throw failure(404, 'not_found', 'Filter set not found.'); return setsAnswer() } })
  const t = await mountEditor(service, { api, confirm: () => Promise.resolve(true) })
  await choose(t.root, 'Saved filter sets', 0)
  click(button(t.root, 'Delete'))
  await flush()
  assert.equal(textOf(t.root).includes('Filter set not found.'), true, 'Core\'s refusal as sent')
  assert.ok(byLabel(t.root, 'Saved filter sets')[0], 'the editor stays')
  t.unmount()
}

// ---- someone else's set: name and owner only, no rule values, applied by id, no Delete or Rename ----
{
  const api = fakeApi({ fields: FIELDS, sets: setsAnswer })
  const t = await mountEditor(service, { api, confirm: () => Promise.resolve(true) })
  await choose(t.root, 'Saved filter sets', 1)
  assert.equal(byLabel(t.root, 'Value for Hostname').length, 0, 'no rule value is drawn')
  assert.equal(find(t.root, (n) => n.tag === 'input' && n.props.value === 'SRV').length, 0)
  assert.equal(button(t.root, 'Delete'), undefined)
  assert.equal(button(t.root, 'Rename'), undefined)
  assert.equal(button(t.root, 'Save changes'), undefined)
  assert.match(textOf(t.root), /"Everyone list" by sam is selected\./)
  click(button(t.root, 'Apply'))
  assert.deepEqual(t.events.apply.at(-1), { definition: null, filterSetId: THEIRS }, 'applied by id')
  // adding a rule detaches it: the definition is reported
  click(button(t.root, 'Add rule'))
  await flush()
  byLabel(t.root, 'Field')[0].props.onChange({ target: { value: 'offline' } })
  byLabel(t.root, 'Value for Offline').length || await flush()
  byLabel(t.root, 'Value for Offline')[0].props.onChange({ target: { value: 'true' } })
  await flush()
  click(button(t.root, 'Apply'))
  assert.equal(t.events.apply.at(-1).filterSetId, null)
  assert.equal(t.events.apply.at(-1).definition.rules[0].field, 'offline')
  t.unmount()
}

// ---- the 1.17.51 marker is never drawn or re-fetched ----
{
  const withheld = { ...theirs, definition: { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'client', operator: 'equals', value: null, withheld: true }] }, values_withheld: 1 }
  const api = fakeApi({ fields: FIELDS, sets: () => ({ filter_sets: [withheld] }) })
  const t = await mountEditor(service, { api })
  await choose(t.root, 'Saved filter sets', 0)
  assert.equal(byLabel(t.root, 'Value for Client').length, 0)
  const before = api.calls.length
  click(button(t.root, 'Apply'))
  assert.equal(api.calls.length, before, 'nothing is read again')
  assert.deepEqual(t.events.apply.at(-1), { definition: null, filterSetId: THEIRS })
  t.unmount()
}

// ---- 100 own sets: Save is off with the plain reason ----
{
  const many = Array.from({ length: 100 }, (_, i) => ({ ...mine, id: `11111111-2222-4333-8444-${String(100000000000 + i)}`, name: `Set ${i}` }))
  const api = fakeApi({ fields: FIELDS, sets: () => ({ filter_sets: many }) })
  const t = await mountEditor(service, { api, props: { modelValue: model } })
  assert.equal(button(t.root, 'Save as new set').props.disabled, true)
  assert.match(textOf(t.root), /already have 100 sets/)
  t.unmount()
}

// ---- the sets list failing does not stop filtering ----
{
  const api = fakeApi({ fields: FIELDS, sets: () => { throw failure(403, 'permission_denied', 'You may not read filter sets.') } })
  const t = await mountEditor(service, { api })
  assert.equal(textOf(t.root).includes('You may not read filter sets.'), true)
  assert.ok(button(t.root, 'Add rule'), 'the editor still works')
  t.unmount()
}

console.log('filter-editor-sets-0.12.116: PASS')
