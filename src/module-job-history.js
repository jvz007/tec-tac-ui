// 0.12.118: the Module Manager History tab (Core 1.17.60, docs/module-job-logs.md). Pure logic, no Vue and no DOM, so node can test
// it. The History list comes from GET /api/tfd/modules/v2/jobs/history/. A row carries no log text and no path, and this file
// never builds one. The full log is read as text from GET .../jobs/<id>/log/ and is only ever shown as text.

export const HISTORY_PAGE_SIZE = 50
export const HISTORY_PAGE_SIZE_MAX = 100
// A log above this is cut by Core to its start and its end (5 MiB). The UI says so beside Open.
export const LOG_WARN_BYTES = 5 * 1024 * 1024
export const TRUNCATED_LINE = 'This log is long. The start and the end are shown; the middle was left out.'
export const NO_LOG_TEXT = 'No log was kept'
export const NO_RIGHTS_TEXT = 'You need module management rights to see this'
export const NOT_RECORDED_TEXT = 'Core could not record this read, so the log was not shown.'
export const MISSING_LOG_TEXT = 'No log was kept for this job.'

const STATUS_WORDS = Object.freeze({
  queued: 'Waiting to start',
  dispatched: 'Starting',
  running: 'Running',
  succeeded: 'Done',
  failed: 'Failed',
  dispatch_failed: 'Could not start',
})
const STATUS_TONES = Object.freeze({ succeeded: 'ok', failed: 'danger', dispatch_failed: 'danger', queued: 'warn', dispatched: 'warn', running: 'warn' })

// A plain word for the status. A word this UI does not know is shown as Core sent it.
export function statusWord(status) {
  const key = typeof status === 'string' ? status : ''
  return Object.prototype.hasOwnProperty.call(STATUS_WORDS, key) ? STATUS_WORDS[key] : (key || '—')
}
export function statusTone(status) {
  const key = typeof status === 'string' ? status : ''
  return Object.prototype.hasOwnProperty.call(STATUS_TONES, key) ? STATUS_TONES[key] : ''
}

const wholeNumber = (value, fallback, { min = 1, max = Infinity } = {}) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

const clean = (value) => (typeof value === 'string' ? value : '')
const sentenceCase = (word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).replace(/[-_]/g, ' ') : '—')

// 'module version' for each module the job names. A job with no versions lists the ids only.
export function modulesLabel(job) {
  const ids = Array.isArray(job?.module_ids) ? job.module_ids.filter((id) => typeof id === 'string' && id) : []
  const versions = job?.versions && typeof job.versions === 'object' ? job.versions : {}
  const list = ids.map((id) => (typeof versions[id] === 'string' && versions[id] ? `${id} ${versions[id]}` : id))
  return list.join(', ') || '—'
}

// The action in words. A rename is shown from renamed_from; a replacement switch says so.
export function actionLabel(job) {
  const action = clean(job?.action)
  const renamed = clean(job?.renamed_from)
  if (renamed) {
    const to = Array.isArray(job?.module_ids) ? job.module_ids.find((id) => typeof id === 'string' && id) : ''
    return to ? `Rename ${renamed} to ${to}` : `Rename from ${renamed}`
  }
  if (job?.switch === true) return `${sentenceCase(action)} (replacement switch)`
  return sentenceCase(action)
}

// A short size for the warning: 'about 7.4 MB'.
export function megabytes(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n < 0) return ''
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
// The plain line beside Open for a log above 5 MiB. Nothing is asked: it is a line, not a confirmation.
export function sizeWarning(job) {
  const bytes = Number(job?.log_bytes)
  if (job?.has_log !== true || !Number.isFinite(bytes) || bytes <= LOG_WARN_BYTES) return ''
  return `This log is about ${megabytes(bytes).replace(/\.0 MB$/, ' MB')}. Core shows the start and the end.`
}

// The row the table draws. Only these fields are read, so a stray field on a row (a log, a path) never reaches the page.
export function historyRow(job) {
  const row = job && typeof job === 'object' ? job : {}
  return {
    id: clean(row.id),
    kind: row.kind === 'hotfix' ? 'hotfix' : 'module',
    createdAt: clean(row.created_at),
    modules: modulesLabel(row),
    action: actionLabel(row),
    actionKey: clean(row.action),
    requestedBy: clean(row.requested_by) || '—',
    status: clean(row.status),
    statusWord: statusWord(row.status),
    statusTone: statusTone(row.status),
    stage: clean(row.stage) || '—',
    error: clean(row.error),
    hasLog: row.has_log === true,
    logBytes: Number.isFinite(Number(row.log_bytes)) ? Number(row.log_bytes) : 0,
    warning: sizeWarning(row),
    moduleIds: Array.isArray(row.module_ids) ? row.module_ids.filter((id) => typeof id === 'string') : [],
    versions: row.versions && typeof row.versions === 'object' ? row.versions : null,
    // The lists a replacement switch moved; the page turns them into lines with jobSwitchLines (module-replacement.js).
    switchSource: { disabled_modules: row.disabled_modules, enabled_modules: row.enabled_modules, reconciled_modules: row.reconciled_modules },
    startedAt: clean(row.started_at),
    finishedAt: clean(row.finished_at),
  }
}

