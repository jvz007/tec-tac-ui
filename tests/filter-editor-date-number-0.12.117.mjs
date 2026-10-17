// 0.12.117: date and number fields in the FilterEditor (Core 1.17.52, core.filter_sets 1.1.0). Logic first (the descriptor, the value
// shapes and every refusal, the round trip), then the component with the fake api and the 0.12.116 harness. Labels in the second
// fixture are odd on purpose ("Seen on"), so a test proves none is hard-coded.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DN_FIELDS, FIELDS, button, byLabel, choose, click, fakeApi, find, flush, mountEditor, textOf } from './fixtures/filter-editor-harness.mjs'

const logic = await import(new URL('../src/filter-editor-logic.js', import.meta.url).href)
const { createFilterEditorService } = await import(new URL('../src/filter-editor.js', import.meta.url).href)
const { normaliseDescriptor, ruleValue, toDefinition, draftFromDefinition, valueMode, setRuleOperator, setRuleField, setRuleValue, freshValue, fieldMap, cleanNumberText, valueHelp } = logic
const service = createFilterEditorService()

// ---- the descriptor ----
const desc = normaliseDescriptor(DN_FIELDS)
const byId = fieldMap(desc.fields)
assert.equal(desc.available, true)
assert.deepEqual(desc.fields.map((f) => f.id), ['last_seen', 'pending', 'score', 'hostname'], 'date and number fields are kept')
const seen = byId.get('last_seen')
assert.equal(seen.kind, 'date')
assert.equal(seen.source, 'none')
assert.deepEqual(seen.operators.map((o) => o.id), ['equals', 'not_equals', 'before', 'after', 'on_or_before', 'on_or_after', 'between', 'in_the_last', 'not_in_the_last'], "the field's own list; an unknown id (sometime) is left out")
assert.equal(seen.operators[0].label, 'Seen on', 'the label comes from the route')
assert.equal(seen.operators[8].label, 'Not seen within the last')
assert.deepEqual(seen.units, [{ id: 'minutes', max_amount: 525600 }, { id: 'hours', max_amount: 8760 }, { id: 'days', max_amount: 3650 }])
assert.equal(seen.constraints.storedAs, 'datetime')
assert.deepEqual({ ...byId.get('pending').constraints }, { integer: true, minimum: 0, maximum: 1000 })
assert.deepEqual({ ...byId.get('score').constraints }, { integer: false, minimum: null, maximum: null })
// the top-level `operators` key is never used for a date or number field
const withTop = normaliseDescriptor({ ...DN_FIELDS, operators: [{ id: 'contains', label: 'Contains' }] })
assert.deepEqual(fieldMap(withTop.fields).get('pending').operators.map((o) => o.id), byId.get('pending').operators.map((o) => o.id))
// no relative_units: the two relative operators go, nothing is invented
const noUnits = normaliseDescriptor({ ...DN_FIELDS, relative_units: undefined })
assert.deepEqual(fieldMap(noUnits.fields).get('last_seen').operators.map((o) => o.id), ['equals', 'not_equals', 'before', 'after', 'on_or_before', 'on_or_after', 'between'])
assert.deepEqual(fieldMap(normaliseDescriptor({ ...DN_FIELDS, relative_units: [{ id: 'days' }, { id: 5, max_amount: 3 }] }).fields).get('last_seen').units, [], 'a bad unit is left out')
// a field with only operators the editor cannot draw is dropped
const dropped = normaliseDescriptor({ ...DN_FIELDS, fields: [{ id: 'x', label: 'X', kind: 'number', operators: [{ id: 'roughly', label: 'Roughly' }], values: { source: 'none' } }, DN_FIELDS.fields[3]] })
assert.deepEqual(dropped.fields.map((f) => f.id), ['hostname'])
// a text-only descriptor behaves as before
const plain = normaliseDescriptor(FIELDS)
assert.deepEqual(plain.fields.map((f) => Object.keys(f).sort()), plain.fields.map(() => ['id', 'kind', 'label', 'operators', 'options', 'source']))
assert.equal(normaliseDescriptor({ available: true, fields: [{ id: 'z', label: 'Z', kind: 'weird', operators: [{ id: 'equals', label: 'Equals' }] }] }).available, false, 'any other kind is still dropped')

