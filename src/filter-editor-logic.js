// 0.12.117 adds the `date` and `number` field kinds (Core 1.17.52, core.filter_sets 1.1.0). Their operators come from the field's own
// `operators` list and the relative units from the answer's `relative_units`: nothing here names an operator label or a unit limit.
// 0.12.116: the pure rules behind FilterEditor (Core 1.17.50, core.filter_sets 1.0.0, docs/filter-sets.md). No Vue and no
// requests here. The editor builds only from the descriptor Core sends (fields, operators, value sources, limits): this file
// never invents a field or an operator. A definition is {version: 1, match: 'all'|'any', rules: [...]}; a rule is
// {kind: 'rule', field, operator, value}; a group is {kind: 'group', match, rules}. A tree being edited (a draft) may hold
// unfinished rules and the helper keys `label` (the shown name of a picked value); toDefinition() drops both.

export const FILTER_LIMITS = Object.freeze({
  rules: 50,
  groups: 20,
  depth: 3,
  valueLength: 200,
  searchLength: 100,
  nameMin: 1,
  nameMax: 160,
  setsPerKey: 100,
  debounceMs: 250,
})

export const VIEW_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,60}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Control characters (C0, DEL, C1) and the two Unicode line separators.
const CONTROL_CLASS = '[\u0000-\u001f\u007f-\u009f\u2028\u2029]'
const CONTROL = new RegExp(CONTROL_CLASS, 'g')
const HAS_CONTROL = new RegExp(CONTROL_CLASS)

export const FILTER_TEXT = Object.freeze({
  noFilters: 'This list has no filters yet.',
  valuesFailed: 'The list of values could not load. Type the value instead.',
  noUserId: 'Reload the page or sign in again to save a set only you can use.',
  fieldsFailed: 'The filter fields could not load.',
  setsFailed: 'The saved filter sets could not load.',
  badViewKey: 'This list needs a view key of 1 to 61 lower-case letters, digits, "-" or "_" before it can be filtered.',
  emptyGroup: 'Add a rule to this group or remove it.',
  chooseField: 'Choose a field.',
  networkFailed: 'Tec-Tac could not be reached. Check your connection and try again.',
  utcDay: 'Days are UTC days. "17 October" means 17 October 00:00 to 24:00 UTC, not South African time.',
})

export const DATE_MIN = '1970-01-01'
export const DATE_MAX = '2100-12-31'
export const NUMBER_MAGNITUDE = 10 ** 15
// The operator ids the editor can draw for each kind (Core's vocabulary, docs/filter-sets.md). An id outside the set is left out.
const DATE_OPERATORS = new Set(['equals', 'not_equals', 'before', 'after', 'on_or_before', 'on_or_after', 'between', 'in_the_last', 'not_in_the_last'])
const NUMBER_OPERATORS = new Set(['equals', 'not_equals', 'greater_than', 'less_than', 'at_least', 'at_most', 'between'])
const RELATIVE_OPERATORS = new Set(['in_the_last', 'not_in_the_last'])

const OPERATOR_PICKER = new Set(['equals', 'not_equals'])

// ---- text ----

// Control characters out, then cut. Never throws on a non-string.
export function stripControl(value, max = FILTER_LIMITS.valueLength) {
  if (value === null || value === undefined || typeof value === 'object' || typeof value === 'function') return ''
  const text = String(value).replace(CONTROL, '')
  return max > 0 && text.length > max ? text.slice(0, max) : text
}

// The search text sent to Core: trimmed, no control characters, at most 100 characters.
export function cleanSearch(value) {
  return stripControl(value, 0).trim().slice(0, FILTER_LIMITS.searchLength)
}

export function validViewKey(viewKey) {
  return typeof viewKey === 'string' && VIEW_KEY_PATTERN.test(viewKey)
}

function positiveInt(value) {
  return Number.isInteger(value) && value > 0
}

// A whole number above zero from a number or a string of digits, else null.
export function wholeNumber(value) {
  if (typeof value === 'number') return positiveInt(value) ? value : null
  if (typeof value === 'string' && /^[0-9]{1,15}$/.test(value.trim())) {
    const n = Number(value.trim())
    return positiveInt(n) ? n : null
  }
  return null
}

// ---- the descriptor ----

