// Module category for the Modules page (AD-21, Core 1.17.13).
// Import-free and pure: it reads the fields Core puts on the rows of GET /api/tfd/modules/v2/
// (category, effective_category, category_missing, category_refused, category_warning,
// category_state, category_mismatch) and returns text. Core's own warning is shown as sent.
// A row without any of those fields (an older Core) gets no badge and no guess.

const FIELDS = ['category', 'effective_category', 'category_missing', 'category_refused', 'category_warning', 'category_state', 'category_mismatch']
const KNOWN = { core: 'Core', server: 'Server', premium: 'Premium', test: 'Test' }
export const NOT_STATED_LABEL = 'Not stated, treated as Test'

export const CATEGORY_FILTERS = [
  { key: 'all', label: 'All categories' },
  { key: 'core', label: 'Core' },
  { key: 'server', label: 'Server' },
  { key: 'premium', label: 'Premium' },
  { key: 'test', label: 'Test' },
  { key: 'missing', label: 'Not stated' },
]

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '')
const hasFields = (row) => Boolean(row) && typeof row === 'object' && FIELDS.some((name) => row[name] !== undefined && row[name] !== null)

// The category Core names for the row: the declared one, else the effective one. '' when none.
function stated(row) {
  return text(row?.category).toLowerCase() || text(row?.effective_category).toLowerCase()
}

export function categoryFilterKey(row) {
  if (!hasFields(row)) return 'unknown'
  if (row.category_missing === true) return 'missing'
  const name = stated(row)
  if (KNOWN[name]) return name
  return name ? 'other' : 'unknown'
}

// { label, tone, known }. known false means there is nothing to show.
export function categoryBadge(row) {
  if (!hasFields(row)) return { label: '', tone: '', known: false }
  if (row.category_missing === true) return { label: NOT_STATED_LABEL, tone: 'warn', known: true }
  const name = stated(row)
  if (!name) return { label: '', tone: '', known: false }
  // A value Core sends that this UI does not know is shown as sent, in plain text.
  if (!KNOWN[name]) return { label: text(row.category) || text(row.effective_category), tone: '', known: true }
  return { label: KNOWN[name], tone: name === 'test' ? 'warn' : '', known: true }
}

export function filterByCategory(rows, key) {
  const list = Array.isArray(rows) ? rows : []
  if (!key || key === 'all') return list
  return list.filter((row) => categoryFilterKey(row) === key)
}

// Core's own warning, verbatim, and a plain line when the recorded category differs from the manifest.
export function categoryNote(row) {
  const lines = []
  const warning = typeof row?.category_warning === 'string' ? row.category_warning : ''
  if (warning.trim()) lines.push(warning)
  if (row?.category_mismatch === true) {
    lines.push("The category recorded at install differs from the one in the module's manifest. Core uses the manifest.")
  }
  return lines
}

export function categorySearchText(row) {
  return categoryBadge(row).label
}
