// Background job follow (0.12.103). A module hands the shell a read route and a rule for "finished". The shell polls it, so the
// follow keeps running after the person leaves the module's page, and tells the person through the module's own notifications.
// It only reads. The backend decides everything (AD-12); a hidden or refused button is never the check.
//
// createJobFollowService() is shared. forModule(moduleId, { api, notifications, isAbandoned }) binds one copy to one module:
// its own id, its own guarded api (so the tactical-operations and other-module path guards still apply) and its own
// notifications. The module loader does the binding and calls clear() when the module is unloaded.

const DEFAULT_INTERVAL_MS = 5000
const MIN_INTERVAL_MS = 2000
const MAX_INTERVAL_MS = 60000
const MIN_TIME_LIMIT_MS = 10000
const MAX_TIME_LIMIT_MS = 1800000
const PER_MODULE_LIMIT = 10
const GLOBAL_LIMIT = 50
const FAILED_READS_BEFORE_STOP = 3
const MAX_ID = 100

function refuse(message) {
  return Object.assign(new Error(message), { status: 0, payload: null, code: null })
}

function clamp(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function messageText(source, payload, fallback) {
  try {
    const value = typeof source === 'function' ? source(payload) : source
    const text = String(value ?? '').trim()
    if (text) return text.slice(0, 1000)
  } catch {
    // A message function that throws falls back to the plain text.
  }
  return fallback
}

export function createJobFollowService({ isSignedOut, isTrustedContext, setTimer, clearTimer } = {}) {
  const startTimer = typeof setTimer === 'function' ? setTimer : (fn, ms) => globalThis.setTimeout(fn, ms)
  const stopTimer = typeof clearTimer === 'function' ? clearTimer : (handle) => globalThis.clearTimeout(handle)
  // key = `${moduleId}\u0000${id}`; value = the live follow.
  const live = new Map()

  const signedOut = () => {
    try { return typeof isSignedOut === 'function' && isSignedOut() === true } catch { return false }
  }
  const trusted = () => {
    try { return typeof isTrustedContext === 'function' ? isTrustedContext() === true : true } catch { return false }
  }

  function stopEntry(entry) {
    if (!entry || entry.stopped) return
    entry.stopped = true
    if (entry.pollTimer != null) stopTimer(entry.pollTimer)
    if (entry.limitTimer != null) stopTimer(entry.limitTimer)
    entry.pollTimer = null
    entry.limitTimer = null
    if (live.get(entry.key) === entry) live.delete(entry.key)
  }

  function stopModule(moduleId) {
    for (const entry of [...live.values()]) if (entry.moduleId === moduleId) stopEntry(entry)
  }

  function stopAll() {
    for (const entry of [...live.values()]) stopEntry(entry)
  }

  function countFor(moduleId) {
    let count = 0
    for (const entry of live.values()) if (entry.moduleId === moduleId) count += 1
    return count
  }

  function notify(entry, level, text) {
    try {
      entry.notifications?.[level]?.(text, { dedupeKey: `job-follow:${entry.id}`, title: entry.title })
    } catch (error) {
      console.warn('[TEC-TAC-UI] A job-follow notice could not be shown.', error)
    }
  }

  function schedulePoll(entry) {
    if (entry.stopped) return
    entry.pollTimer = startTimer(() => { void poll(entry) }, entry.intervalMs)
  }

  async function poll(entry) {
    entry.pollTimer = null
    if (entry.stopped) return
    if (signedOut() || entry.isAbandoned()) { stopEntry(entry); return }
    let payload
    try {
      payload = await entry.api(entry.path)
    } catch (error) {
      if (entry.stopped) return
      if (signedOut() || Number(error?.status) === 401) { stopEntry(entry); return }
      entry.failedReads += 1
      if (entry.failedReads >= FAILED_READS_BEFORE_STOP) {
        stopEntry(entry)
        notify(entry, 'error', `We could not check "${entry.title}" ${FAILED_READS_BEFORE_STOP} times in a row, so we stopped watching it. Open its page to see where it stands.`)
        return
      }
      schedulePoll(entry)
      return
    }
    if (entry.stopped) return
    if (signedOut()) { stopEntry(entry); return }
    let verdict = false
    try {
      verdict = entry.check(payload)
    } catch {
      // A check that throws counts as a failed read, not as a verdict.
      entry.failedReads += 1
      if (entry.failedReads >= FAILED_READS_BEFORE_STOP) {
        stopEntry(entry)
        notify(entry, 'error', `We could not read the result of "${entry.title}", so we stopped watching it. Open its page to see where it stands.`)
        return
      }
      schedulePoll(entry)
      return
    }
    entry.failedReads = 0
    if (verdict === 'success') {
      stopEntry(entry)
      notify(entry, 'success', messageText(entry.successMessage, payload, `${entry.title} finished.`))
      return
    }
    if (verdict === 'error') {
      stopEntry(entry)
      notify(entry, 'error', messageText(entry.errorMessage, payload, `${entry.title} did not finish. Open its page for the details.`))
      return
    }
    schedulePoll(entry)
  }

  function forModule(moduleId, { api, notifications, isAbandoned } = {}) {
    const moduleKey = String(moduleId || '').trim()
    if (!moduleKey) throw new Error('module ID is required for jobs')
    const abandoned = () => (typeof isAbandoned === 'function' ? isAbandoned() === true : false)
    let shut = false

    function follow(descriptor) {
      if (shut) throw refuse(`module ${moduleKey} was unloaded; jobs.follow() is refused`)
      if (abandoned()) throw refuse(`module ${moduleKey} was abandoned after a failed or timed-out register(); jobs.follow() is refused`)
      if (signedOut()) throw refuse('You are signed out, so nothing can be followed.')
      if (!trusted()) throw refuse('Jobs can be followed only after Core has sent your access. Reload the page and try again.')
      if (typeof api !== 'function') throw refuse('This module has no way to read a job.')
      const source = descriptor && typeof descriptor === 'object' ? descriptor : null
      if (!source) throw refuse('jobs.follow needs a descriptor.')
      const id = String(source.id ?? '').trim()
      if (!id || id.length > MAX_ID) throw refuse(`jobs.follow needs an id of 1 to ${MAX_ID} characters.`)
      const title = String(source.title ?? '').trim().slice(0, 120)
      if (!title) throw refuse('jobs.follow needs a title.')
      const path = typeof source.path === 'string' ? source.path.trim() : ''
      if (!path.startsWith('/')) throw refuse("jobs.follow needs a path that starts with '/'.")
      if (typeof source.check !== 'function') throw refuse('jobs.follow needs a check(payload) function.')
      if (source.timeLimitMs === undefined || source.timeLimitMs === null || !Number.isFinite(Number(source.timeLimitMs))) {
        throw refuse('jobs.follow needs a timeLimitMs.')
      }

      const key = `${moduleKey}\u0000${id}`
      const replaced = live.get(key)
      if (!replaced) {
        if (countFor(moduleKey) >= PER_MODULE_LIMIT) {
          throw refuse(`Module "${moduleKey}" is already following ${PER_MODULE_LIMIT} jobs. Wait for one to finish and try again.`)
        }
        if (live.size >= GLOBAL_LIMIT) {
          throw refuse(`Tec-Tac is already following ${GLOBAL_LIMIT} jobs. Wait for one to finish and try again.`)
        }
      }
      if (replaced) stopEntry(replaced)

      const entry = {
        key,
        moduleId: moduleKey,
        id,
        title,
        path,
        check: source.check,
        successMessage: source.successMessage,
        errorMessage: source.errorMessage,
        intervalMs: clamp(source.intervalMs, MIN_INTERVAL_MS, MAX_INTERVAL_MS, DEFAULT_INTERVAL_MS),
        api,
        notifications,
        isAbandoned: abandoned,
        failedReads: 0,
        stopped: false,
        pollTimer: null,
        limitTimer: null,
      }
      const timeLimitMs = clamp(source.timeLimitMs, MIN_TIME_LIMIT_MS, MAX_TIME_LIMIT_MS, MIN_TIME_LIMIT_MS)
      live.set(key, entry)
      entry.limitTimer = startTimer(() => {
        if (entry.stopped) return
        stopEntry(entry)
        if (signedOut() || abandoned()) return
        notify(entry, 'warning', messageText(source.timeoutMessage, null, `"${title}" has not finished yet. Open its page to see where it stands.`))
      }, timeLimitMs)
      schedulePoll(entry)
      return Object.freeze({ id, cancel: () => stopEntry(entry) })
    }

    // Stops this module's follows and refuses any later one. Called by the module's cleanup.
    function clear() {
      shut = true
      stopModule(moduleKey)
    }

    return Object.freeze({ follow, clear })
  }

  return Object.freeze({ forModule, stopAll, count: () => live.size })
}