function cleanLabel(value, fallback) {
  const text = stripControl(value, 300).trim()
  return text || fallback
}

function limitFrom(value, fallback) {
  return positiveInt(value) ? value : fallback
}

// The answer's relative_units as [{id, max_amount}], exactly as Core sent them. A bad entry is left out; none means none.
function relativeUnitsOf(answer) {
  const out = []
  if (!Array.isArray(answer?.relative_units)) return out
  for (const raw of answer.relative_units) {
    if (!raw || typeof raw.id !== 'string' || !raw.id.trim() || !positiveInt(raw.max_amount)) continue
    const id = stripControl(raw.id, 40).trim()
    if (id && !out.some((unit) => unit.id === id)) out.push(Object.freeze({ id, max_amount: raw.max_amount }))
  }
  return out
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// Core's GET /api/tfd/filter-sets/fields/ answer, reduced to what the editor uses. A field or operator with a bad shape is
// left out (Core already checked them; this only keeps the render safe).
export function normaliseDescriptor(answer) {
  const out = { available: false, fields: [], limits: { ...FILTER_LIMITS } }
  if (!answer || typeof answer !== 'object') return out
  const limits = answer.limits && typeof answer.limits === 'object' ? answer.limits : {}
  out.limits = {
    ...FILTER_LIMITS,
    rules: limitFrom(limits.rules, FILTER_LIMITS.rules),
    groups: limitFrom(limits.groups, FILTER_LIMITS.groups),
    depth: limitFrom(limits.depth, FILTER_LIMITS.depth),
    valueLength: limitFrom(limits.value_length, FILTER_LIMITS.valueLength),
  }
  if (answer.available !== true || !Array.isArray(answer.fields)) return out
  const units = relativeUnitsOf(answer)
  for (const raw of answer.fields) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) continue
    const kind = ['text', 'id', 'bool', 'date', 'number'].includes(raw.kind) ? raw.kind : null
    if (!kind) continue
    const dated = kind === 'date' || kind === 'number'
    const known = kind === 'date' ? DATE_OPERATORS : NUMBER_OPERATORS
    // A date or number field uses only its own list. Without relative_units there is no unit to offer, so the two relative operators go.
    const operators = (Array.isArray(raw.operators) ? raw.operators : [])
      .filter((op) => op && typeof op.id === 'string' && op.id)
      .filter((op) => !dated || (known.has(op.id) && !(kind === 'date' && !units.length && RELATIVE_OPERATORS.has(op.id))))
      .map((op) => ({ id: op.id, label: cleanLabel(op.label, op.id) }))
    if (!operators.length) continue
    if (dated) {
      const c = raw.constraints && typeof raw.constraints === 'object' ? raw.constraints : {}
      const constraints = kind === 'number'
        ? Object.freeze({ integer: c.integer === true, minimum: finiteOrNull(c.minimum), maximum: finiteOrNull(c.maximum) })
        : Object.freeze({ storedAs: c.stored_as === 'date' ? 'date' : 'datetime' })
      out.fields.push(Object.freeze({ id: raw.id, label: cleanLabel(raw.label, raw.id), kind, operators, source: 'none', options: [], constraints, units: kind === 'date' ? units : [] }))
      continue
    }
    const values = raw.values && typeof raw.values === 'object' ? raw.values : {}
    const source = ['distinct', 'static', 'none'].includes(values.source) && kind !== 'bool' ? values.source : 'none'
    const options = source === 'static' && Array.isArray(values.options)
      ? values.options
        .filter((o) => o && (typeof o.value === 'string' || positiveInt(o.value)))
        .map((o) => ({ value: o.value, label: cleanLabel(o.label, String(o.value)) }))
      : []
    out.fields.push(Object.freeze({ id: raw.id, label: cleanLabel(raw.label, raw.id), kind, operators, source, options }))
  }
  out.available = out.fields.length > 0
  return out
}

export function fieldMap(fields) {
  return new Map((fields || []).map((field) => [field.id, field]))
}

export function operatorIds(field) {
  return field ? field.operators.map((op) => op.id) : []
}

export function defaultOperator(field) {
  return field?.operators?.[0]?.id || ''
}