// ---- modes ----
assert.deepEqual(valueMode(seen, 'equals'), { type: 'date', control: 'date' }, 'equals on a date field never uses a picker')
assert.deepEqual(valueMode(seen, 'not_equals'), { type: 'date', control: 'date' })
assert.equal(valueMode(seen, 'between').control, 'date-range')
assert.equal(valueMode(seen, 'in_the_last').control, 'relative')
assert.equal(valueMode(seen, 'not_in_the_last').control, 'relative')
assert.equal(valueMode(byId.get('pending'), 'equals').control, 'number')
assert.equal(valueMode(byId.get('pending'), 'between').control, 'number-range')
assert.equal(valueMode(byId.get('hostname'), 'equals').control, 'picker-distinct', 'the text path is unchanged')

// ---- exact shapes ----
const rule = (field, operator, value) => ruleValue(byId.get(field), { operator, value })
for (const op of ['equals', 'not_equals', 'before', 'after', 'on_or_before', 'on_or_after']) assert.deepEqual(rule('last_seen', op, '2026-10-17'), { value: '2026-10-17' }, op)
assert.deepEqual(rule('last_seen', 'between', { from: '2026-10-01', to: '2026-10-17' }), { value: { from: '2026-10-01', to: '2026-10-17' } })
assert.deepEqual(rule('last_seen', 'between', { from: '2026-10-17', to: '2026-10-17' }), { value: { from: '2026-10-17', to: '2026-10-17' } }, 'the same day on both ends is fine')
for (const op of ['in_the_last', 'not_in_the_last']) {
  const r = rule('last_seen', op, { amount: '7', unit: 'days' })
  assert.deepEqual(r, { value: { amount: 7, unit: 'days' } })
  assert.equal(typeof r.value.amount, 'number')
}
assert.deepEqual(rule('last_seen', 'in_the_last', { amount: '525600', unit: 'minutes' }).value, { amount: 525600, unit: 'minutes' })
assert.deepEqual(rule('last_seen', 'in_the_last', { amount: '8760', unit: 'hours' }).value, { amount: 8760, unit: 'hours' })
assert.deepEqual(rule('last_seen', 'in_the_last', { amount: '3650', unit: 'days' }).value, { amount: 3650, unit: 'days' })
for (const op of ['equals', 'not_equals', 'greater_than', 'less_than', 'at_least', 'at_most']) {
  const r = rule('pending', op, '12')
  assert.deepEqual(r, { value: 12 }, op)
  assert.equal(typeof r.value, 'number', 'a JSON number, never text')
}
assert.deepEqual(rule('pending', 'between', { from: '1', to: '10' }), { value: { from: 1, to: 10 } })
assert.equal(typeof rule('pending', 'between', { from: '1', to: '10' }).value.from, 'number')
assert.deepEqual(rule('score', 'equals', '-3.5'), { value: -3.5 })
assert.deepEqual(rule('score', 'equals', '0'), { value: 0 })
assert.equal(Object.is(rule('score', 'equals', '-0').value, 0), true, 'minus zero is sent as 0')
assert.deepEqual(rule('score', 'equals', '1000000000000000'), { value: 10 ** 15 })
assert.deepEqual(rule('score', 'equals', 12.25), { value: 12.25 }, 'a number already typed as a number')
assert.deepEqual(rule('score', 'between', { from: '-2.5', to: '2.5' }), { value: { from: -2.5, to: 2.5 } })
assert.deepEqual(rule('pending', 'equals', '1000'), { value: 1000 }, 'the maximum itself is allowed')
assert.deepEqual(rule('pending', 'equals', '0'), { value: 0 }, 'the minimum itself is allowed')

