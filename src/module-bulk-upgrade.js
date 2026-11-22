// 0.13.2 (Core 1.18.42): select several modules in the Online catalog and stage them as one batch. This file holds the pure
// parts: which rows can be ticked, the selection, and the items sent to Core. Core plans and refuses; the browser sends
// repository, module and version only. Nothing is kept in browser storage.
import { blockedReasonText, updateBlocked } from './module-updates.js'
import { isLicensingSource } from './module-repository-info.js'

export const MAX_BATCH = 50

// ctx: { update(item) -> Core's updates[] entry or null, repositories: [] }.
// Returns { eligible, reason }. reason is a short line for an upgradable row that can't join the bulk run, else ''.
export function bulkEligibility(item, ctx = {}) {
  const none = { eligible: false, reason: '' }
  if (!item || !item.installed || item.update_available !== true || !item.latest_version) return none
  if (item.compatible === false || item.source_conflict) return none
  const entry = typeof ctx.update === 'function' ? ctx.update(item) : null
  if (entry && updateBlocked(entry)) return { eligible: false, reason: blockedReasonText(entry) }
  const repo = (Array.isArray(ctx.repositories) ? ctx.repositories : []).find((r) => r?.id === item.selected_repository_id)
  if (!repo || !isLicensingSource(repo)) return { eligible: false, reason: 'Upgrade on its own' }
  return { eligible: true, reason: '' }
}

export function eligibleIds(rows, ctx) {
  return (Array.isArray(rows) ? rows : []).filter((row) => bulkEligibility(row, ctx).eligible).map((row) => row.id)
}

// Keeps the ticked ids that are still in the catalog and still eligible after a refresh. Order of the catalog.
export function pruneSelection(selected, rows, ctx) {
  const keep = new Set(Array.isArray(selected) ? selected : [])
  return eligibleIds(rows, ctx).filter((id) => keep.has(id))
}

export function toggleSelection(selected, id, on) {
  const list = (Array.isArray(selected) ? selected : []).filter((x) => x !== id)
  return on ? [...list, id] : list
}

export function upgradeSelectedLabel(count) {
  return `Upgrade selected (${Number.isInteger(count) && count > 0 ? count : 0})`
}

export function upgradeSelectedDisabled({ count, canManage, jobRunning, inspecting, staged }) {
  return !(count > 0) || count > MAX_BATCH || !canManage || !!jobRunning || !!inspecting || !!staged
}

// The reason shown next to a disabled button when too many rows are ticked, else ''.
export function upgradeSelectedHint(count) {
  return Number.isInteger(count) && count > MAX_BATCH ? `Core stages at most ${MAX_BATCH} modules at once. Untick ${count - MAX_BATCH}.` : ''
}

// The batch body items: only ticked rows that are still eligible, in the catalog's order. Exactly these three keys per item.
export function batchItems(selected, rows, ctx) {
  const picked = new Set(Array.isArray(selected) ? selected : [])
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => picked.has(row.id) && bulkEligibility(row, ctx).eligible)
    .map((row) => ({ repository_id: row.selected_repository_id, module_id: row.id, version: row.latest_version }))
}