// How a value is entered for a field and an operator. type is what is stored; control is how it is entered.
//   bool: a Yes/No choice. Equals and Does not equal on an id or text field use the field's value source (a searchable picker
//   for 'distinct' and 'static', a plain box for 'none'; an id field then wants a whole number). Every other operator is a
//   plain text box (an id field matches those on the display name).
export function valueMode(field, operatorId) {
  if (!field) return { type: 'text', control: 'box' }
  if (field.kind === 'bool') return { type: 'bool', control: 'choice' }
  if (field.kind === 'date') {
    if (operatorId === 'between') return { type: 'date-range', control: 'date-range' }
    if (RELATIVE_OPERATORS.has(operatorId)) return { type: 'relative', control: 'relative' }
    return { type: 'date', control: 'date' }
  }
  if (field.kind === 'number') return operatorId === 'between' ? { type: 'number-range', control: 'number-range' } : { type: 'number', control: 'number' }
  if (OPERATOR_PICKER.has(operatorId)) {
    const type = field.kind === 'id' ? 'id' : 'text'
    if (field.source === 'distinct') return { type, control: 'picker-distinct' }
    if (field.source === 'static') return { type, control: 'picker-static' }
    return { type, control: 'box' }
  }
  return { type: 'text', control: 'box' }
}

// The same kind of value: a typed text stays when the operator changes between a picker and a box.
export function sameMode(a, b) {
  return a.type === b.type
}

// ---- the tree ----

export function emptyDefinition() {
  return { version: 1, match: 'all', rules: [] }
}

export function cloneTree(tree) {
  return JSON.parse(JSON.stringify(tree))
}

function walk(group, visit, depth = 1) {
  for (const node of group.rules) {
    visit(node, depth)
    if (node.kind === 'group') walk(node, visit, depth + 1)
  }
}

export function countTree(tree) {
  const counts = { rules: 0, groups: 0, depth: 1 }
  if (!tree || !Array.isArray(tree.rules)) return counts
  walk(tree, (node, depth) => {
    if (node.kind === 'group') {
      counts.groups += 1
      counts.depth = Math.max(counts.depth, depth + 1)
    } else counts.rules += 1
  })
  return counts
}

export function nodeAt(tree, path) {
  let node = tree
  for (const index of path) {
    node = node?.rules?.[index]
    if (!node) return null
  }
  return node
}

// The group at a path has level path.length + 1 (the top group is level 1). A group added inside it has level path.length + 2.
export function addLimit(tree, path, what, limits = FILTER_LIMITS) {
  const counts = countTree(tree)
  if (what === 'rule' && counts.rules >= limits.rules) return `A filter can have at most ${limits.rules} rules.`
  if (what === 'group') {
    if (counts.groups >= limits.groups) return `A filter can have at most ${limits.groups} groups.`
    if (path.length + 2 > limits.depth) return `Groups can nest only ${limits.depth} levels deep.`
  }
  return ''
}

// The unit a relative rule starts with: days when Core lists it, else the first one Core listed.
export function defaultUnit(field) {
  const units = field?.units || []
  return (units.find((unit) => unit.id === 'days') || units[0])?.id || ''
}

// The empty value for a field and an operator: null for a Yes/No choice or a picked id, an empty pair for a range, an empty amount
// with the default unit for a relative rule, otherwise an empty box.
export function freshValue(field, operatorId) {
  const mode = valueMode(field, operatorId)
  if (mode.type === 'bool') return null
  if (mode.type === 'date-range' || mode.type === 'number-range') return { from: '', to: '' }
  if (mode.type === 'relative') return { amount: '', unit: defaultUnit(field) }
  return mode.type === 'id' && mode.control.startsWith('picker') ? null : ''
}

export function newRule(field) {
  const operator = defaultOperator(field)
  return { kind: 'rule', field: field?.id || '', operator, value: freshValue(field, operator) }
}

function edit(tree, path, change) {
  const next = cloneTree(tree)
  const node = nodeAt(next, path)
  if (!node) return tree
  change(node)
  return next
}

export function addRule(tree, path, field, limits = FILTER_LIMITS) {
  if (!field || addLimit(tree, path, 'rule', limits)) return tree
  return edit(tree, path, (group) => { if (group.kind !== 'rule') group.rules.push(newRule(field)) })
}

