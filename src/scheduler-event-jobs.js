// 0.12.118: the event jobs panel on Scheduler Configuration (Core 1.17.45, docs/event-jobs.md). Read only. Core's route returns
// counts, ages and the last error: never a payload, a key or a row id, and this file reads only those fields. Pure except the
// loader, which takes the api function so a test can pass its own.
import { apiFetch } from './api.js'

export const EVENT_JOBS_PATH = '/api/tfd/scheduler/event-jobs/'

const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0)
const text = (value, max = 300) => (typeof value === 'string' ? value.slice(0, max) : '')

// 'about 5 minutes'. null (nothing is pending) is a dash.
export function ageText(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return 'less than a minute'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.round(seconds / 3600)
  if (hours < 48) return `about ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(seconds / 86400)
  return `about ${days} days`
}

export function eventJobRows(payload) {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : []
  return jobs.map((job) => ({
    uid: `${text(job?.module_id, 120)}:${text(job?.job_id, 120)}`,
    module: text(job?.module_id, 120),
    label: text(job?.label, 120) || text(job?.job_id, 120),
    registered: job?.registered !== false,
    pending: count(job?.pending),
    running: count(job?.running),
    oldestPending: ageText(job?.oldest_pending_age_seconds),
    published: count(job?.published),
    dropped: count(job?.dropped),
    failed: count(job?.failed),
    expired: count(job?.expired),
    lastFailureAt: text(job?.last_failure_at, 60),
    lastError: text(job?.last_error),
  })).filter((row) => row.module || row.label)
}

// Summary tiles from the additive event_jobs block of the health answer. An older Core sends none: no tiles.
export function eventJobTiles(health) {
  const block = health && typeof health === 'object' ? health.event_jobs : null
  if (!block || typeof block !== 'object') return null
  return [
    { key: 'registered', label: 'Event jobs', value: String(count(block.registered)), note: 'registered' },
    { key: 'pending', label: 'Pending', value: String(count(block.pending)), note: `${count(block.running)} running` },
    { key: 'failed', label: 'Failed', value: String(count(block.failed_last_24h)), note: 'in the last 24 hours' },
    { key: 'dropped', label: 'Dropped', value: String(count(block.dropped_last_24h)), note: 'in the last 24 hours' },
    { key: 'oldest', label: 'Oldest pending', value: ageText(block.oldest_pending_age_seconds), note: 'waiting to start' },
  ]
}

// { rows } for the panel, or { hidden: true } on 403 (no server maintenance authority) and 404 (an older Core).
export async function loadEventJobs({ api = apiFetch } = {}) {
  try {
    return { rows: eventJobRows(await api(EVENT_JOBS_PATH)) }
  } catch (error) {
    if (error?.status === 403 || error?.status === 404) return { hidden: true }
    throw error
  }
}
