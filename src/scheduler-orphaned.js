// 0.12.123 (Core 1.17.97): schedules whose owner module is not installed ("orphaned"). Pure and import-free. Core is the authority
// (manage flag, target scope, 409 re-checks); this file only turns Core's answers into plain words and decides which buttons to show.
// Schedules of a DISABLED module never arrive from Core 1.17.97, so there is nothing here for them. Everything returned is text.

export const ORPHAN_FALLBACK_LABEL = 'Owner module not installed'
export const ORPHAN_RUN_TITLE = 'Owner module not installed'
export const ORPHAN_MODULE_NOTE = 'If the owning module is gone, Disable pauses its schedule and Remove deletes it. Run history stays.'
export const STATE_UNREADABLE_NOTE = 'Core could not read the module state, so it is hiding every module-bound schedule. Try again in a moment.'
export const REGISTRY_UNREADABLE_NOTE = 'Core could not read the module registry, so it offers no Disable or Remove for schedules whose module is not installed.'

const MAX = 300
const text = (value, max = MAX) => {
  if (value == null || typeof value === 'object' || typeof value === 'function') return ''
  const out = String(value).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, ' ').replace(/ {2,}/g, ' ').trim()
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// The badge text for a row, or '' when the row is not orphaned. Core's own label wins.
export function orphanedBadge(item) {
  if (!item || item.orphaned !== true) return ''
  return text(item.orphan_label, 80) || ORPHAN_FALLBACK_LABEL
}

// Buttons show only for a manager, on an orphaned row, and never when Core could not read its module registry.
export function canManageOrphan(item, manage, registryUnreadable) {
  return manage === true && registryUnreadable !== true && Boolean(item) && item.orphaned === true
}

// mode is 'disable' or 'remove'. The plain Yes or No for the two bulk calls; it names the module and the count.
export function bulkQuestion(mode, moduleId, count) {
  const id = text(moduleId, 80)
  const n = Number.isInteger(count) && count >= 0 ? count : 0
  if (mode === 'remove') {
    return {
      question: `Remove ${plural(n, 'schedule', 'schedules')} of ${id}?`,
      target: id,
      detail: "The schedules are deleted. Run history stays. The module's own schedules are not recreated until a person saves them in the module again.",
      yesLabel: 'Remove',
      danger: true,
    }
  }
  return {
    question: `Disable ${plural(n, 'schedule', 'schedules')} of ${id}?`,
    target: id,
    detail: 'The schedules stay in the list and do not run.',
    yesLabel: 'Disable',
    danger: false,
  }
}

// Core's answer {module_id, count, mode, skipped_out_of_scope} as one sentence.
export function bulkResultSentence(answer) {
  const a = answer && typeof answer === 'object' ? answer : {}
  const id = text(a.module_id, 80) || 'the module'
  const n = Number.isInteger(a.count) && a.count >= 0 ? a.count : 0
  const skipped = Number.isInteger(a.skipped_out_of_scope) && a.skipped_out_of_scope > 0 ? a.skipped_out_of_scope : 0
  const verb = ['remove', 'removed', 'delete', 'deleted'].includes(a.mode) ? 'Removed' : 'Disabled'
  const tail = skipped ? ` ${skipped} outside your scope ${skipped === 1 ? 'was' : 'were'} left alone.` : ''
  return `${verb} ${plural(n, 'schedule', 'schedules')} of ${id}.${tail}`
}

export function outOfScopeLine(count) {
  if (!Number.isInteger(count) || count < 1) return ''
  return `${plural(count, 'schedule is', 'schedules are')} outside your scope and ${count === 1 ? 'is' : 'are'} not listed`
}

// Plain sentence for a failed orphan call. Unknown errors fall back to the error's own message.
export function orphanedErrorWords(e) {
  const status = e && Number(e.status)
  const payload = e && typeof e.payload === 'object' && e.payload ? e.payload : {}
  const code = text(payload.code, 60)
  if (status === 403) return text(payload.detail || e.message) || 'You are not a Scheduler manager, or this schedule is outside your scope.'
  if (status === 409 && code === 'owner_module_installed') return 'The module is installed again, or Core cannot tell. Reload the list.'
  if (status === 409 && code === 'active_runs') {
    const n = payload.active_runs
    return Number.isInteger(n) && n >= 1
      ? `${plural(n, 'run is', 'runs are')} queued or running. Try again when ${n === 1 ? 'it has' : 'they have'} ended.`
      : 'A run is queued or running. Try again when it has ended.'
  }
  if (status === 409) return text(payload.detail || e.message) || 'Core refused the change because the schedule is in another state. Reload the list.'
  if (status === 503 && code === 'audit_unavailable') return 'Nothing was changed because the audit row could not be written.'
  if (status === 400 && code === 'confirmation_required') return 'Core needs a Yes before it changes this. Nothing was changed.'
  if (status === 400) return text(payload.detail || e.message) || 'Core refused the request. Nothing was changed.'
  if (status === 404) return 'Core no longer has this schedule or module. Reload the list.'
  return text(e && e.message) || 'The request failed. Nothing was changed.'
}