export function addGroup(tree, path, limits = FILTER_LIMITS) {
  if (addLimit(tree, path, 'group', limits)) return tree
  return edit(tree, path, (group) => { if (group.kind !== 'rule') group.rules.push({ kind: 'group', match: 'all', rules: [] }) })
}

export function removeNode(tree, path) {
  if (!path.length) return tree
  const parentPath = path.slice(0, -1)
  const index = path[path.length - 1]
  return edit(tree, parentPath, (group) => { group.rules.splice(index, 1) })
}

export function setMatch(tree, path, match) {
  if (match !== 'all' && match !== 'any') return tree
  return edit(tree, path, (group) => { if (group.kind !== 'rule') group.match = match })
}

// Changing the field keeps the operator when the new field offers it, otherwise it takes that field's first operator. The value
// always starts again: a value that belonged to one field is not a value of another.
export function setRuleField(tree, path, field) {
  if (!field) return tree
  return edit(tree, path, (rule) => {
    if (rule.kind !== 'rule') return
    rule.field = field.id
    if (!operatorIds(field).includes(rule.operator)) rule.operator = defaultOperator(field)
    rule.value = freshValue(field, rule.operator)
    delete rule.label
  })
}

export function setRuleOperator(tree, path, field, operatorId) {
  if (!field || !operatorIds(field).includes(operatorId)) return tree
  return edit(tree, path, (rule) => {
    if (rule.kind !== 'rule') return
    const before = valueMode(field, rule.operator)
    const after = valueMode(field, operatorId)
    rule.operator = operatorId
    if (!sameMode(before, after)) {
      rule.value = freshValue(field, operatorId)
      delete rule.label
    }
  })
}

// Number text as it is entered: digits, one leading minus and one point. Everything else (letters, 'e', spaces, control characters) goes.
export function cleanNumberText(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? numberText(value) : ''
  const raw = typeof value === 'string' ? value : ''
  let out = ''
  let point = false
  let seen = false
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') { out += ch; seen = true } else if (ch === '-' && !out && !seen) out = '-'
    else if (ch === '.' && !point) { point = true; out += '.' }
  }
  return out.slice(0, 24)
}

// A finite number as plain digits (never an exponent), so a saved 0.0000001 is drawn as typed text that the pattern accepts.
export function numberText(n) {
  if (!Number.isFinite(n)) return ''
  if (Object.is(n, -0)) return '0'
  const text = String(n)
  if (!/e/i.test(text)) return text
  return n.toFixed(20).replace(/0+$/, '').replace(/\.$/, '')
}

const cleanDay = (value) => stripControl(typeof value === 'string' ? value : '', 10)
const isPlain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

// A typed or picked value, cleaned as it is entered. A box for a whole number keeps digits only. A picked value may carry a label.
// box: true when a failed values read turned the picker into a plain box (an id field then takes digits, like a box).
export function setRuleValue(tree, path, field, value, label, { box = false } = {}) {
  return edit(tree, path, (rule) => {
    if (rule.kind !== 'rule') return
    const mode = valueMode(field, rule.operator)
    if (mode.type === 'date') rule.value = cleanDay(value)
    else if (mode.type === 'number') rule.value = cleanNumberText(value)
    else if (mode.type === 'date-range' || mode.type === 'number-range') {
      // A range takes {from} or {to} or both; the side not given keeps what it had.
      const clean = mode.type === 'date-range' ? cleanDay : cleanNumberText
      const now = isPlain(rule.value) ? rule.value : { from: '', to: '' }
      const given = isPlain(value) ? value : {}
      rule.value = { from: 'from' in given ? clean(given.from) : String(now.from ?? ''), to: 'to' in given ? clean(given.to) : String(now.to ?? '') }
    } else if (mode.type === 'relative') {
      const now = isPlain(rule.value) ? rule.value : { amount: '', unit: defaultUnit(field) }
      const given = isPlain(value) ? value : {}
      const unit = 'unit' in given && (field?.units || []).some((u) => u.id === given.unit) ? given.unit : now.unit
      rule.value = { amount: 'amount' in given ? String(given.amount ?? '').replace(/[^0-9]/g, '').slice(0, 7) : String(now.amount ?? ''), unit }
    } else if (mode.type === 'bool') rule.value = value === true || value === false ? value : null
    else if (mode.type === 'id') {
      if (mode.control === 'box' || box) rule.value = String(value ?? '').replace(/[^0-9]/g, '').slice(0, 15)
      else rule.value = wholeNumber(value)
    } else rule.value = typeof value === 'string' || typeof value === 'number' ? stripControl(value, field ? FILTER_LIMITS.valueLength : 200) : ''
    if (typeof label === 'string' && label) rule.label = stripControl(label, 300)
    else delete rule.label
  })
}

