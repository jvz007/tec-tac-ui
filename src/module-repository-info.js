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
