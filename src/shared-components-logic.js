// Pure rules behind the shared SearchSelect and TagEditor (0.12.111, brand board patterns P6 and P7). No Vue, no DOM, no
// imports: the components in shared-components.js only render and call these functions, so every keyboard and filter rule
// can be tested in node. Values are text; nothing here builds markup.

export const SELECT_LIMITS = Object.freeze({
  maxRows: 300,
  capText: 'Showing the first 300. Keep typing to narrow it.',
  emptyText: 'No matches. Check the spelling.',
  favouriteLabel: 'Favourites',
  allLabel: 'All',
  // 0.12.112 server mode: the module owns the search and the paging, so the list shows the rows as given, up to this many loaded rows.
  maxServerRows: 1000,
  serverCapText: 'Showing the first 1000 loaded. Keep typing to narrow it.',
  loadingText: 'Loading…',
})

export const TAG_LIMITS = Object.freeze({
  maxItems: 200,
  maxLength: 500,
})

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g

const isOption = (entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry)
const lower = (value) => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value)).toLowerCase()

// Options that are not objects are dropped. The options themselves are never copied or changed.
export function cleanOptions(options) {
  return (Array.isArray(options) ? options : []).filter(isOption)
}

// Case-insensitive match on label, description and searchText. An empty or blank query keeps every option, in order.
export function filterOptions(options, query) {
  const list = cleanOptions(options)
  const needle = lower(query).trim()
  if (!needle) return list
  return list.filter((option) => [option.label, option.description, option.searchText].some((field) => lower(field).includes(needle)))
}

// Favourites first, then the rest, each in the order given. A group with no rows is dropped.
export function groupOptions(options, { favouriteLabel = SELECT_LIMITS.favouriteLabel, allLabel = SELECT_LIMITS.allLabel } = {}) {
  const list = cleanOptions(options)
  const favourites = list.filter((option) => option.favourite === true)
  const rest = list.filter((option) => option.favourite !== true)
  const groups = []
  if (favourites.length) groups.push({ key: 'favourites', label: String(favouriteLabel), options: favourites })
  if (rest.length) groups.push({ key: 'all', label: String(allLabel), options: rest })
  return groups
}

// What the list shows: filtered, grouped and capped at maxRows. flat is the keyboard order (favourites first), and the
// number of rows in the groups equals flat.length. capped is true when rows were left out.
// serverSearch (0.12.112): the module has already searched, so the local filter is skipped and the cap is maxServerRows
// (1000 loaded rows) instead of maxRows. Without it nothing changes.
export function visibleOptions(options, query, { maxRows, favouriteLabel, allLabel, serverSearch = false } = {}) {
  const matched = serverSearch === true ? cleanOptions(options) : filterOptions(options, query)
  const groups = groupOptions(matched, { favouriteLabel, allLabel })
  const ordered = groups.flatMap((group) => group.options)
  const fallback = serverSearch === true ? SELECT_LIMITS.maxServerRows : SELECT_LIMITS.maxRows
  const limit = Number.isInteger(maxRows) && maxRows > 0 ? maxRows : fallback
  const capped = ordered.length > limit
  const flat = ordered.slice(0, limit)
  const keep = new Set(flat)
  const kept = groups
    .map((group) => ({ ...group, options: group.options.filter((option) => keep.has(option)) }))
    .filter((group) => group.options.length)
  return { groups: kept, flat, capped }
}

// Server mode: the label shown for the chosen value. A chosen option in the current page wins; a value that is not in the page
// shows selectedLabel (text only); nothing chosen shows nothing.
export function chosenDisplayLabel(chosenOption, modelValue, selectedLabel) {
  if (chosenOption) return String(chosenOption.label ?? '')
  if (modelValue === null || modelValue === undefined) return ''
  return typeof selectedLabel === 'string' ? selectedLabel : ''
}

// Whether the list asks the module for the next page. Only in server mode, only when the module said there is more, never
// while loading, and only once for one set of options (asked is true after the first request until the options change or
// loading ends). The trigger is the highlight reaching the last row, or the list scrolled to its end.
export function wantsMore({ serverSearch = false, hasMore = false, loading = false, asked = false, count = 0, highlight = -1, atEnd = false } = {}) {
  if (serverSearch !== true || hasMore !== true || loading === true || asked === true) return false
  if (atEnd === true) return true
  return count > 0 && highlight === count - 1
}

// Component definitions are frozen all the way down, so a module cannot change what another module receives. Only plain
// objects and arrays are frozen. A function is left alone: the props name constructors such as Array and String, and the
// built-in globals must never be frozen.
export function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  const proto = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return value
  seen.add(value)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value, seen)
  }
  return Object.freeze(value)
}

const enabledAt = (flat, index) => index >= 0 && index < flat.length && flat[index]?.disabled !== true

export function firstEnabled(flat) {
  for (let i = 0; i < flat.length; i += 1) if (enabledAt(flat, i)) return i
  return -1
}