// ---- checking a draft ----

// One rule's value as Core wants it, or {problem}. A text value is trimmed.
// A day as strict YYYY-MM-DD: a real calendar day from 1970-01-01 to 2100-12-31, or null.
export function strictDay(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return null
  if (value < DATE_MIN || value > DATE_MAX) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? value : null
}

// A number as Core validates it: a JSON number from plain text (no exponent, NaN or infinity), at most 10**15 in size, no decimal on
// an integer field, inside the field's minimum and maximum. Returns {value} or {problem}.
function strictNumber(raw, field) {
  const name = field.label
  const c = field.constraints || {}
  if (typeof raw === 'number' && !Number.isFinite(raw)) return { problem: `${name} must be a number, for example 12 or -3.5.` }
  const text = typeof raw === 'number' ? numberText(raw) : (typeof raw === 'string' ? raw.trim() : '')
  if (!text) return { problem: `Enter a number for ${name}.` }
  if (!/^-?[0-9]+(\.[0-9]+)?$/.test(text)) return { problem: `${name} must be a number made of digits, with an optional minus sign and decimal point, for example 12 or -3.5.` }
  if (c.integer === true && text.includes('.')) return { problem: `${name} must be a whole number.` }
  let n = Number(text)
  if (!Number.isFinite(n) || Math.abs(n) > NUMBER_MAGNITUDE) return { problem: `${name} may not be larger than ${NUMBER_MAGNITUDE} or smaller than -${NUMBER_MAGNITUDE}.` }
  if (Object.is(n, -0)) n = 0
  if (typeof c.minimum === 'number' && n < c.minimum) return { problem: `${name} must be at least ${c.minimum}.` }
  if (typeof c.maximum === 'number' && n > c.maximum) return { problem: `${name} must be at most ${c.maximum}.` }
  return { value: n }
}

function strictDayFor(raw, name) {
  if (raw === null || raw === undefined || raw === '') return { problem: `Choose a day for ${name}.` }
  const day = strictDay(raw)
  return day ? { value: day } : { problem: `${name} must be a real day from ${DATE_MIN} to ${DATE_MAX}, written as YYYY-MM-DD with no time.` }
}

function relativeValue(field, raw) {
  const name = field.label
  const now = isPlain(raw) ? raw : {}
  const unit = (field.units || []).find((u) => u.id === now.unit)
  if (!unit) return { problem: `Choose a unit for ${name}.` }
  const text = typeof now.amount === 'number' ? (Number.isInteger(now.amount) ? String(now.amount) : 'x') : (typeof now.amount === 'string' ? now.amount.trim() : '')
  if (!text) return { problem: `Enter an amount for ${name}.` }
  const amount = /^[0-9]{1,9}$/.test(text) ? Number(text) : 0
  if (amount < 1 || amount > unit.max_amount) return { problem: `The amount for ${name} must be a whole number from 1 to ${unit.max_amount} ${unit.id}.` }
  return { value: { amount, unit: unit.id } }
}

