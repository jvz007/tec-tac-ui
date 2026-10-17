// 0.12.116: the pure rules behind FilterEditor (src/filter-editor-logic.js): operators come from the descriptor, field change resets,
// value modes, limits, unfinished rules, empty tree = null, id values, control characters, set helpers, Core's error wording.
import assert from 'node:assert/strict'

const L = await import(new URL('../src/filter-editor-logic.js', import.meta.url).href)

const answer = {
  module: 'agents',
  available: true,
  fields: [
    { id: 'hostname', label: 'Hostname', kind: 'text', operators: [{ id: 'equals', label: 'Equals' }, { id: 'not_equals', label: 'Does not equal' }, { id: 'contains', label: 'Contains' }, { id: 'starts_with', label: 'Starts with' }], values: { source: 'distinct' } },
    { id: 'client', label: 'Client', kind: 'id', operators: [{ id: 'equals', label: 'Equals' }, { id: 'not_equals', label: 'Does not equal' }, { id: 'contains', label: 'Contains' }], values: { source: 'distinct' } },
    { id: 'site', label: 'Site', kind: 'id', operators: [{ id: 'equals', label: 'Equals' }, { id: 'not_equals', label: 'Does not equal' }], values: { source: 'none' } },
    { id: 'monitoring', label: 'Monitoring type', kind: 'text', operators: [{ id: 'equals', label: 'Equals' }], values: { source: 'static', options: [{ value: 'server', label: 'Server' }, { value: 'workstation', label: 'Workstation' }] } },
    { id: 'offline', label: 'Offline', kind: 'bool', operators: [{ id: 'equals', label: 'Equals' }], values: { source: 'none' } },
  ],
  operators: [],
  limits: { rules: 50, groups: 20, depth: 3, value_length: 200 },
}
const d = L.normaliseDescriptor(answer)
const F = L.fieldMap(d.fields)

// the descriptor is the only source
assert.equal(d.available, true)
assert.deepEqual(d.fields.map((f) => f.id), ['hostname', 'client', 'site', 'monitoring', 'offline'])
assert.deepEqual(L.operatorIds(F.get('hostname')), ['equals', 'not_equals', 'contains', 'starts_with'], "the operator list is the field's own")
assert.deepEqual(L.operatorIds(F.get('offline')), ['equals'], 'a bool field offers Equals only')
assert.equal(L.defaultOperator(F.get('client')), 'equals', 'the default is the first one')
assert.equal(L.normaliseDescriptor({ available: false, fields: [] }).available, false)
assert.equal(L.normaliseDescriptor(null).available, false)
assert.equal(L.normaliseDescriptor({ available: true, fields: [{ id: 'x', label: 'X', kind: 'weird', operators: [{ id: 'equals' }] }] }).available, false, 'an unknown kind is left out, not guessed')
assert.equal(d.fields.find((f) => f.id === 'offline').source, 'none')
assert.equal(d.fields.find((f) => f.id === 'monitoring').options.length, 2)

// value modes
assert.deepEqual(L.valueMode(F.get('hostname'), 'equals'), { type: 'text', control: 'picker-distinct' })
assert.deepEqual(L.valueMode(F.get('hostname'), 'not_equals'), { type: 'text', control: 'picker-distinct' })
for (const op of ['contains', 'starts_with']) assert.deepEqual(L.valueMode(F.get('hostname'), op), { type: 'text', control: 'box' })
assert.deepEqual(L.valueMode(F.get('client'), 'equals'), { type: 'id', control: 'picker-distinct' })
assert.deepEqual(L.valueMode(F.get('client'), 'contains'), { type: 'text', control: 'box' }, 'an id field matches the text operators by name')
assert.deepEqual(L.valueMode(F.get('site'), 'equals'), { type: 'id', control: 'box' }, 'source none is a whole-number box for an id field')
assert.deepEqual(L.valueMode(F.get('monitoring'), 'equals'), { type: 'text', control: 'picker-static' })
assert.deepEqual(L.valueMode(F.get('offline'), 'equals'), { type: 'bool', control: 'choice' })
assert.equal(L.operatorIds(F.get('site')).includes('contains'), false, 'the text operators appear only when listed')

// a tree
let t = L.emptyDefinition()
assert.deepEqual(t, { version: 1, match: 'all', rules: [] })
assert.deepEqual(L.toDefinition(t, F), { definition: null, empty: true, problems: [] }, 'an empty tree applies as null')
t = L.addRule(t, [], F.get('hostname'))
assert.equal(t.rules.length, 1)
assert.equal(t.rules[0].operator, 'equals')
let r = L.toDefinition(t, F)
assert.deepEqual(r.problems, ['Choose a value for Hostname.'], 'an unfinished rule is named')
assert.equal(r.definition, null, 'and keeps apply off')

