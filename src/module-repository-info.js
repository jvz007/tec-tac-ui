// Display helpers for the Modules page (Core 1.17.39). Core skips an invalid entry in a repository index and keeps the rest:
// the sync object of GET /api/tfd/modules/repositories/ then carries skipped_count and skipped (at most 100 records, each
// with index, id, version and reason). The online catalog rows carry channel, lifecycle and recommended.
// Import-free and pure: no Vue, no api. It returns plain text; the view shows it with {{ }} or textContent only, never v-html.
// Nothing here decides anything: no button state, filter, sort, search or install reads these fields. An older Core sends
// none of these keys, so every helper returns nothing for a missing field.

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const shown = (value) => (value === null || value === undefined ? '—' : value)

// 'N skipped' when Core sent a count (0 included), 'N skipped, first M listed' when the list is shorter than the count,
// and '' when Core sent no count.
export function skippedSummary(sync) {
  const count = sync?.skipped_count
  if (!isNumber(count)) return ''
  const listed = Array.isArray(sync?.skipped) ? sync.skipped.length : 0
  if (count > listed) return `${count} skipped, first ${listed} listed`
  return `${count} skipped`
}

// One row per skipped record, in the order Core sent. index, id, version and reason keep the value as sent; a null or
// missing value shows as a dash. Nothing is escaped or changed: the view shows the string as text.
export function skippedRows(sync) {
  const list = Array.isArray(sync?.skipped) ? sync.skipped : []
  return list.map((entry) => ({
    index: shown(entry?.index),
    id: shown(entry?.id),
    version: shown(entry?.version),
    reason: shown(entry?.reason),
  }))
}

// The release labels of an online catalog row, in order: channel, lifecycle, then recommended. A null or missing field
// gives no label. recommended true reads 'recommended'; false reads 'not recommended' only when Core sends false.
export function releaseLabels(item) {
  const labels = []
  if (item?.channel !== null && item?.channel !== undefined && String(item.channel) !== '') labels.push(String(item.channel))
  if (item?.lifecycle !== null && item?.lifecycle !== undefined && String(item.lifecycle) !== '') labels.push(String(item.lifecycle))
  if (item?.recommended === true) labels.push('recommended')
  if (item?.recommended === false) labels.push('not recommended')
  return labels
}

// Core 1.17.41: GET /api/tfd/modules/catalog/online/ keeps modules[] as the modules a repository offers and adds
// availability { state, enabled_repositories, synced_repositories, installed_only_count, message } and installed_only[]
// ({ id, name, installed_version, installed_source }). Both are display only. An older Core sends neither key, and then
// onlineAvailability returns null and installedOnlyRows returns an empty list, so the tab behaves as it did before.
export const INSTALLED_ONLY_LIMIT = 200

// { state, message, repositoriesLine } or null when Core sent no availability object. message is the string Core wrote ('' when
// it sent none or sent something that is not a string). repositoriesLine is 'N of M repositories synced' only when both counts
// are whole numbers.
export function onlineAvailability(payload) {
  const a = payload?.availability
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null
  const state = typeof a.state === 'string' ? a.state : ''
  const message = typeof a.message === 'string' && a.message.trim() ? a.message : ''
  const synced = a.synced_repositories
  const enabled = a.enabled_repositories
  const whole = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0
  const repositoriesLine = whole(synced) && whole(enabled) ? `${synced} of ${enabled} repositories synced` : ''
  return { state, message, repositoriesLine }
}

// The installed-only note: one row per module installed here that no repository offers, in the order Core sent, at most 200.
// A null or missing field shows as a dash; a value that is not text or a number also shows as a dash. Nothing is escaped:
// the view shows each string as text.
export function installedOnlyRows(payload) {
  const list = Array.isArray(payload?.installed_only) ? payload.installed_only : []
  const text = (v) => (typeof v === 'string' ? (v === '' ? '—' : v) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '—')
  return list.slice(0, INSTALLED_ONLY_LIMIT).map((entry) => ({
    id: text(entry?.id),
    name: text(entry?.name),
    installed_version: text(entry?.installed_version),
    installed_source: text(entry?.installed_source),
  }))
}