export function ruleValue(field, rule, limits = FILTER_LIMITS) {
  const mode = valueMode(field, rule.operator)
  const name = field.label
  if (mode.type === 'date') return strictDayFor(rule.value, name)
  if (mode.type === 'number') return strictNumber(rule.value, field)
  if (mode.type === 'relative') return relativeValue(field, rule.value)
  if (mode.type === 'date-range' || mode.type === 'number-range') {
    const pair = isPlain(rule.value) ? rule.value : {}
    const empty = (v) => v === null || v === undefined || (typeof v === 'string' && !v.trim())
    if (empty(pair.from) || empty(pair.to)) return { problem: `Enter both ends of the range for ${name}.` }
    if (mode.type === 'date-range') {
      const from = strictDayFor(pair.from, name)
      if (from.problem) return from
      const to = strictDayFor(pair.to, name)
      if (to.problem) return to
      return from.value > to.value ? { problem: `The first day for ${name} may not be after the last day.` } : { value: { from: from.value, to: to.value } }
    }
    const from = strictNumber(pair.from, field)
    if (from.problem) return from
    const to = strictNumber(pair.to, field)
    if (to.problem) return to
    return from.value > to.value ? { problem: `The first number for ${name} may not be larger than the last.` } : { value: { from: from.value, to: to.value } }
  }
  if (mode.type === 'bool') {
    return rule.value === true || rule.value === false ? { value: rule.value } : { problem: `Choose a value for ${name}.` }
  }
  if (mode.type === 'id') {
    if (rule.value === null || rule.value === undefined || rule.value === '') return { problem: `Choose a value for ${name}.` }
    const n = wholeNumber(rule.value)
    return n === null ? { problem: `Enter a whole number for ${name}.` } : { value: n }
  }
  const text = typeof rule.value === 'string' || typeof rule.value === 'number' ? String(rule.value) : ''
  if (HAS_CONTROL.test(text)) return { problem: `The value for ${name} may not contain control characters.` }
  const trimmed = text.trim()
  if (!trimmed) return { problem: `Choose a value for ${name}.` }
  if (trimmed.length > limits.valueLength) return { problem: `The value for ${name} may have at most ${limits.valueLength} characters.` }
  return { value: trimmed }
}

// The help lines under a date or number rule. The labels are the route's own, never typed here.
export function valueHelp(field, operatorId) {
  if (!field || (field.kind !== 'date' && field.kind !== 'number')) return []
  const lines = []
  const mode = valueMode(field, operatorId)
  if (mode.type === 'date' || mode.type === 'date-range') lines.push(FILTER_TEXT.utcDay)
  const label = (id) => field.operators.find((op) => op.id === id)?.label
  const negative = operatorId === 'not_equals' || operatorId === 'not_in_the_last'
  if (negative) {
    lines.push(`A row with no ${field.label} value matches "${label(operatorId)}".`)
  } else {
    const names = ['not_equals', ...(field.kind === 'date' ? ['not_in_the_last'] : [])].map(label).filter(Boolean)
    lines.push(`A row with no ${field.label} value does not match this rule.${names.length ? ` It matches only ${names.map((n) => `"${n}"`).join(' and ')}.` : ''}`)
  }
  return lines
}

// Walks a draft. Returns {definition, problems}: definition is null when the tree is empty or any problem exists.
// An empty tree is a good draft that means "no filter" (a filter with no rules matches nothing in Core).
export function toDefinition(tree, fields, limits = FILTER_LIMITS) {
  const map = fields instanceof Map ? fields : fieldMap(fields)
  const problems = []
  const build = (group) => {
    const rules = []
    for (const node of group.rules) {
      if (node.kind === 'group') {
        if (!node.rules.length) { problems.push(FILTER_TEXT.emptyGroup); continue }
        rules.push(build(node))
        continue
      }
      const field = map.get(node.field)
      if (!field) { problems.push(FILTER_TEXT.chooseField); continue }
      if (!operatorIds(field).includes(node.operator)) { problems.push(`Choose how to compare ${field.label}.`); continue }
      const result = ruleValue(field, node, limits)
      if (result.problem) { problems.push(result.problem); continue }
      rules.push({ kind: 'rule', field: node.field, operator: node.operator, value: result.value })
    }
    return { kind: 'group', match: group.match === 'any' ? 'any' : 'all', rules }
  }
  if (!tree || !Array.isArray(tree.rules) || !tree.rules.length) return { definition: null, empty: true, problems }
  const top = build(tree)
  const counts = countTree(tree)
  if (counts.rules > limits.rules) problems.push(`A filter can have at most ${limits.rules} rules.`)
  if (counts.groups > limits.groups) problems.push(`A filter can have at most ${limits.groups} groups.`)
  if (counts.depth > limits.depth) problems.push(`Groups can nest only ${limits.depth} levels deep.`)
  if (problems.length) return { definition: null, empty: false, problems: [...new Set(problems)] }
  return { definition: { version: 1, match: top.match, rules: top.rules }, empty: false, problems: [] }
}

// A stable text for a definition, used to tell whether the screen still shows a saved set.
export function definitionKey(definition) {
  return definition ? JSON.stringify(definition) : ''
}