// value entry, trimming, control characters
t = L.setRuleValue(t, [0], F.get('hostname'), '  SRV-01  ', 'SRV-01')
r = L.toDefinition(t, F)
assert.deepEqual(r.definition, { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'hostname', operator: 'equals', value: 'SRV-01' }] }, 'trimmed, no draft keys')
t = L.setRuleOperator(t, [0], F.get('hostname'), 'contains')
assert.equal(t.rules[0].value, '  SRV-01  ', 'the text stays between a picker and a box')
t = L.setRuleValue(t, [0], F.get('hostname'), 'a\u0001b\u0007c')
assert.equal(t.rules[0].value, 'abc', 'control characters are stripped as typed')
t = L.setRuleValue(t, [0], F.get('hostname'), 'x'.repeat(300))
assert.equal(t.rules[0].value.length, 200, 'the 200 character limit is enforced in the box')
assert.equal(L.stripControl('a b'), 'ab')
assert.equal(L.cleanSearch('  ' + 'q'.repeat(150) + '\u0000 '), 'q'.repeat(100), 'the search is trimmed, stripped and cut to 100')

// field change resets operator and value
t = L.setRuleField(t, [0], F.get('offline'))
assert.equal(t.rules[0].field, 'offline')
assert.equal(t.rules[0].operator, 'equals', 'contains is not offered, so the first operator is taken')
assert.equal(t.rules[0].value, null, 'the value starts again')
assert.deepEqual(L.toDefinition(t, F).problems, ['Choose a value for Offline.'])
t = L.setRuleValue(t, [0], F.get('offline'), false)
assert.equal(L.toDefinition(t, F).definition.rules[0].value, false, 'a bool sends false')
t = L.setRuleValue(t, [0], F.get('offline'), 'true')
assert.equal(t.rules[0].value, null, 'only a real true or false counts')
t = L.setRuleOperator(t, [0], F.get('offline'), 'contains')
assert.equal(t.rules[0].operator, 'equals', 'an operator the field does not offer is refused')
t = L.setRuleField(t, [0], F.get('hostname'))
t = L.setRuleOperator(t, [0], F.get('hostname'), 'starts_with')
t = L.setRuleField(t, [0], F.get('monitoring'))
assert.equal(t.rules[0].operator, 'equals', 'starts_with is not offered by the new field')

// id values become whole numbers
let ids = L.addRule(L.emptyDefinition(), [], F.get('client'))
assert.equal(ids.rules[0].value, null)
ids = L.setRuleValue(ids, [0], F.get('client'), 12, 'Acme')
assert.equal(L.toDefinition(ids, F).definition.rules[0].value, 12)
assert.equal(ids.rules[0].label, 'Acme', 'the label stays in the draft only')
assert.equal('label' in L.toDefinition(ids, F).definition.rules[0], false)
ids = L.setRuleValue(ids, [0], F.get('client'), '7')
assert.equal(ids.rules[0].value, 7, 'a picker result for an id field is a whole number')
ids = L.setRuleValue(ids, [0], F.get('client'), 'abc')
assert.equal(ids.rules[0].value, null)
let box = L.addRule(L.emptyDefinition(), [], F.get('site'))
box = L.setRuleValue(box, [0], F.get('site'), '4x5')
assert.equal(box.rules[0].value, '45', 'a number box keeps digits only')
assert.equal(L.toDefinition(box, F).definition.rules[0].value, 45)
box = L.setRuleValue(box, [0], F.get('site'), '0')
assert.match(L.toDefinition(box, F).problems[0], /whole number/, 'zero is not an id')
const name = L.setRuleOperator(L.setRuleValue(ids, [0], F.get('client'), 7), [0], F.get('client'), 'contains')
assert.equal(name.rules[0].value, '', 'id number to name text starts again')
assert.equal(L.wholeNumber('12'), 12)
assert.equal(L.wholeNumber(1.5), null)
assert.equal(L.wholeNumber(-3), null)

