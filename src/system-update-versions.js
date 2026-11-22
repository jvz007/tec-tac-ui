// 0.13.3 (Core 1.18.43, AD-77): the version dropdown on System Updates. Pure helpers, no request and no storage.
// Core sends the list newest first: { versions: [{ version, commit, date, operation, installable, reason }], source,
// installed_version, lowest_installable, github_rate_limit_error }. A missing or odd payload is an empty list.
import { rateLimitFromResult, rateLimitWarning } from './system-update-github.js'

const text = (value) => (typeof value === 'string' ? value.trim() : '')

export function normalizeVersions(payload) {
  const rows = payload && typeof payload === 'object' && Array.isArray(payload.versions) ? payload.versions : []
  const out = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const version = text(row.version)
    if (!version) continue
    out.push({
      version,
      commit: text(row.commit) || null,
      date: text(row.date) || null,
      operation: text(row.operation).toLowerCase(),
      installable: row.installable !== false,
      reason: text(row.reason),
    })
  }
  return out
}

const OPERATION_WORD = { update: 'update', reinstall: 'reinstall', downgrade: 'downgrade' }

// '1.18.42 - update', '1.18.40 - downgrade', '1.18.43 - reinstall (installed)'. A row Core refuses shows its reason.
export function versionLabel(row) {
  if (!row) return ''
  const word = OPERATION_WORD[row.operation] || ''
  if (row.installable === false) {
    return `${row.version} - not available${row.reason ? `: ${row.reason}` : ''}`
  }
  const tail = word ? ` - ${word}${word === 'reinstall' ? ' (installed)' : ''}` : ''
  return `${row.version}${tail}`
}

// The newest row, which is the first one Core sent.
export function defaultVersion(rows) {
  return Array.isArray(rows) && rows.length ? rows[0].version : ''
}

export function findVersion(rows, version) {
  return (Array.isArray(rows) ? rows : []).find((row) => row.version === version) || null
}

// The plain sentence for github_rate_limit_error that Core sends next to a saved list.
export function versionRateLimitText(payload, now = Date.now(), options = {}) {
  const info = rateLimitFromResult(payload)
  return info ? rateLimitWarning(info, now, options) : ''
}

export const VERSION_STALE_TEXT = 'The list changed after you opened it, so nothing was downloaded. The list was reloaded; pick again.'