// ---- a saved definition back into a draft ----

// A saved date or number value as draft text, or undefined when its shape does not fit the field kind and the operator.
function savedDatedValue(field, operatorId, value) {
  const mode = valueMode(field, operatorId)
  const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? numberText(n) : undefined)
  if (mode.type === 'date') return typeof value === 'string' ? value : undefined
  if (mode.type === 'number') return num(value)
  if (mode.type === 'date-range') return isPlain(value) && typeof value.from === 'string' && typeof value.to === 'string' ? { from: value.from, to: value.to } : undefined
  if (mode.type === 'number-range') {
    if (!isPlain(value)) return undefined
    const from = num(value.from)
    const to = num(value.to)
    return from === undefined || to === undefined ? undefined : { from, to }
  }
  if (mode.type === 'relative') return isPlain(value) && Number.isInteger(value.amount) && typeof value.unit === 'string' ? { amount: String(value.amount), unit: value.unit } : undefined
  return undefined
}

// A saved definition as a draft, or null when it cannot be drawn: wrong shape, too big, or any withheld value (a set the
// person does not own is never drawn in 0.12.116).
export function draftFromDefinition(definition, limits = FILTER_LIMITS, fields = null) {
  const map = fields instanceof Map ? fields : (Array.isArray(fields) ? fieldMap(fields) : null)
  if (!definition || typeof definition !== 'object' || !Array.isArray(definition.rules)) return null
  let bad = false
  const read = (group, level) => {
    if (level > limits.depth) { bad = true; return { kind: 'group', match: 'all', rules: [] } }
    const rules = []
    for (const node of group.rules || []) {
      if (!node || typeof node !== 'object') { bad = true; continue }
      if (node.kind === 'group' && Array.isArray(node.rules)) { rules.push(read(node, level + 1)); continue }
      if (node.kind !== 'rule' || typeof node.field !== 'string' || typeof node.operator !== 'string' || node.withheld === true) { bad = true; continue }
      const field = map ? map.get(node.field) : null
      if (field && (field.kind === 'date' || field.kind === 'number')) {
        const dated = savedDatedValue(field, node.operator, node.value)
        if (dated === undefined) { bad = true; continue }
        rules.push({ kind: 'rule', field: node.field, operator: node.operator, value: dated })
        continue
      }
      const value = node.value
      if (!(typeof value === 'string' || typeof value === 'boolean' || positiveInt(value))) { bad = true; continue }
      rules.push({ kind: 'rule', field: node.field, operator: node.operator, value })
    }
    return { kind: 'group', match: group.match === 'any' ? 'any' : 'all', rules }
  }
  const tree = read(definition, 1)
  if (bad) return null
  const counts = countTree(tree)
  if (counts.rules > limits.rules || counts.groups > limits.groups) return null
  return { version: 1, match: tree.match, rules: tree.rules }
}

// ---- saved sets ----

// Core's GET /api/tfd/filter-sets/ answer as a list. A definition is kept only for a set the person owns.
export function normaliseSets(answer) {
  const list = Array.isArray(answer?.filter_sets) ? answer.filter_sets : []
  const out = []
  for (const raw of list) out.push(...normaliseSet(raw))
  return out
}

export function normaliseSet(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !UUID_PATTERN.test(raw.id)) return []
  const name = stripControl(raw.name, FILTER_LIMITS.nameMax).trim()
  if (!name) return []
  const mine = raw.mine === true
  const owner = raw.owner && typeof raw.owner === 'object' ? stripControl(raw.owner.username, 150).trim() : ''
  const hidden = !mine || raw.values_withheld > 0
  return [{
    id: raw.id,
    name,
    shared: raw.shared === true,
    mine,
    canEdit: raw.can_edit === true,
    owner,
    definition: hidden ? null : (raw.definition && typeof raw.definition === 'object' ? raw.definition : null),
  }]
}

// How a set shows in the picker: the name, then who it belongs to.
export function setOption(set) {
  const description = set.mine ? (set.shared ? 'Shared by you' : 'Only you') : `Shared by ${set.owner || 'someone else'}`
  return { value: set.id, label: set.name, description, chip: set.shared ? 'Shared' : '' }
}

