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
})

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
  for (const raw of answer.fields) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) continue
    const kind = ['text', 'id', 'bool'].includes(raw.kind) ? raw.kind : null
    if (!kind) continue
    const operators = (Array.isArray(raw.operators) ? raw.operators : [])
      .filter((op) => op && typeof op.id === 'string' && op.id)
      .map((op) => ({ id: op.id, label: cleanLabel(op.label, op.id) }))
    if (!operators.length) continue
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

// The empty value for a field and an operator: null for a Yes/No choice or a picked id, otherwise an empty box.
export function freshValue(field, operatorId) {
  const mode = valueMode(field, operatorId)
  if (mode.type === 'bool') return null
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

// A typed or picked value, cleaned as it is entered. A box for a whole number keeps digits only. A picked value may carry a label.
// box: true when a failed values read turned the picker into a plain box (an id field then takes digits, like a box).
export function setRuleValue(tree, path, field, value, label, { box = false } = {}) {
  return edit(tree, path, (rule) => {
    if (rule.kind !== 'rule') return
    const mode = valueMode(field, rule.operator)
    if (mode.type === 'bool') rule.value = value === true || value === false ? value : null
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
export function ruleValue(field, rule, limits = FILTER_LIMITS) {
  const mode = valueMode(field, rule.operator)
  const name = field.label
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

// A saved definition as a draft, or null when it cannot be drawn: wrong shape, too big, or any withheld value (a set the
// person does not own is never drawn in 0.12.116).
export function draftFromDefinition(definition, limits = FILTER_LIMITS) {
  if (!definition || typeof definition !== 'object' || !Array.isArray(definition.rules)) return null
  let bad = false
  const read = (group, level) => {
    if (level > limits.depth) { bad = true; return { kind: 'group', match: 'all', rules: [] } }
    const rules = []
    for (const node of group.rules || []) {
      if (!node || typeof node !== 'object') { bad = true; continue }
      if (node.kind === 'group' && Array.isArray(node.rules)) { rules.push(read(node, level + 1)); continue }
      if (node.kind !== 'rule' || typeof node.field !== 'string' || typeof node.operator !== 'string' || node.withheld === true) { bad = true; continue }
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
