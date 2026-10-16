// Pure rules for the shared component kit (0.12.114): the sort cycle, the aria-sort value, row keys and the row cap, the
// keyboard moves on a table, the step states and the editor window keys. No Vue and no DOM here, so node can test them.

export const KIT_LIMITS = Object.freeze({
  maxRows: 2000,
  maxColumns: 40,
  maxSteps: 12,
  skeletonRows: 5,
  cappedText: 'Showing the first 2000 rows.',
  loadingText: 'Loading',
  emptyTitle: 'Nothing to show',
  closeLabel: 'Close',
  unsavedText: '● Unsaved changes',
})

const ALIGNS = new Set(['left', 'right', 'center'])
const WIDTH = /^\d{1,4}(px|%)$/

// Columns the table will draw. Each needs a text key; anything else is dropped. The label falls back to the key.
export function cleanColumns(columns) {
  if (!Array.isArray(columns)) return []
  const seen = new Set()
  const out = []
  for (const column of columns) {
    if (out.length >= KIT_LIMITS.maxColumns) break
    if (!column || typeof column !== 'object') continue
    const key = typeof column.key === 'string' ? column.key : ''
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({
      key,
      label: typeof column.label === 'string' ? column.label : key,
      sortable: column.sortable === true,
      align: ALIGNS.has(column.align) ? column.align : 'left',
      width: typeof column.width === 'string' && WIDTH.test(column.width) ? column.width : '',
    })
  }
  return out
}

// A row's key as text. A missing key falls back to the row's position, so a table always has a unique key for every row.
export function keyedRows(rows, rowKey) {
  if (!Array.isArray(rows)) return { items: [], capped: false }
  const capped = rows.length > KIT_LIMITS.maxRows
  const seen = new Set()
  const items = []
  const take = capped ? rows.slice(0, KIT_LIMITS.maxRows) : rows
  take.forEach((row, index) => {
    let key = typeof rowKey === 'string' && row && typeof row === 'object' && row[rowKey] !== undefined && row[rowKey] !== null
      ? String(row[rowKey])
      : String(index)
    if (seen.has(key)) key = `${key}#${index}`
    seen.add(key)
    items.push({ row, key, index })
  })
  return { items, capped }
}

// Text for a cell. Numbers and booleans become text, null and undefined become nothing, an object never prints as markup.
export function cellText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  return ''
}

export const ariaSortFor = (columnKey, sortKey, sortDir) => {
  if (columnKey !== sortKey) return undefined
  if (sortDir === 'ascending' || sortDir === 'asc') return 'ascending'
  if (sortDir === 'descending' || sortDir === 'desc') return 'descending'
  return undefined
}

// The next sort for a click on a header: ascending, then descending, then none. A new column starts at ascending.
export function nextSort(sortKey, sortDir, columnKey) {
  const current = ariaSortFor(sortKey, sortKey, sortDir)
  if (columnKey !== sortKey || !current) return { sortKey: columnKey, sortDir: 'ascending' }
  if (current === 'ascending') return { sortKey: columnKey, sortDir: 'descending' }
  return { sortKey: null, sortDir: null }
}

// Arrow keys on the rows. Returns the index to focus, or -1 when the key does nothing. The ends do not wrap.
export function rowFocusMove(index, key, count) {
  if (!(count > 0)) return -1
  const at = Number.isInteger(index) && index >= 0 ? index : 0
  if (key === 'ArrowDown') return Math.min(count - 1, at + 1)
  if (key === 'ArrowUp') return Math.max(0, at - 1)
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return -1
}

// Which row is reachable with Tab: the selected row, else the first.
export function tabbableIndex(items, selectedKey) {
  if (!items.length) return -1
  if (selectedKey !== null && selectedKey !== undefined) {
    const found = items.findIndex((item) => item.key === String(selectedKey))
    if (found >= 0) return found
  }
  return 0
}

export function cleanSteps(steps) {
  if (!Array.isArray(steps)) return []
  const seen = new Set()
  const out = []
  for (const step of steps) {
    if (out.length >= KIT_LIMITS.maxSteps) break
    if (!step || typeof step !== 'object') continue
    const key = typeof step.key === 'string' ? step.key : ''
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ key, label: typeof step.label === 'string' ? step.label : key, state: step.state === 'done' || step.state === 'error' ? step.state : '' })
  }
  return out
}

// 'current', 'error', 'done' or 'todo'. The current step is current even when it was marked done earlier.
export function stepState(step, index, currentIndex) {
  if (index === currentIndex) return 'current'
  if (step.state === 'error') return 'error'
  if (step.state === 'done') return 'done'
  return 'todo'
}

// Only an earlier step can be chosen, so going Back never loses values and a later step cannot be skipped to.
export const canSelectStep = (index, currentIndex) => currentIndex >= 0 && index >= 0 && index < currentIndex

// Keys of the editor window: Ctrl+S or Cmd+S saves, Escape closes. Saving needs canSave and no save in progress.
export function editorKeyAction(event, { canSave, saving }) {
  if (!event) return null
  const key = typeof event.key === 'string' ? event.key : ''
  if (key === 'Escape') return 'close'
  if ((event.ctrlKey || event.metaKey) && !event.altKey && key.toLowerCase() === 's') return canSave === true && saving !== true ? 'save' : 'blocked'
  return null
}

export const saveEnabled = ({ canSave, saving }) => canSave === true && saving !== true