// Only me is a readers list holding the signed-in person: Core has no private flag and an empty list means everyone who can
// use the module. Never returns an empty list. null when the id is missing or bad.
export function onlyMeReaders(userId) {
  const n = Number(userId)
  return Number.isInteger(n) && n >= 1 ? [n] : null
}

export function nameProblem(raw) {
  const text = typeof raw === 'string' ? raw : ''
  if (HAS_CONTROL.test(text)) return 'The name may not contain control characters.'
  const trimmed = text.trim()
  if (trimmed.length < FILTER_LIMITS.nameMin) return 'Enter a name for this set.'
  if (trimmed.length > FILTER_LIMITS.nameMax) return `The name may have at most ${FILTER_LIMITS.nameMax} characters.`
  return ''
}

export function cleanName(raw) {
  return stripControl(raw, 0).trim()
}

export function createBody({ moduleId, viewKey, name, definition, readers }) {
  return { module_id: moduleId, view_key: viewKey, name: cleanName(name), definition, readers }
}

// Only the keys that changed, against {name, key} (the saved name and the key of its definition). Core refuses unknown keys, so
// nothing else is sent. null when nothing changed.
export function updateBody(current, { name, definition }) {
  const body = {}
  if (typeof name === 'string' && cleanName(name) !== current.name) body.name = cleanName(name)
  if (definition && definitionKey(definition) !== current.key) body.definition = definition
  return Object.keys(body).length ? body : null
}

// ---- Core's refusals ----

function detailOf(error) {
  const detail = error?.payload && typeof error.payload === 'object' ? error.payload.detail : null
  return typeof detail === 'string' && detail.trim() ? stripControl(detail, 400).trim() : ''
}

// Core's own sentence when it sent one, otherwise a plain fallback for the code or status.
export function setErrorMessage(error, verb = 'save') {
  if (error?.refused === true || error?.code === 'signed_out') return stripControl(error.message, 300) || 'You are signed out. Sign in again to continue.'
  if (error && error.status === 0 && !detailOf(error)) return FILTER_TEXT.networkFailed
  const detail = detailOf(error)
  if (detail) return detail
  const code = error?.code
  const status = error?.status
  if (code === 'field_unavailable') return 'This filter set uses a field you cannot use.'
  if (code === 'name_conflict' || status === 409) return 'You already have a filter set with this name. Choose another name.'
  if (code === 'not_found' || status === 404) return 'This filter set no longer exists. Refresh the list.'
  if (code === 'permission_denied' || status === 403) return `You do not have permission to ${verb} this filter set.`
  if (code === 'audit_failed') return 'Your change was not saved. Tec-Tac could not record it. Try again in a moment.'
  if (status === 429) return 'You are saving filter sets too quickly. Wait a minute, then try again.'
  if (status >= 500) return `The filter set could not be ${verb === 'delete' ? 'deleted' : 'saved'} because the server had a problem. Try again in a moment.`
  return typeof error?.message === 'string' && error.message ? stripControl(error.message, 300) : `The filter set could not be ${verb === 'delete' ? 'deleted' : 'saved'}.`
}

// The fields, sets or values read failed: Core's detail as sent, else the plain fallback.
export function readErrorMessage(error, fallback) {
  if (error?.refused === true || error?.code === 'signed_out') return stripControl(error.message, 300) || 'You are signed out. Sign in again to continue.'
  if (error && error.status === 0 && !detailOf(error)) return FILTER_TEXT.networkFailed
  return detailOf(error) || fallback
}

export function isAbort(error) {
  return Boolean(error) && (error.name === 'AbortError' || error.code === 20)
}

// Core's values answer as options. Only text and whole-number values are kept; a repeat is dropped.
export function normaliseValues(answer) {
  const rows = Array.isArray(answer?.values) ? answer.values : []
  const seen = new Set()
  const options = []
  for (const row of rows) {
    if (!row || (typeof row.value !== 'string' && !positiveInt(row.value))) continue
    if (seen.has(row.value)) continue
    seen.add(row.value)
    options.push({ value: row.value, label: cleanLabel(row.label, String(row.value)) })
  }
  return { options, hasMore: answer?.has_more === true }
}

export function mergeOptions(existing, more) {
  const seen = new Set(existing.map((o) => o.value))
  return [...existing, ...more.filter((o) => !seen.has(o.value))]
}