// ---- refusals: a plain sentence naming the field and the limit ----
const refused = (field, op, value, ...needles) => {
  const r = rule(field, op, value)
  assert.equal(r.value, undefined, `${field} ${op} ${JSON.stringify(value)} is refused`)
  assert.equal(typeof r.problem, 'string')
  assert.ok(r.problem.includes(byId.get(field).label), `names the field: ${r.problem}`)
  for (const n of needles) assert.ok(r.problem.includes(n), `${r.problem} mentions ${n}`)
}
for (const bad of ['2026-02-30', '1969-12-31', '2101-01-01', '2026-10-17T10:00', '2026-10-17 10:00', '17/10/2026', '2026-1-7', 'today', 20261017, true]) refused('last_seen', 'equals', bad)
refused('last_seen', 'equals', '', 'Choose a day')
refused('last_seen', 'equals', '1969-12-31', '1970-01-01', '2100-12-31')
assert.deepEqual(rule('last_seen', 'equals', '1970-01-01'), { value: '1970-01-01' })
assert.deepEqual(rule('last_seen', 'equals', '2100-12-31'), { value: '2100-12-31' })
assert.deepEqual(rule('last_seen', 'equals', '2024-02-29'), { value: '2024-02-29' }, 'a leap day is real')
refused('last_seen', 'equals', '2025-02-29')
refused('last_seen', 'between', { from: '2026-10-18', to: '2026-10-17' }, 'may not be after')
refused('last_seen', 'between', { from: '', to: '2026-10-17' }, 'both ends')
refused('last_seen', 'between', { from: '2026-10-17', to: '' }, 'both ends')
refused('last_seen', 'between', { from: '2026-02-30', to: '2026-10-17' })
refused('last_seen', 'between', '2026-10-17', 'both ends')
for (const amount of ['0', '1.5', 'abc', '', '-1', 1.5, 0]) refused('last_seen', 'in_the_last', { amount, unit: 'days' })
refused('last_seen', 'in_the_last', { amount: '525601', unit: 'minutes' }, '525600', 'minutes')
refused('last_seen', 'in_the_last', { amount: '8761', unit: 'hours' }, '8760', 'hours')
refused('last_seen', 'in_the_last', { amount: '3651', unit: 'days' }, '3650', 'days')
refused('last_seen', 'not_in_the_last', { amount: '3651', unit: 'days' }, '3650')
refused('last_seen', 'in_the_last', { amount: '5', unit: 'weeks' }, 'unit')
refused('last_seen', 'in_the_last', { amount: '5', unit: '' }, 'unit')
refused('pending', 'equals', '1.5', 'whole number')
refused('pending', 'equals', '-1', 'at least 0')
refused('pending', 'equals', '1001', 'at most 1000')
refused('pending', 'between', { from: '5', to: '1' }, 'may not be larger')
refused('pending', 'between', { from: '', to: '1' }, 'both ends')
refused('pending', 'between', { from: '1', to: '2000' }, 'at most 1000')
for (const bad of ['1e3', 'NaN', 'Infinity', '-Infinity', '0x10', '1,5', '1.', '.5', '--1', '12abc', ' ', '1e-7', '1000000000000001', '-1000000000000001', '99999999999999999999']) refused('score', 'equals', bad)
refused('score', 'equals', '', 'Enter a number')
refused('score', 'equals', Number.NaN)
refused('score', 'equals', Number.POSITIVE_INFINITY)
refused('score', 'equals', 10 ** 15 + 2048, 'larger than')
refused('score', 'equals', true)
refused('score', 'equals', null)
// the same checks run through toDefinition: Apply stays off with problems
{
  const tree = { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'pending', operator: 'equals', value: '1001' }] }
  const out = toDefinition(tree, desc.fields)
  assert.equal(out.definition, null)
  assert.equal(out.problems.length, 1)
}

