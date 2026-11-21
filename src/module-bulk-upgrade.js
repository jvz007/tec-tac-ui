// 0.13.1 (Core 1.18.35): select several modules in the Online catalog and upgrade them in one run. This file holds the pure
// parts: which rows can be ticked, the selection, the view models for the plan and the progress, and the error sentences.
// Core plans again on every call and does the work; the browser never sends an order or a version. Everything that comes from
// Core is text only. Nothing is kept in browser storage.
import { blockedReasonText, updateBlocked } from './module-updates.js'
import { isLicensingSource } from './module-repository-info.js'

export const BULK_PURPOSE = 'upgrade'
export const FINAL_RUN_STATUSES = Object.freeze(['completed', 'stopped', 'interrupted'])
export const RUN_POLL_MS = 3000
export const MODULE_STATES = Object.freeze(['pending', 'downloading', 'installing', 'succeeded', 'failed', 'skipped'])
const MAX_TEXT = 500

const text = (value, fallback = '') => {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s) return fallback
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s
}

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

export function upgradeSelectedDisabled({ count, canManage, jobRunning, inspecting, staged, runActive, busy }) {
  return !(count > 0) || !canManage || !!jobRunning || !!inspecting || !!staged || !!runActive || !!busy
}

// The request bodies. Exactly these keys: no order, no version, no licence override, no disable_replaced.
export function planBody(ids) { return { modules: [...ids], purpose: BULK_PURPOSE } }
export function installBody(ids) { return { modules: [...ids], purpose: BULK_PURPOSE } }

// The ids Core will run: the plan's order that were selected. Blocked ones are not in order, so they are never sent.
export function runnableIds(plan, selected) {
  const picked = new Set(selected || [])
  const seen = new Set()
  const out = []
  for (const step of Array.isArray(plan?.order) ? plan.order : []) {
    const id = step?.id
    if (typeof id === 'string' && picked.has(id) && !seen.has(id)) { seen.add(id); out.push(id) }
  }
  return out
}

// A plan view model. canStart is false when Core said ok:false, nothing can run, or the run would switch modules off
// (Core refuses that in a run): no Yes button then.
export function planView(plan, selected = []) {
  const p = plan && typeof plan === 'object' ? plan : {}
  const order = (Array.isArray(p.order) ? p.order : []).filter((s) => s && typeof s.id === 'string').map((s) => ({
    id: s.id,
    name: text(s.name, s.id),
    from: text(s.current_version),
    to: text(s.version),
    action: text(s.action),
    added: s.added === true,
  }))
  const blocked = (Array.isArray(p.blocked) ? p.blocked : []).map((b) => ({
    id: text(b?.id),
    name: text(b?.name) || text(b?.id, 'Module'),
    message: text(b?.message, 'Core will not run this one.'),
  }))
  const conflicts = (Array.isArray(p.conflicts) ? p.conflicts : []).map((c) => text(c?.message)).filter(Boolean)
  const willDisable = (Array.isArray(p.will_disable) ? p.will_disable : []).map((d) => text(typeof d === 'string' ? d : d?.name || d?.id)).filter(Boolean)
  const refused = p.ok === false
  const ids = runnableIds(p, selected)
  const canStart = !refused && ids.length > 0 && willDisable.length === 0
  return {
    refused,
    message: refused ? text(p.message, 'Core did not accept this plan.') : '',
    order, blocked, conflicts, willDisable,
    runnable: ids,
    canStart,
    empty: !refused && order.length === 0,
  }
}

export function confirmOptions(count, blockedCount) {
  return {
    question: `Upgrade ${count} module${count === 1 ? '' : 's'} now? Core upgrades them one after the other, in the order shown.`,
    detail: blockedCount > 0 ? `${blockedCount} blocked module${blockedCount === 1 ? '' : 's'} will not run.` : '',
  }
}

// Turns a failed call into what the page does. kind: 'follow' (409 with a run id), 'stopped-done' (409 already_finished),
// or 'message' (show Core's sentence as text).
export function bulkError(error, fallback = 'Core could not answer. Try again.') {
  const status = Number(error?.status) || 0
  const payload = error?.payload && typeof error.payload === 'object' ? error.payload : {}
  const message = text(payload.message) || text(payload.detail) || text(error?.message, fallback)
  if (status === 409 && payload.state === 'run_in_progress' && typeof payload.run_id === 'string' && payload.run_id) return { kind: 'follow', runId: payload.run_id, message: 'Another upgrade run is going. Following it.' }
  if (status === 409 && payload.state === 'already_finished') return { kind: 'stopped-done', message }
  if (status === 403) return { kind: 'message', message: text(payload.detail, 'You need module management rights.') }
  return { kind: 'message', message }
}

// The progress view model.
export function runView(run) {
  const r = run && typeof run === 'object' ? run : {}
  const counts = r.counts && typeof r.counts === 'object' ? r.counts : {}
  const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0)
  const modules = (Array.isArray(r.modules) ? r.modules : []).filter((m) => m && typeof m.id === 'string').map((m) => {
    const state = MODULE_STATES.includes(m.state) ? m.state : 'pending'
    const from = text(m.current_version)
    const to = text(m.version)
    return {
      id: m.id,
      name: text(m.name, m.id),
      state,
      change: from && to ? `${from} → ${to}` : to || from || '',
      reason: state === 'failed' || state === 'skipped' ? text(m.reason?.message) : '',
      tone: state === 'succeeded' ? 'ok' : state === 'failed' ? 'danger' : state === 'skipped' ? 'warn' : '',
    }
  })
  const status = text(r.status, 'running')
  const final = FINAL_RUN_STATUSES.includes(status)
  return {
    runId: typeof r.run_id === 'string' ? r.run_id : '',
    status,
    final,
    stopping: status === 'stopping' || (r.stop_requested === true && !final),
    counts: { total: num(counts.total), succeeded: num(counts.succeeded), failed: num(counts.failed), skipped: num(counts.skipped) },
    modules,
    anySucceeded: modules.some((m) => m.state === 'succeeded') || num(counts.succeeded) > 0,
  }
}

// The poll loop. fetchRun(runId) returns Core's body. onRun(view) gets every current answer; onFinal(view) once at the end;
// onError(error) for a failed poll (the loop goes on). schedule and cancel are setTimeout and clearTimeout, replaceable in
// tests. A late answer from an older poll is dropped by the gate. stop() clears the timer and ends the loop.
export function createRunPoller({ fetchRun, onRun, onFinal, onError, gate, schedule = setTimeout, cancel = clearTimeout, intervalMs = RUN_POLL_MS }) {
  let timer = null
  let stopped = true
  let runId = ''
  const tick = async (token) => {
    timer = null
    if (stopped) return
    let raw
    try {
      raw = await fetchRun(runId)
    } catch (e) {
      if (stopped || !gate.isCurrent(token)) return
      onError?.(e)
      timer = schedule(() => tick(token), intervalMs)
      return
    }
    if (stopped || !gate.isCurrent(token)) return
    const view = runView(raw)
    onRun?.(view)
    if (view.final) { stopped = true; onFinal?.(view); return }
    timer = schedule(() => tick(token), intervalMs)
  }
  return {
    start(id) {
      this.stop()
      stopped = false
      runId = id
      void tick(gate.begin())
    },
    stop() {
      stopped = true
      gate.begin()
      if (timer !== null) cancel(timer)
      timer = null
    },
    get active() { return !stopped },
  }
}
