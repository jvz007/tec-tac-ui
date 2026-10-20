// 0.12.119 (Q83): access to the System Updates and server-maintenance job logs from the Module Manager History tab and from the
// System Updates page. Pure logic, no Vue and no DOM. The three logs are not merged: each source keeps its own list and its own
// log. Everything here turns Core's answer into plain text and small rows; nothing is markup and no path or token is built.
import { NOT_RECORDED_TEXT, NO_RIGHTS_TEXT, statusTone, statusWord } from './module-job-history.js'

export const LOG_SOURCES = Object.freeze([
  { key: 'module', label: 'Module and hotfix jobs' },
  { key: 'system-update', label: 'System updates' },
  { key: 'maintenance', label: 'Server maintenance' },
])
export const GONE_LOG_TEXT = 'Core no longer holds this log'
export const NO_LOG_YET_TEXT = 'Core kept no log text for this job.'

const clean = (value) => (typeof value === 'string' ? value : '')
const stamp = (value) => (typeof value === 'string' ? value : '')

// 0.12.120 (Core 1.17.67): the logs come from Core's log routes, with Download on. A System Updates row has Download only when
// Core's has_log is true; Open stays on for any row with an id (the window can then show the reason). Not a single path or token here.
// One System Updates job (a row of GET /api/tfd/system/updates/jobs/, or status.history) as a History row.
export function systemUpdateRow(item) {
  const job = item && typeof item === 'object' ? item : {}
  const component = clean(job.component) || 'system'
  const from = clean(job.installed_version)
  const to = clean(job.version)
  const versions = from || to ? `${from || '—'} → ${to || '—'}` : '—'
  return {
    id: clean(job.id),
    source: 'system-update',
    kind: 'module',
    createdAt: stamp(job.created_at),
    modules: component,
    action: `Update ${versions}`,
    actionKey: 'system-update',
    requestedBy: clean(job.requested_by) || '—',
    status: clean(job.status),
    statusWord: statusWord(job.status),
    statusTone: statusTone(job.status),
    stage: clean(job.stage) || '—',
    error: clean(job.error),
    hasLog: job.has_log === true,
    canOpen: Boolean(clean(job.id)),
    logBytes: Number.isFinite(job.log_bytes) ? job.log_bytes : null,
    warning: '',
    moduleIds: [component],
    switchSource: {},
    startedAt: stamp(job.started_at),
    finishedAt: stamp(job.finished_at),
    detailRows: [['Component', component], ['Versions', versions], ['Status', statusWord(job.status)], ['Requested by', clean(job.requested_by) || '—'], ['Started', stamp(job.started_at)], ['Finished', stamp(job.finished_at)]],
  }
}

// payload is the list answer (jobs) or, for the older status answer, history.
export function systemUpdateRows(payload) {
  const list = Array.isArray(payload?.jobs) ? payload.jobs : (Array.isArray(payload?.history) ? payload.history : [])
  return list.map(systemUpdateRow).filter((row) => row.id)
}

// A server-maintenance job row of GET /api/tfd/system/maintenance/jobs/ (id, action, status, stage, created, finished).
export function maintenanceRow(item) {
  const job = item && typeof item === 'object' ? item : {}
  const action = clean(job.action) || 'job'
  const requestedBy = clean(job.context?.requested_by) || '—'
  const failure = clean(job.failure?.message) || clean(job.failure?.detail)
  return {
    id: clean(job.id),
    source: 'maintenance',
    kind: 'module',
    createdAt: stamp(job.created_at),
    modules: action,
    action: 'Server maintenance',
    actionKey: action,
    requestedBy,
    status: clean(job.status),
    statusWord: statusWord(job.status),
    statusTone: statusTone(job.status),
    stage: clean(job.stage) || '—',
    error: failure,
    hasLog: Boolean(clean(job.id)),
    canOpen: Boolean(clean(job.id)),
    warning: '',
    moduleIds: [],
    switchSource: {},
    startedAt: stamp(job.started_at),
    finishedAt: stamp(job.finished_at),
    detailRows: [['Action', action], ['Status', statusWord(job.status)], ['Stage', clean(job.stage) || '—'], ['Requested by', requestedBy], ['Created', stamp(job.created_at)], ['Started', stamp(job.started_at)], ['Finished', stamp(job.finished_at)]],
  }
}

export function maintenanceRows(payload) {
  const list = Array.isArray(payload?.jobs) ? payload.jobs : []
  return list.map(maintenanceRow).filter((row) => row.id)
}

const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)
// Used when the browser cannot read Content-Disposition: system-update-<component>-<date>.log or server-maintenance-<action>-<date>.log.
export function otherDownloadFileName(source, job, now = new Date()) {
  const date = (now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date()).toISOString().slice(0, 10)
  if (source === 'system-update') return `system-update-${slug(Array.isArray(job?.moduleIds) ? job.moduleIds[0] : job?.modules) || 'system'}-${date}.log`
  return `server-maintenance-${slug(job?.actionKey || job?.modules) || 'job'}-${date}.log`
}

// Plain sentences for a refused read, one read, never retried. 404 shows Core's own sentence (no_log, job_not_found).
export function systemLogErrorSentence(error, source) {
  const status = Number(error?.status)
  if (status === 403) return NO_RIGHTS_TEXT
  if (status === 404) return clean(error?.payload?.detail) || GONE_LOG_TEXT
  if (status === 503) return NOT_RECORDED_TEXT
  return clean(error?.message) || 'The log could not be read.'
}

export const sourceLabel = (key) => (LOG_SOURCES.find((item) => item.key === key) || LOG_SOURCES[0]).label