// ---- entering and changing values ----
assert.equal(cleanNumberText('1e3'), '13')
assert.equal(cleanNumberText('-12.5.6'), '-12.56')
assert.equal(cleanNumberText('a-1\u0007-2'), '-12', 'a minus only leads')
assert.equal(cleanNumberText('1 2'), '12')
assert.equal(cleanNumberText(0), '0')
assert.equal(cleanNumberText(Number.NaN), '')
let tree = { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'last_seen', operator: 'equals', value: '' }] }
const pathR = [0]
tree = setRuleValue(tree, pathR, seen, '2026-10-17\u0000')
assert.equal(tree.rules[0].value, '2026-10-17', 'control characters out')
tree = setRuleOperator(tree, pathR, seen, 'before')
assert.equal(tree.rules[0].value, '2026-10-17', 'within the same mode the value stays')
tree = setRuleOperator(tree, pathR, seen, 'between')
assert.deepEqual(tree.rules[0].value, { from: '', to: '' }, 'between modes it starts again')
tree = setRuleValue(tree, pathR, seen, { from: '2026-10-01' })
tree = setRuleValue(tree, pathR, seen, { to: '2026-10-17' })
assert.deepEqual(tree.rules[0].value, { from: '2026-10-01', to: '2026-10-17' }, 'each side keeps the other')
tree = setRuleOperator(tree, pathR, seen, 'in_the_last')
assert.deepEqual(tree.rules[0].value, { amount: '', unit: 'days' }, 'days is the default unit when Core lists it')
tree = setRuleValue(tree, pathR, seen, { amount: '1x5.0' })
assert.equal(tree.rules[0].value.amount, '150', 'the amount is digits only')
tree = setRuleValue(tree, pathR, seen, { unit: 'hours' })
tree = setRuleValue(tree, pathR, seen, { unit: 'weeks' })
assert.deepEqual(tree.rules[0].value, { amount: '150', unit: 'hours' }, 'a unit Core did not list is not taken')
tree = setRuleOperator(tree, pathR, seen, 'not_in_the_last')
assert.deepEqual(tree.rules[0].value, { amount: '150', unit: 'hours' }, 'relative to relative keeps the value')
assert.equal(freshValue({ ...seen, units: [{ id: 'hours', max_amount: 1 }, { id: 'minutes', max_amount: 2 }] }, 'in_the_last').unit, 'hours', 'else the first unit Core listed')
tree = setRuleField(tree, pathR, byId.get('pending'))
assert.equal(tree.rules[0].operator, 'equals', 'an operator the new field does not offer becomes its first')
assert.equal(tree.rules[0].value, '')

// ---- help text from the route's own labels ----
assert.deepEqual(valueHelp(seen, 'equals'), [logic.FILTER_TEXT.utcDay, 'A row with no Last seen value does not match this rule. It matches only "Not seen on" and "Not seen within the last".'])
assert.deepEqual(valueHelp(seen, 'in_the_last').length, 1, 'a relative rule has no day sentence')
assert.deepEqual(valueHelp(seen, 'not_equals')[1], 'A row with no Last seen value matches "Not seen on".')
assert.deepEqual(valueHelp(byId.get('score'), 'equals'), ['A row with no Score value does not match this rule.'], 'no label is invented when the route has none')
assert.match(valueHelp(byId.get('pending'), 'equals')[0], /"Is not exactly"/)
assert.deepEqual(valueHelp(byId.get('hostname'), 'equals'), [])

// ---- the round trip of saved rules ----
{
  const definition = {
    version: 1,
    match: 'any',
    rules: [
      { kind: 'rule', field: 'last_seen', operator: 'equals', value: '2026-10-17' },
      { kind: 'rule', field: 'last_seen', operator: 'between', value: { from: '2026-10-01', to: '2026-10-17' } },
      { kind: 'rule', field: 'last_seen', operator: 'in_the_last', value: { amount: 7, unit: 'days' } },
      { kind: 'rule', field: 'pending', operator: 'equals', value: 0 },
      { kind: 'rule', field: 'score', operator: 'equals', value: -3.5 },
      { kind: 'rule', field: 'score', operator: 'equals', value: 0.0000001 },
      { kind: 'rule', field: 'pending', operator: 'between', value: { from: 0, to: 10 } },
      { kind: 'rule', field: 'hostname', operator: 'contains', value: 'srv' },
    ],
  }
  const draft = draftFromDefinition(definition, undefined, byId)
  assert.ok(draft, 'a saved date and number set is drawn')
  assert.equal(draft.rules[3].value, '0', 'a number of 0 is drawn')
  assert.equal(draft.rules[4].value, '-3.5', 'a negative number is drawn')
  assert.equal(draft.rules[5].value, '0.0000001', 'no exponent in drawn text')
  const back = toDefinition(draft, byId)
  assert.deepEqual(back.problems, [])
  assert.deepEqual(back.definition, definition, 'it round-trips exactly')
  assert.ok(draftFromDefinition(definition, undefined, desc.fields), 'a field list works as well as a map')
  // without the map the date and number rules are not drawn (the old rule), and the text path is as before
  assert.equal(draftFromDefinition(definition), null)
  assert.ok(draftFromDefinition({ version: 1, match: 'all', rules: [{ kind: 'rule', field: 'hostname', operator: 'equals', value: 'a' }, { kind: 'rule', field: 'client', operator: 'equals', value: 4 }] }))
  for (const bad of [
    { field: 'last_seen', operator: 'equals', value: 5 },
    { field: 'last_seen', operator: 'equals', value: { from: 'a', to: 'b' } },
    { field: 'last_seen', operator: 'between', value: '2026-10-17' },
    { field: 'last_seen', operator: 'in_the_last', value: '7' },
    { field: 'last_seen', operator: 'in_the_last', value: { amount: 1.5, unit: 'days' } },
    { field: 'pending', operator: 'equals', value: '5' },
    { field: 'pending', operator: 'equals', value: true },
    { field: 'pending', operator: 'between', value: { from: 1 } },
    { field: 'pending', operator: 'between', value: 5 },
    { field: 'hostname', operator: 'equals', value: 0 },
  ]) assert.equal(draftFromDefinition({ version: 1, match: 'all', rules: [{ kind: 'rule', ...bad }] }, undefined, byId), null, `undrawable: ${JSON.stringify(bad)}`)
}