// limits: 50 rules, 20 groups, depth 3
let big = L.emptyDefinition()
for (let i = 0; i < 50; i += 1) big = L.addRule(big, [], F.get('hostname'))
assert.equal(big.rules.length, 50)
assert.match(L.addLimit(big, [], 'rule'), /at most 50 rules/, 'the reason is plain')
assert.equal(L.addRule(big, [], F.get('hostname')).rules.length, 50, 'a 51st rule is not added')
let groups = L.emptyDefinition()
for (let i = 0; i < 20; i += 1) groups = L.addGroup(groups, [], d.limits)
assert.equal(groups.rules.length, 20)
assert.match(L.addLimit(groups, [], 'group', d.limits), /at most 20 groups/)
assert.equal(L.addGroup(groups, [], d.limits).rules.length, 20)
let deep = L.emptyDefinition()
deep = L.addGroup(deep, [])
assert.equal(L.addLimit(deep, [0], 'group'), '', 'level 3 is allowed')
deep = L.addGroup(deep, [0])
assert.match(L.addLimit(deep, [0, 0], 'group'), /3 levels/, 'a fourth level is refused with a reason')
assert.equal(L.countTree(L.addGroup(deep, [0, 0])).groups, 2, 'and not added')
assert.equal(L.countTree(deep).depth, 3)
assert.equal(L.addLimit(deep, [0, 0], 'rule'), '', 'rules may still be added at the deepest level')
// the limits come from the descriptor
const tight = L.normaliseDescriptor({ ...answer, limits: { rules: 2, groups: 1, depth: 2, value_length: 10 } })
assert.deepEqual([tight.limits.rules, tight.limits.groups, tight.limits.depth, tight.limits.valueLength], [2, 1, 2, 10])
let tiny = L.addRule(L.addRule(L.emptyDefinition(), [], F.get('hostname'), tight.limits), [], F.get('hostname'), tight.limits)
assert.equal(L.addRule(tiny, [], F.get('hostname'), tight.limits).rules.length, 2)
tiny = L.setRuleValue(tiny, [0], F.get('hostname'), 'x'.repeat(30))
assert.match(L.toDefinition(tiny, F, tight.limits).problems.join(' '), /at most 10 characters/)

// groups and match
let g = L.emptyDefinition()
g = L.addGroup(g, [])
assert.deepEqual(L.toDefinition(g, F).problems, ['Add a rule to this group or remove it.'], 'an empty group blocks apply')
g = L.addRule(g, [0], F.get('hostname'))
g = L.setRuleValue(g, [0, 0], F.get('hostname'), 'DC')
g = L.setMatch(g, [0], 'any')
g = L.setMatch(g, [], 'bogus')
r = L.toDefinition(g, F)
assert.deepEqual(r.definition, { version: 1, match: 'all', rules: [{ kind: 'group', match: 'any', rules: [{ kind: 'rule', field: 'hostname', operator: 'equals', value: 'DC' }] }] })
assert.deepEqual(L.removeNode(g, [0, 0]).rules[0].rules, [])
assert.equal(L.removeNode(g, []), g, 'the top group cannot be removed')

// a saved definition back into a draft
const saved = { version: 1, match: 'any', rules: [{ kind: 'rule', field: 'hostname', operator: 'contains', value: 'SRV' }] }
assert.deepEqual(L.draftFromDefinition(saved), saved)
assert.equal(L.draftFromDefinition({ version: 1, match: 'all', rules: [{ kind: 'rule', field: 'client', operator: 'equals', value: null, withheld: true }] }), null, 'a withheld value is never drawn')
assert.equal(L.draftFromDefinition(null), null)
assert.equal(L.draftFromDefinition({ rules: [{ kind: 'rule', field: 'a', operator: 'equals', value: { x: 1 } }] }), null)

// the view key
for (const ok of ['agents', 'a', 'agents-list_2', 'a'.repeat(61)]) assert.equal(L.validViewKey(ok), true, ok)
for (const bad of ['', 'Agents', '-a', '_a', 'a'.repeat(62), 'a b', 5, null, undefined]) assert.equal(L.validViewKey(bad), false, String(bad))

