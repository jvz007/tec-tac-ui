// 0.12.125 (Core 1.17.104, phase 1b of docs/planning/module-auto-update): module update notices in the browser. The badge on
// the Modules menu entry, the highlighted rows and chips, the blocked reason and the "Updates available" filter all read
// Core's two read-only routes. Only a person with module management gets an answer; anyone else gets 403 and sees nothing.
// The count is loaded with the shell and when the Modules page loads, never on a timer. Nothing here installs anything:
// the install stays the Online catalogue flow.
import { reactive } from 'vue'

export const MODULE_UPDATE_LEVELS = Object.freeze(['patch', 'minor', 'major', 'other'])
export const MODULE_UPDATES_ROUTE = '/api/tfd/modules/updates/'
export const MODULE_UPDATES_COUNT_ROUTE = '/api/tfd/modules/updates/count/'
const MAX_REASON = 500

// Who may ask. The same rule as the other module-management entries in core-navigation.js. Core is the authority: a 403
// hides the badge whatever this says.
export function canSeeModuleUpdates(context = {}) {
  return context?.capabilities?.manage_modules === true || context?.user?.superuser === true
}

export function updateLevel(value) {
  const level = String(value || '').trim().toLowerCase()
  return MODULE_UPDATE_LEVELS.includes(level) ? level : 'other'
}

// "Update available 1.3.0 (minor)". For level "other" the bracket is left out (Core 1.17.104 request).
export function updateChipText(row) {
  const version = String(row?.available_version ?? '').trim()
  const level = updateLevel(row?.level)
  const head = version ? `Update available ${version}` : 'Update available'
  return level === 'other' ? head : `${head} (${level})`
}

// The release-notes link: https only, no credentials. Anything else is no link. Core already checks it; this is a second check.
export function safeReleaseNotesUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}

export function updateBlocked(row) {
  return row?.installable === false
}

// The reason a blocked update can't install yet, in plain text. Empty for an installable update.
export function blockedReasonText(row) {
  if (!updateBlocked(row)) return ''
  let text = typeof row.blocked_reason === 'string' ? row.blocked_reason.trim() : ''
  if (!text && Array.isArray(row.blocked_reasons)) {
    text = row.blocked_reasons.map((item) => String(item?.message || '').trim()).filter(Boolean).join(' ')
  }
  if (!text) text = 'This update cannot be installed yet.'
  return text.length > MAX_REASON ? `${text.slice(0, MAX_REASON - 1)}…` : text
}

function cleanRows(value) {
  if (!Array.isArray(value)) return []
  return value.filter((row) => row && typeof row === 'object' && typeof row.module_id === 'string' && row.module_id)
}

function cleanCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

// The badge text: empty when there is nothing to show.
export function badgeText(count) {
  const value = cleanCount(count)
  if (!value) return ''
  return value > 99 ? '99+' : String(value)
}

// One store per page load. fetchJson(path, options) is the api transport (apiFetch); nothing builds headers here.
export function createModuleUpdates({ fetchJson } = {}) {
  const state = reactive({
    // allowed: null until Core answered, false after a 403 (or no permission), true after a 200.
    allowed: null,
    count: 0,
    installableCount: 0,
    updates: [],
    loaded: false,
    error: '',
  })
  let countRun = 0
  let listRun = 0

  function forbid() {
    state.allowed = false
    state.count = 0
    state.installableCount = 0
    state.updates = []
  }

  function reset() {
    countRun += 1
    listRun += 1
    state.allowed = null
    state.count = 0
    state.installableCount = 0
    state.updates = []
    state.loaded = false
    state.error = ''
  }

  // The badge numbers. Quiet: a background read never shows the loading bar. A 403 hides the badge; any other failure
  // keeps what was shown and only warns.
  async function loadCount(context) {
    if (typeof fetchJson !== 'function') return
    if (!canSeeModuleUpdates(context)) { forbid(); return }
    const run = ++countRun
    try {
      const payload = await fetchJson(MODULE_UPDATES_COUNT_ROUTE, { quiet: true })
      if (run !== countRun) return
      state.allowed = true
      state.count = cleanCount(payload?.count)
      state.installableCount = cleanCount(payload?.installable_count)
    } catch (error) {
      if (run !== countRun) return
      if (error?.status === 403) forbid()
      else console.warn('[TEC-TAC-UI] The module update count could not be read.', error)
    }
  }

  // The list for the Modules page. It also refreshes the badge from the same answer.
  async function loadList(context) {
    if (typeof fetchJson !== 'function') return
    if (!canSeeModuleUpdates(context)) { forbid(); state.loaded = true; return }
    const run = ++listRun
    try {
      const payload = await fetchJson(MODULE_UPDATES_ROUTE, { quiet: true })
      if (run !== listRun) return
      state.allowed = true
      state.updates = cleanRows(payload?.updates)
      state.count = payload?.count == null ? state.updates.length : cleanCount(payload.count)
      state.installableCount = cleanCount(payload?.installable_count)
      state.error = ''
    } catch (error) {
      if (run !== listRun) return
      if (error?.status === 403) { forbid(); state.error = '' }
      else state.error = error?.message || 'Module updates could not be read.'
    } finally {
      if (run === listRun) state.loaded = true
    }
  }

  function updateFor(moduleId) {
    if (!moduleId) return null
    return state.updates.find((row) => row.module_id === moduleId) || null
  }

  return { state, loadCount, loadList, reset, updateFor }
}