// ---- the component ----
const inputsOf = (t, pred) => find(t.root, (n) => n.tag === 'input' && pred(n.props))
const setField = async (t, label, id) => { byLabel(t.root, label)[0].props.onChange({ target: { value: id } }); await flush() }
const typeInto = async (t, label, value) => { byLabel(t.root, label)[0].props.onInput({ target: { value } }); await flush() }
const sets = { filter_sets: [] }
{
  const api = fakeApi({ fields: DN_FIELDS, sets })
  const t = await mountEditor(service, { api })
  click(button(t.root, 'Add rule'))
  await flush()
  const day = byLabel(t.root, 'Value for Last seen')[0]
  assert.equal(day.props.type, 'date')
  assert.equal(day.props.min, '1970-01-01')
  assert.equal(day.props.max, '2100-12-31')
  assert.match(textOf(t.root), /Choose a day for Last seen\./)
  assert.equal(button(t.root, 'Apply').props.disabled, true, 'Apply stays off with problems')
  const operatorLabels = find(t.root, (n) => n.tag === 'option').map((n) => textOf(n))
  assert.ok(operatorLabels.includes('Seen on') && operatorLabels.includes('Not seen within the last'), 'operator labels come from the route')
  assert.equal(operatorLabels.includes('Sometime'), false)
  // help text, linked
  const helpNode = find(t.root, (n) => n.tag === 'span' && /UTC days/.test(textOf(n)))[0]
  assert.ok(helpNode, 'the UTC day help is shown')
  assert.match(textOf(helpNode), /not South African time/)
  assert.match(textOf(helpNode), /does not match this rule\. It matches only "Not seen on" and "Not seen within the last"\./, "the route's own labels are quoted")
  assert.ok(day.props['aria-describedby'].split(' ').includes(helpNode.props.id), 'aria-describedby links to the help')
  // a valid day applies exactly
  await typeInto(t, 'Value for Last seen', '2026-10-17')
  assert.equal(button(t.root, 'Apply').props.disabled, false)
  assert.deepEqual(t.events.update.at(-1), { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'last_seen', operator: 'equals', value: '2026-10-17' }] })
  // the same mode keeps the value
  await setField(t, 'How to compare Last seen', 'before')
  assert.equal(byLabel(t.root, 'Value for Last seen')[0].props.value, '2026-10-17')
  // between: two inputs
  await setField(t, 'How to compare Last seen', 'between')
  assert.equal(byLabel(t.root, 'Value for Last seen').length, 0)
  const from = byLabel(t.root, 'Last seen from')[0]
  const to = byLabel(t.root, 'Last seen to')[0]
  assert.equal(from.props.type, 'date')
  assert.equal(to.props.type, 'date')
  assert.equal(from.props.value, '', 'a change between modes starts again')
  await typeInto(t, 'Last seen from', '2026-10-01')
  await typeInto(t, 'Last seen to', '2026-09-30')
  assert.match(textOf(t.root), /The first day for Last seen may not be after the last day\./)
  assert.equal(button(t.root, 'Apply').props.disabled, true)
  await typeInto(t, 'Last seen to', '2026-10-17')
  click(button(t.root, 'Apply'))
  const between = { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'last_seen', operator: 'between', value: { from: '2026-10-01', to: '2026-10-17' } }] }
  assert.deepEqual(t.events.update.at(-1), between)
  assert.deepEqual(t.events.apply, [{ definition: between, filterSetId: null }])
  // relative: amount and unit
  await setField(t, 'How to compare Last seen', 'in_the_last')
  const amount = byLabel(t.root, 'Amount for Last seen')[0]
  assert.equal(amount.props.type, 'number')
  assert.equal(amount.props.min, '1')
  assert.equal(amount.props.max, '3650', 'the maximum follows the unit Core listed')
  const unit = byLabel(t.root, 'Unit for Last seen')[0]
  assert.equal(unit.props.value, 'days')
  assert.deepEqual(find(unit, (n) => n.tag === 'option').map((n) => textOf(n)), ['minutes', 'hours', 'days'], 'unit ids as Core sent them')
  await typeInto(t, 'Amount for Last seen', '7')
  assert.deepEqual(t.events.update.at(-1).rules[0].value, { amount: 7, unit: 'days' })
  byLabel(t.root, 'Unit for Last seen')[0].props.onChange({ target: { value: 'minutes' } })
  await flush()
  assert.equal(byLabel(t.root, 'Amount for Last seen')[0].props.max, '525600')
  assert.deepEqual(t.events.update.at(-1).rules[0].value, { amount: 7, unit: 'minutes' })
  await typeInto(t, 'Amount for Last seen', '525601')
  assert.match(textOf(t.root), /The amount for Last seen must be a whole number from 1 to 525600 minutes\./)
  assert.equal(find(t.root, (n) => n.tag === 'span' && /UTC days/.test(textOf(n))).length, 0, 'a relative rule has no day sentence')
  t.unmount()
}
{
  const api = fakeApi({ fields: DN_FIELDS, sets })
  const t = await mountEditor(service, { api })
  click(button(t.root, 'Add rule'))
  await flush()
  await setField(t, 'Field', 'pending')
  const n = byLabel(t.root, 'Value for Pending actions')[0]
  assert.equal(n.props.type, 'number')
  assert.equal(n.props.step, '1', 'an integer field steps by 1')
  assert.equal(n.props.min, '0')
  assert.equal(n.props.max, '1000')
  assert.match(textOf(t.root), /It matches only "Is not exactly"\./)
  await typeInto(t, 'Value for Pending actions', '0')
  assert.deepEqual(t.events.update.at(-1).rules[0], { kind: 'rule', field: 'pending', operator: 'equals', value: 0 }, 'a typed 0 is the JSON number 0')
  assert.equal(typeof t.events.update.at(-1).rules[0].value, 'number')
  await typeInto(t, 'Value for Pending actions', '2.5')
  assert.match(textOf(t.root), /must be a whole number/)
  await setField(t, 'How to compare Pending actions', 'between')
  assert.equal(byLabel(t.root, 'Pending actions from')[0].props.type, 'number')
  assert.equal(byLabel(t.root, 'Pending actions to')[0].props.type, 'number')
  await typeInto(t, 'Pending actions from', '2')
  await typeInto(t, 'Pending actions to', '9')
  assert.deepEqual(t.events.update.at(-1).rules[0].value, { from: 2, to: 9 })
  await setField(t, 'Field', 'score')
  assert.equal(byLabel(t.root, 'Score from').length, 1, 'between is kept by a field that offers it, and the value starts again')
  assert.equal(byLabel(t.root, 'Score from')[0].props.value, '')
  await setField(t, 'How to compare Score', 'equals')
  assert.equal(byLabel(t.root, 'Value for Score')[0].props.step, 'any', 'a decimal field steps by any')
  assert.equal(byLabel(t.root, 'Value for Score')[0].props.min, undefined)
  await typeInto(t, 'Value for Score', '-3.5')
  assert.equal(t.events.update.at(-1).rules[0].value, -3.5)
  t.unmount()
}
// an editor with no relative_units offers no relative operator
{
  const api = fakeApi({ fields: { ...DN_FIELDS, relative_units: undefined }, sets })
  const t = await mountEditor(service, { api })
  click(button(t.root, 'Add rule'))
  await flush()
  const labels = find(t.root, (n) => n.tag === 'option').map((o) => textOf(o))
  assert.equal(labels.includes('Seen within the last'), false)
  assert.equal(labels.includes('Seen between'), true)
  t.unmount()
}

