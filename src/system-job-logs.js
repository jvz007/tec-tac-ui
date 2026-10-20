// 0.12.119 (Q83): access to the System Updates and server-maintenance job logs from the Module Manager History tab and from the
// System Updates page. Pure logic, no Vue and no DOM. The three logs are not merged: each source keeps its own list and its own
// log. Everything here turns Core's answer into plain text and small rows; nothing is markup and no path or token is built.
import { NO_RIGHTS_TEXT, statusTone, statusWord } from './module-job-history.js'

export const LOG_SOURCES = Object.freeze([
  { key: 'module', label: 'Module and hotfix jobs' },
  { key: 'system-update', label: 'System updates' },
  { key: 'maintenance', label: 'Server maintenance' },
])
export const DOWNLOAD_UNAVAILABLE_TEXT = 'Core does not offer a download for this log yet'
export const LAST_LINES_TEXT = 'Showing the last 80 lines'
export const CUT_LOG_TEXT = 'Core kept only the end of this log. The start was left out.'
export const GONE_LOG_TEXT = 'Core no longer holds this log'
export const NO_LOG_YET_TEXT = 'Core kept no log text for this job.'

const clean = (value) => (typeof value === 'string' ? value : '')
const stamp = (value) => (typeof value === 'string' ? value : '')

// One finished System Updates job (status.history of GET /api/tfd/system/updates/) as a History row.
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
    hasLog: Boolean(clean(job.id)),
    warning: '',
    moduleIds: [component],
    switchSource: {},
    startedAt: stamp(job.started_at),
    finishedAt: stamp(job.finished_at),
    detailRows: [['Component', component], ['Versions', versions], ['Status', statusWord(job.status)], ['Requested by', clean(job.requested_by) || '—'], ['Started', stamp(job.started_at)], ['Finished', stamp(job.finished_at)]],
  }
}

export function systemUpdateRows(status) {
  const list = Array.isArray(status?.history) ? status.history : []
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

// The System Updates log: Core keeps the last 80 lines (log_tail). Text only.
export function systemUpdateLog(job) {
  const lines = Array.isArray(job?.log_tail) ? job.log_tail.filter((line) => typeof line === 'string') : []
  return { text: lines.join('\n'), truncated: false, note: LAST_LINES_TEXT, empty: lines.length === 0 }
}

function outputText(block) {
  return block && typeof block === 'object' && typeof block.text === 'string' ? block.text : ''
}
const outputCut = (block) => Boolean(block && typeof block === 'object' && block.truncated === true)

// The server-maintenance log: the log, stdout and stderr texts Core returns, each under a plain heading, empty ones left out.
// Core's own truncated flag decides whether the cut note shows.
export function maintenanceLog(job) {
  const parts = [['Log', job?.logs], ['Output', job?.stdout], ['Errors', job?.stderr]]
  const shown = parts.filter(([, block]) => outputText(block).trim() !== '')
  const text = shown.length === 1 ? outputText(shown[0][1]) : shown.map(([title, block]) => `--- ${title} ---\n${outputText(block)}`).join('\n')
  return { text, truncated: parts.some(([, block]) => outputCut(block)), note: '', empty: shown.length === 0 }
}

// Plain sentences for a refused read. A System Updates row from Core's history folder can answer 404: it is shown once, never retried.
export function systemLogErrorSentence(error, source) {
  const status = Number(error?.status)
  if (status === 403) return NO_RIGHTS_TEXT
  if (status === 404) return source === 'system-update' ? GONE_LOG_TEXT : (clean(error?.payload?.detail) || GONE_LOG_TEXT)
  return clean(error?.message) || 'The log could not be read.'
}

export const sourceLabel = (key) => (LOG_SOURCES.find((item) => item.key === key) || LOG_SOURCES[0]).label