// The next enabled row in the direction of step (1 or -1). It stops at the ends (no wrap). When no enabled row lies that way
// the index stays. When the index is not a row, a step down goes to the first enabled row and a step up stays at -1.
export function moveHighlight(flat, index, step) {
  const direction = step < 0 ? -1 : 1
  let from = Number.isInteger(index) ? index : -1
  if (from < -1 || from >= flat.length) from = -1
  if (from === -1 && direction < 0) return -1
  for (let probe = from + direction; probe >= 0 && probe < flat.length; probe += direction) {
    if (enabledAt(flat, probe)) return probe
  }
  return from
}

// What a key does in the combo box. state: { open, highlight, flat, chosenIndex }. Result: { action, highlight,
// preventDefault, stopPropagation }, with action one of 'none', 'open', 'move', 'choose', 'close'.
//   ArrowDown  closed: open on the chosen row (or the first enabled row); open: move down
//   ArrowUp    open: move up
//   Enter      open with an enabled highlighted row: choose it
//   Escape     open: close and stop there, so an enclosing popup stays open (the order is menu, dropdown, popup)
//   Tab        open: close and let the focus move on
export function comboKey(state, key) {
  const { open = false, highlight = -1, flat = [], chosenIndex = -1 } = state || {}
  const none = { action: 'none', highlight, preventDefault: false, stopPropagation: false }
  if (key === 'ArrowDown') {
    if (!open) {
      const start = enabledAt(flat, chosenIndex) ? chosenIndex : firstEnabled(flat)
      return { action: 'open', highlight: start, preventDefault: true, stopPropagation: false }
    }
    return { action: 'move', highlight: moveHighlight(flat, highlight, 1), preventDefault: true, stopPropagation: false }
  }
  if (key === 'ArrowUp') {
    if (!open) return none
    return { action: 'move', highlight: moveHighlight(flat, highlight, -1), preventDefault: true, stopPropagation: false }
  }
  if (key === 'Enter') {
    if (!open) return none
    if (enabledAt(flat, highlight)) return { action: 'choose', highlight, preventDefault: true, stopPropagation: false }
    return { action: 'none', highlight, preventDefault: true, stopPropagation: false }
  }
  if (key === 'Escape') {
    if (!open) return none
    return { action: 'close', highlight: -1, preventDefault: true, stopPropagation: true }
  }
  if (key === 'Tab') {
    if (!open) return none
    return { action: 'close', highlight: -1, preventDefault: false, stopPropagation: false }
  }
  return none
}

// ---- tag editor ----

export function cleanTagText(raw) {
  return String(raw === null || raw === undefined ? '' : raw).replace(CONTROL_CHARACTERS, '').trim()
}

const positiveInteger = (value, fallback) => (Number.isInteger(value) && value > 0 ? value : fallback)

// Adds one typed value. Control characters are stripped and the value is trimmed. An empty value and a duplicate are
// ignored (reason 'empty' and 'duplicate', no message). A value that is too long, one past maxItems and one validate()
// refuses are rejected with a plain message. Result: { values, added, value, reason, message } where values is always a
// new array.
export function addTag(values, raw, { maxItems = TAG_LIMITS.maxItems, maxLength = TAG_LIMITS.maxLength, validate } = {}) {
  const current = (Array.isArray(values) ? values : []).map(String)
  const value = cleanTagText(raw)
  const result = (reason, message = '') => ({ values: current, added: false, value, reason, message })
  if (!value) return result('empty')
  if (current.includes(value)) return result('duplicate')
  const length = positiveInteger(maxLength, TAG_LIMITS.maxLength)
  if (value.length > length) return result('too_long', `Use ${length} characters or fewer.`)
  const items = positiveInteger(maxItems, TAG_LIMITS.maxItems)
  if (current.length >= items) return result('too_many', `Add up to ${items} values.`)
  if (typeof validate === 'function') {
    let problem = ''
    try { problem = validate(value) } catch { problem = 'This value cannot be used.' }
    if (typeof problem === 'string' && problem.trim()) return result('invalid', problem)
  }
  return { values: [...current, value], added: true, value, reason: '', message: '' }
}

// Typed text as the values it holds: with commaAdds on, a comma ends a value, so pasted "a,b" is two values. With it off the
// whole text is one value.
export function splitTyped(text, commaAdds = true) {
  const raw = String(text === null || text === undefined ? '' : text)
  return commaAdds === false ? [raw] : raw.split(',')
}

export function removeLastTag(values) {
  const current = Array.isArray(values) ? values.map(String) : []
  return current.slice(0, -1)
}

export function removeTagAt(values, index) {
  const current = Array.isArray(values) ? values.map(String) : []
  if (!Number.isInteger(index) || index < 0 || index >= current.length) return current
  return current.filter((_, i) => i !== index)
}

// What a key does in the tag box. Returns 'add' (Enter, or a comma when commaAdds is on), 'removeLast' (Backspace in an
// empty box) or ''.
export function tagKey(key, { text = '', commaAdds = true, hasValues = false } = {}) {
  if (key === 'Enter') return 'add'
  if (key === ',' && commaAdds !== false) return 'add'
  if (key === 'Backspace' && !text && hasValues) return 'removeLast'
  return ''
}