// ---- saved sets: the dict values are posted unchanged, and a saved set is drawn and applied by id ----
const SET_ID = '11111111-2222-4333-8444-555555555555'
const model = {
  version: 1,
  match: 'all',
  rules: [
    { kind: 'rule', field: 'last_seen', operator: 'between', value: { from: '2026-10-01', to: '2026-10-17' } },
    { kind: 'rule', field: 'last_seen', operator: 'not_in_the_last', value: { amount: 7, unit: 'days' } },
    { kind: 'rule', field: 'pending', operator: 'equals', value: 0 },
    { kind: 'rule', field: 'score', operator: 'between', value: { from: -2.5, to: 2.5 } },
  ],
}
{
  const api = fakeApi({ fields: DN_FIELDS, sets: (c) => (c.options.method === 'POST' ? { id: SET_ID, name: 'Quiet', mine: true, can_edit: true, shared: false, definition: model } : sets) })
  const t = await mountEditor(service, { api, userId: 7, props: { modelValue: model } })
  assert.equal(byLabel(t.root, 'Value for Pending actions')[0].props.value, '0', 'a value of 0 is drawn from the model')
  assert.equal(byLabel(t.root, 'Amount for Last seen')[0].props.value, '7')
  assert.equal(button(t.root, 'Apply').props.disabled, false)
  click(button(t.root, 'Save as new set'))
  await flush()
  const name = find(t.root, (n) => n.tag === 'input' && n.props.class === 'tt-input tt-filter-name')[0]
  name.props.onInput({ target: { value: 'Quiet' } })
  await flush()
  find(t.root, (n) => n.tag === 'form')[0].props.onSubmit({ preventDefault() {} })
  await flush()
  const post = api.calls.find((c) => c.options.method === 'POST')
  assert.deepEqual(JSON.parse(post.options.body), { module_id: 'agents', view_key: 'agents', name: 'Quiet', definition: model, readers: [7] }, 'the dict values are posted unchanged')
  t.unmount()
}
{
  const saved = { id: SET_ID, name: 'Quiet', mine: true, can_edit: true, shared: false, values_withheld: 0, definition: model }
  const api = fakeApi({ fields: DN_FIELDS, sets: { filter_sets: [saved] } })
  const t = await mountEditor(service, { api })
  await choose(t.root, 'Saved filter sets', 0)
  assert.equal(byLabel(t.root, 'Value for Pending actions')[0].props.value, '0', 'a saved number of 0 is drawn')
  assert.equal(byLabel(t.root, 'Score from')[0].props.value, '-2.5')
  assert.equal(textOf(t.root).includes('could not be shown'), false)
  click(button(t.root, 'Apply'))
  assert.deepEqual(t.events.apply.at(-1), { definition: null, filterSetId: SET_ID }, 'an unchanged saved set is applied by id')
  t.unmount()
}

// ---- no raw HTML and no browser storage ----
for (const file of ['../src/filter-editor.js', '../src/filter-editor-logic.js']) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8')
  assert.doesNotMatch(source, /v-html|innerHTML|localStorage|sessionStorage|indexedDB/, `${file} uses no raw HTML or browser storage`)
}
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
assert.ok(css.includes('.tt-filter-pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)'), 'two columns inside the value cell')
assert.ok(css.includes('@media (max-width:640px){.tt-filter-rule{grid-template-columns:minmax(0,1fr)}.tt-filter-pair{grid-template-columns:minmax(0,1fr)}'), 'one column under 640px')
const pairBlock = css.slice(css.indexOf('.tt-filter-pair'), css.indexOf('.tt-filter-pair') + 120)
assert.doesNotMatch(pairBlock, /#[0-9a-f]{3,8}\b/i, 'tokens only')

console.log('filter-editor-date-number-0.12.117: PASS')
