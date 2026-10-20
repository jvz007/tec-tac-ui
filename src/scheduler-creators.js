// 0.12.118: who created and who confirmed a schedule (Core 1.17.63), the two filters, and the note that scheduled runs are not
// re-checked against their creator (Core 1.17.65, Johan's signed amendment of AD-13 condition 2, 20 October 2026). Pure and
// import-free. Names are text; the stored name is shown even when the user no longer exists. The wording is security wording
// and is flagged for human review in the release notes.

export const NOT_RECORDED = 'Not recorded'

// Shown on User schedules and Module schedules, always, above the table and in the schedule detail.
export const NOT_RECHECKED_NOTE = 'Scheduled runs are not re-checked against the person who created them, as in Tactical. Core checked their rights when the schedule was created or last edited. A schedule keeps running after its creator loses access, until someone removes or edits it.'
// In the editor: the person who saves becomes the confirmer.
export const SAVE_CONFIRMER_NOTE = 'Saving this schedule makes you its confirmer. Core records your name.'

const name = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '')

export function createdByDisplay(item) { return name(item?.created_by_username) || NOT_RECORDED }
export function confirmedByDisplay(item) { return name(item?.confirmed_by_username) || NOT_RECORDED }

// Trimmed names, and only the ones that are not empty. An empty box sends nothing.
export function cleanFilters(filters) {
  const out = {}
  const createdBy = name(filters?.createdBy)
  const confirmedBy = name(filters?.confirmedBy)
  if (createdBy) out.createdBy = createdBy
  if (confirmedBy) out.confirmedBy = confirmedBy
  return out
}

// The query string for listSchedules, in a fixed order: owner_type, created_by, confirmed_by.
export function schedulesQuery(ownerType = null, filters = {}) {
  const parts = []
  if (ownerType) parts.push(`owner_type=${encodeURIComponent(ownerType)}`)
  const clean = cleanFilters(filters)
  if (clean.createdBy) parts.push(`created_by=${encodeURIComponent(clean.createdBy)}`)
  if (clean.confirmedBy) parts.push(`confirmed_by=${encodeURIComponent(clean.confirmedBy)}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

// The one-line state beside the filter boxes, or '' when no filter is applied.
export function filterStateSentence(filters) {
  const clean = cleanFilters(filters)
  if (clean.createdBy && clean.confirmedBy) return `Showing schedules created by ${clean.createdBy} and confirmed by ${clean.confirmedBy}`
  if (clean.createdBy) return `Showing schedules created by ${clean.createdBy}`
  if (clean.confirmedBy) return `Showing schedules confirmed by ${clean.confirmedBy}`
  return ''
}

// The tab count line. A filter narrows the list, so the counts say they are filtered.
export function tabCountLine(configured, enabled, filtered) {
  return `${configured} configured · ${enabled} enabled${filtered ? ' · filtered' : ''}`
}
