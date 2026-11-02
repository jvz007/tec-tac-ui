// 0.12.124 (Core 1.17.98, docs/core-github-rate-limit-optimization.txt sections 8, 10, 11, 13, 19 and 20): the GitHub
// side of the System Updates page. Pure helpers, so the page and the tests share one set of rules and words.
// - The page asks with refresh=none, branch, release or all, never force.
// - "Checked N seconds ago" comes from the answer (checked_at), or for a branch from the time this page got an answer
//   that Core says was a real check. Core 1.17.98 sends no check time for a branch head.
// - The GitHub API line shows only limit, remaining, reset time and the authenticated flag. Nothing else is read,
//   so a token can never reach the page from here.

export const ONLINE_REFRESH_SCOPES = Object.freeze(['none', 'branch', 'release', 'all'])
export const RATE_LIMIT_CODE = 'github_rate_limit_exceeded'
export const STALE_CANDIDATE_CODE = 'stale_candidate'

const SHA40 = /^[0-9a-f]{40}$/i

function defaultFormat(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value ?? '') : date.toLocaleString()
}

function timeOf(value) {
  if (value === null || value === undefined || value === '') return null
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

// "Checked 8 seconds ago", "Checked 3 minutes ago". Older than a day: the date itself. A time in the future (clock
// drift between browser and server) reads as just now.
export function checkedAgo(value, now = Date.now(), { format = defaultFormat } = {}) {
  const at = timeOf(value)
  if (at === null) return ''
  const seconds = Math.max(0, Math.floor((Number(now) - at) / 1000))
  if (seconds < 1) return 'Checked just now'
  if (seconds < 60) return `Checked ${plural(seconds, 'second')} ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Checked ${plural(minutes, 'minute')} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Checked ${plural(hours, 'hour')} ago`
  return `Checked ${format(new Date(at))}`
}

// A real check: Core sent a request, or another request did moments ago. An older Core sends no refresh object, so
// every answer counts, as before.
export function isNewCheck(result) {
  const refresh = result && typeof result === 'object' ? result.refresh : null
  if (!refresh || typeof refresh !== 'object') return Boolean(result)
  return refresh.network_request === true || refresh.reason === 'refreshed_by_another_request'
}

// The Last checked text for one card. kind is the discovered kind ('release', 'branch' or 'none').
export function checkedText({ kind, result, localAt = null, now = Date.now(), format = defaultFormat } = {}) {
  if (kind === 'branch') {
    if (localAt) return checkedAgo(localAt, now, { format })
    const reason = result?.refresh?.reason
    const head = result?.branch?.head_commit
    if (!head) return 'Never'
    if (reason === 'recently_refreshed') return 'Checked less than 20 seconds ago'
    if (reason === 'cache_fresh') return 'Saved check, less than 5 minutes old'
    return 'Saved check'
  }
  const at = result?.checked_at
  if (!at) return 'Never'
  return checkedAgo(at, now, { format }) || String(at)
}

// A short line under the buttons after a Refresh press, only when Core did not ask GitHub. Null otherwise.
export function refreshNotice(result) {
  const refresh = result && typeof result === 'object' ? result.refresh : null
  if (!refresh || typeof refresh !== 'object' || refresh.requested === 'none' || !refresh.requested) return null
  if (refresh.reason === 'recently_refreshed') return 'Checked moments ago, so this is that result. GitHub was not asked again.'
  if (refresh.reason === 'refreshed_by_another_request') return 'Another check finished moments ago. This is its result.'
  return null
}

function numberText(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n).toLocaleString('en-US') : null
}

// The GitHub API line: "43 / 60 remaining", "Resets 09:29", Authenticated or Unauthenticated. Null when Core has
// seen no GitHub answer yet.
export function rateLimitView(telemetry, { format = defaultFormat } = {}) {
  if (!telemetry || typeof telemetry !== 'object') return null
  const remaining = numberText(telemetry.remaining)
  const limit = numberText(telemetry.limit)
  const resetAt = timeOf(telemetry.reset_at)
  return {
    remaining: remaining ?? 'unknown',
    limit: limit ?? 'unknown',
    countText: remaining !== null && limit !== null ? `${remaining} / ${limit} remaining` : 'Remaining requests not reported',
    resetText: resetAt === null ? '' : `Resets ${format(new Date(resetAt))}`,
    authenticated: telemetry.authenticated === true,
    authLabel: telemetry.authenticated === true ? 'Authenticated' : 'Unauthenticated',
    limited: telemetry.limited === true || Number(telemetry.remaining) === 0,
  }
}

// The newest of several telemetry copies (the status answer and each online answer), by observed_at.
export function latestTelemetry(...copies) {
  let best = null
  let bestAt = -Infinity
  for (const copy of copies) {
    if (!copy || typeof copy !== 'object') continue
    const at = timeOf(copy.observed_at) ?? -1
    if (best === null || at > bestAt) { best = copy; bestAt = at }
  }
  return best
}

function limitInfo(value) {
  if (!value || typeof value !== 'object' || value.code !== RATE_LIMIT_CODE) return null
  return {
    code: RATE_LIMIT_CODE,
    reset_at: typeof value.reset_at === 'string' ? value.reset_at : null,
    cached_data_available: value.cached_data_available === true,
  }
}

// HTTP 200 with the saved answer and github_rate_limit_error.
export function rateLimitFromResult(result) {
  return limitInfo(result && typeof result === 'object' ? result.github_rate_limit_error : null)
}

// HTTP 429 from the online check, the branch list or the stage route (nothing saved to show).
export function rateLimitFromError(error) {
  if (!error || Number(error.status) !== 429) return null
  return limitInfo(error.payload)
}

// True while GitHub's reset time is still ahead. Core sends nothing before it, so the page does not ask either.
export function rateLimitActive(info, now = Date.now()) {
  const reset = timeOf(info?.reset_at)
  return reset !== null && reset > Number(now)
}

// The calm warning shown on the card. Never retried automatically.
export function rateLimitWarning(info, now = Date.now(), { format = defaultFormat } = {}) {
  if (!info) return ''
  const reset = timeOf(info.reset_at)
  const shown = info.cached_data_available
    ? ' The last saved result is shown and marked stale.'
    : ' There is no saved result to show yet.'
  if (reset === null) return `GitHub's request limit for this server is used up, and GitHub did not say when it resets.${shown} Try Refresh again later.`
  if (reset <= Number(now)) return `GitHub's request limit reset at ${format(new Date(reset))}.${shown} Use Refresh to check again.`
  return `GitHub's request limit for this server is used up until ${format(new Date(reset))}.${shown} The page will not ask GitHub again before then.`
}

// The commit shown to the operator, as Core accepts it in the stage body: 40 hex characters, lower case. Else null.
export function pinnedCommit(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return SHA40.test(text) ? text.toLowerCase() : null
}

export function isStaleCandidate(error) {
  if (!error || Number(error.status) !== 409) return false
  return error.code === STALE_CANDIDATE_CODE || error.payload?.code === STALE_CANDIDATE_CODE
}

export function staleCandidateMessage(sourceType) {
  if (sourceType === 'branch') {
    return 'The branch moved after your last check, so nothing was downloaded. Refresh the check, look at the new commit, then download again.'
  }
  return 'The stable release changed after your last check, so nothing was downloaded. Refresh the check, look at the new release, then download again.'
}