// saved sets
assert.deepEqual(L.onlyMeReaders(7), [7])
assert.deepEqual(L.onlyMeReaders('7'), [7])
for (const bad of [0, -1, 1.5, null, undefined, 'x', NaN, '']) assert.equal(L.onlyMeReaders(bad), null, `never an empty readers list: ${String(bad)}`)
assert.equal(L.nameProblem(''), 'Enter a name for this set.')
assert.equal(L.nameProblem('   '), 'Enter a name for this set.')
assert.match(L.nameProblem('a'.repeat(161)), /at most 160/)
assert.match(L.nameProblem('a\u0000b'), /control characters/)
assert.equal(L.nameProblem('a'.repeat(160)), '')
assert.equal(L.cleanName('  My set  '), 'My set')
const body = L.createBody({ moduleId: 'agents', viewKey: 'agents', name: ' Servers ', definition: saved, readers: [7] })
assert.deepEqual(Object.keys(body), ['module_id', 'view_key', 'name', 'definition', 'readers'], 'exactly these keys')
assert.equal(body.name, 'Servers')
assert.deepEqual(L.updateBody({ name: 'A', key: L.definitionKey(saved) }, { name: 'B' }), { name: 'B' })
assert.equal(L.updateBody({ name: 'A', key: L.definitionKey(saved) }, { name: 'A', definition: saved }), null, 'nothing changed, nothing sent')
assert.deepEqual(Object.keys(L.updateBody({ name: 'A', key: 'x' }, { definition: saved })), ['definition'], 'only the changed keys')
const uuid = '11111111-2222-4333-8444-555555555555'
const sets = L.normaliseSets({
  filter_sets: [
    { id: uuid, name: 'Mine', definition: saved, shared: false, mine: true, can_edit: true, owner: { id: 7, username: 'me' }, readers: [7] },
    { id: '11111111-2222-4333-8444-555555555556', name: 'Theirs', definition: saved, shared: true, mine: false, can_edit: false, owner: { id: 8, username: 'sam' } },
    { id: 'not-a-uuid', name: 'Bad', mine: true },
  ],
  count: 3,
})
assert.equal(sets.length, 2, 'a set without a real id is left out')
assert.equal(sets[0].definition.rules.length, 1)
assert.equal(sets[1].definition, null, 'a set owned by someone else is not drawn')
assert.deepEqual(L.setOption(sets[0]), { value: uuid, label: 'Mine', description: 'Only you', chip: '' })
assert.deepEqual(L.setOption(sets[1]), { value: sets[1].id, label: 'Theirs', description: 'Shared by sam', chip: 'Shared' }, 'the Shared badge and the owner')

// Core's refusals as sent, with plain fallbacks
const err = (status, code, detail) => Object.assign(new Error('x'), { status, code, payload: detail === undefined ? null : { detail, code } })
assert.equal(L.setErrorMessage(err(422, 'field_unavailable', 'This filter set uses a field you cannot use.')), 'This filter set uses a field you cannot use.')
assert.equal(L.setErrorMessage(err(422, 'field_unavailable')), 'This filter set uses a field you cannot use.')
assert.equal(L.setErrorMessage(err(409, 'name_conflict', 'A filter set with this name already exists.')), 'A filter set with this name already exists.')
assert.match(L.setErrorMessage(err(409, 'name_conflict')), /already have a filter set with this name/)
assert.match(L.setErrorMessage(err(404, 'not_found')), /no longer exists/)
assert.match(L.setErrorMessage(err(403, 'permission_denied')), /do not have permission/)
assert.match(L.setErrorMessage(err(500, 'audit_failed')), /could not record it/)
assert.match(L.setErrorMessage(Object.assign(new Error('boom'), { status: 0, payload: null })), /could not be reached/)
assert.equal(L.setErrorMessage(Object.assign(new Error('You are signed out. Sign in again to continue.'), { status: 401, code: 'signed_out' })), 'You are signed out. Sign in again to continue.')
assert.equal(L.readErrorMessage(err(403, 'permission_denied', 'You cannot use this module.'), 'fallback'), 'You cannot use this module.', "Core's detail as sent")
assert.equal(L.readErrorMessage(err(404, 'filter_fields_unavailable'), 'fallback'), 'fallback')
assert.equal(L.isAbort(Object.assign(new Error('a'), { name: 'AbortError' })), true)

// values answers
const vals = L.normaliseValues({ values: [{ value: 'a', label: 'A' }, { value: 'a', label: 'dup' }, { value: 5, label: 'Five' }, { value: { x: 1 }, label: 'bad' }, { value: 'z' }], has_more: true, page: 1, page_size: 25 })
assert.deepEqual(vals.options, [{ value: 'a', label: 'A' }, { value: 5, label: 'Five' }, { value: 'z', label: 'z' }])
assert.equal(vals.hasMore, true)
assert.deepEqual(L.mergeOptions([{ value: 'a', label: 'A' }], [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]).map((o) => o.value), ['a', 'b'], 'pages are appended without repeats')

console.log('filter-editor-0.12.116: PASS')