export function historyRows(payload) {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : []
  return jobs.map(historyRow).filter((row) => row.id)
}

export function historyMeta(payload, requestedPage = 1) {
  return {
    page: wholeNumber(payload?.page, requestedPage),
    pages: wholeNumber(payload?.pages, 0, { min: 0 }),
    total: wholeNumber(payload?.total ?? payload?.count, 0, { min: 0 }),
  }
}

// Core's marker line between the start and the end of a cut log.
const MARKER = /^\[\.\.\. \d+ bytes were left out of the middle of this log \.\.\.\]$/m
export function hasTruncationMarker(text) {
  return typeof text === 'string' && MARKER.test(text)
}

// Whether the log was cut. The header is the answer when the browser can read it. A cross-origin API without
// Access-Control-Expose-Headers hides it (get() gives null); then Core's marker line is the evidence.
export function truncationState(headers, text) {
  let header = null
  try { header = typeof headers?.get === 'function' ? headers.get('X-Tec-Tac-Log-Truncated') : null } catch { header = null }
  if (header === 'true') return { truncated: true, source: 'header' }
  if (header === 'false') return { truncated: false, source: 'header' }
  return { truncated: hasTruncationMarker(text), source: 'marker' }
}

// The file name from Content-Disposition when the browser can read it, kept to a-z, 0-9, dot, dash and underscore.
export function dispositionFileName(headers) {
  let value = null
  try { value = typeof headers?.get === 'function' ? headers.get('Content-Disposition') : null } catch { value = null }
  if (typeof value !== 'string') return ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(value)
  if (!match) return ''
  const name = match[1].replace(/[^A-Za-z0-9._-]/g, '').slice(0, 120)
  return /\.log$/i.test(name) ? name : ''
}

const part = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)
// module-job-<module>-<action>-<date>.log with the same a-z, 0-9 and - rule Core uses.
export function downloadFileName(job, now = new Date()) {
  const module = part(Array.isArray(job?.moduleIds) ? job.moduleIds[0] : (Array.isArray(job?.module_ids) ? job.module_ids[0] : '')) || 'module'
  const action = part(job?.actionKey || job?.action) || 'job'
  const date = (now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date()).toISOString().slice(0, 10)
  return `module-job-${module}-${action}-${date}.log`
}

// Plain sentences for a refused log read. Core's own sentence for 404 and 400.
export function logErrorSentence(error) {
  const status = Number(error?.status)
  if (status === 403) return NO_RIGHTS_TEXT
  if (status === 404) return clean(error?.payload?.detail) || MISSING_LOG_TEXT
  if (status === 503) return NOT_RECORDED_TEXT
  return clean(error?.message) || 'The log could not be read.'
}
export function historyErrorSentence(error) {
  const status = Number(error?.status)
  if (status === 403) return NO_RIGHTS_TEXT
  return clean(error?.message) || 'Unable to load module history.'
}

// Reads one job's log through the api transport (apiRaw, so the headers are readable). The token travels only in the
// Authorization header that apiRaw sets; no URL here has a token. Returns { text, truncated, source, bytes } or throws.
export async function readJobLog(jobId, { apiRaw, download = false } = {}) {
  const query = download ? '?download=1' : ''
  const response = await apiRaw(`/api/tfd/modules/v2/jobs/${encodeURIComponent(jobId)}/log/${query}`, { headers: { Accept: 'text/plain' } })
  return response
}

// The log window's state from a response. The text stays a string for textContent.
export async function logFromResponse(response) {
  const text = await response.text()
  const state = truncationState(response.headers, text)
  let bytes = null
  try {
    const raw = response.headers?.get?.('X-Tec-Tac-Log-Bytes')
    const n = Number(raw)
    bytes = raw !== null && raw !== undefined && Number.isFinite(n) ? n : null
  } catch { bytes = null }
  return { text, truncated: state.truncated, source: state.source, bytes }
}
