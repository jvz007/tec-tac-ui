// 0.12.106: module user preferences (Core 1.17.35, core.module_preferences 1.0.0). A module keeps one small per-person choice
// through Core, such as a collapse control. The helper is bound to the module that receives it: the id is the loader's
// descriptor id, never an argument, so a module cannot name another module. There is no AD-20 replaced-module exception:
// a replacement keeps its own preferences. Calls go through the module's own guarded api(). Nothing is cached and nothing
// is written to browser storage. Name and value limits are checked before any request; Core stays the authority.
// The contract row ui.authenticated.modulePreferences is written by Core (reviews/requests/core.md).
// 0.12.108 (Core 1.17.38): set() and remove() on one name within 400 ms are merged into one request carrying the last
// operation, with a 2 second maximum wait so a held-down toggle still saves. Every caller of a merged write gets the same
// rejection, and a resolved value of its own call's type (0.12.109): a set() superseded by a remove() resolves undefined,
// a remove() superseded by a set() resolves false. get() and getAll() see a write that has not finished yet, so the screen and the store agree. flush() sends the
// waiting writes now. Core's 503 audit_failed and 403 module_not_allowed are refused in plain words (hideControl on 403).

// Core's limits (framwork/tec_tac/module_preferences.py): one name 1 to 64 characters, a value at most 4 KiB when stored
// and at most 5 levels deep.
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const MAX_VALUE_BYTES = 4 * 1024
const MAX_VALUE_DEPTH = 5
// 0.12.108: a write waits this long for another write to the same name, and never more than MAX_WAIT_MS from its first call.
const DEBOUNCE_MS = 400
const MAX_WAIT_MS = 2000
const AUDIT_FAILED_MESSAGE = 'Your change was not saved. Tec-Tac could not record it, so the old value stays. Try again in a moment.'
const MODULE_NOT_ALLOWED_MESSAGE = 'You may not use this module, so its settings are not available to you.'

function refuse(code, message, status = 0) {
  return Object.assign(new Error(message), { status, payload: null, code })
}

function checkName(name) {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    throw refuse('invalid_name', 'name must be 1 to 64 characters: a lower-case letter or digit, then lower-case letters, digits, "." "_" or "-".', 400)
  }
  return name
}

// Plain JSON only: null, booleans, finite numbers, strings, arrays and plain objects, at most 5 levels deep.
function valueProblem(value, level = 1) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return ''
  if (typeof value === 'number') return Number.isFinite(value) ? '' : 'value must be plain JSON.'
  const isArray = Array.isArray(value)
  const isObject = !isArray && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  if (!isArray && !isObject) return 'value must be plain JSON.'
  if (level > MAX_VALUE_DEPTH) return `value may nest at most ${MAX_VALUE_DEPTH} levels deep.`
  for (const child of isArray ? value : Object.values(value)) {
    const problem = valueProblem(child, level + 1)
    if (problem) return problem
  }
  return ''
}

function checkValue(value) {
  const problem = valueProblem(value)
  if (problem) throw refuse('invalid_value', problem, 400)
  let text
  try {
    text = JSON.stringify(value)
  } catch {
    throw refuse('invalid_value', 'value must be plain JSON.', 400)
  }
  if (new TextEncoder().encode(text).length > MAX_VALUE_BYTES) throw refuse('invalid_value', 'value may not exceed 4 KiB when stored.', 400)
  return value
}

export function createModulePreferencesService() {
  return Object.freeze({
    // api is the module's guarded api(); isSignedOut() and isAbandoned() come from the loader.
    forModule(moduleId, { api, isSignedOut, isAbandoned } = {}) {
      // 0.12.107: a missing api is named here, at creation, instead of a raw TypeError on the first call.
      if (typeof api !== 'function') throw new Error("modulePreferences needs the module's api helper")
      const id = String(moduleId ?? '')
      const base = `/api/tfd/module-preferences/${encodeURIComponent(id)}/`
      let shut = false
      // 0.12.108: the 403 module_not_allowed error, once Core has refused this module for the person. Later calls get it again.
      let accessRefusal = null
      // Writes not yet finished, per name, oldest first. tails keeps the sends for one name in order.
      const writes = new Map()
      const tails = new Map()

      function unloaded(operation) {
        return new Error(`module ${id} was unloaded; modulePreferences.${operation}() is refused`)
      }

      // The refusal for a call, or null. Abandoned, unloaded and signed out are checked at call time and again when a
      // waiting write is sent; a refusal from Core (module_not_allowed) is kept for the instance.
      function refusalFor(operation) {
        if (typeof isAbandoned === 'function' && isAbandoned()) {
          return new Error(`module ${id} was abandoned after a failed or timed-out register(); modulePreferences.${operation}() is refused`)
        }
        if (shut) return unloaded(operation)
        if (typeof isSignedOut === 'function' && isSignedOut() === true) {
          return refuse('signed_out', 'You are signed out. Sign in again to continue.', 401)
        }
        return accessRefusal
      }

      // Refused before any request: abandoned, unloaded, signed out, or refused by Core for this module.
      function gate(operation) {
        const refusal = refusalFor(operation)
        if (refusal) throw refusal
      }

      // Core's two refusals in plain words. A write answered 503 audit_failed keeps the old value; the caller sees the plain
      // message, never Core's detail. Every other error passes through unchanged.
      function plainFailure(error, isWrite) {
        if (error?.status === 403 && error.code === 'module_not_allowed') {
          accessRefusal = Object.assign(refuse('module_not_allowed', MODULE_NOT_ALLOWED_MESSAGE, 403), { hideControl: true })
          return accessRefusal
        }
        if (isWrite && error?.status === 503 && error.code === 'audit_failed') return refuse('audit_failed', AUDIT_FAILED_MESSAGE, 503)
        return error
      }

      // Core's stored values, with every unfinished write laid over them, so get and getAll agree with the screen.
      function overlay(prefs) {
        const out = { ...prefs }
        for (const [name, list] of writes) {
          const latest = list[list.length - 1]
          if (latest.op === 'set') out[name] = latest.value
          else delete out[name]
        }
        return out
      }

      async function readAll() {
        let response
        try {
          response = await api(base)
        } catch (error) {
          throw plainFailure(error, false)
        }
        const prefs = response && typeof response.preferences === 'object' && response.preferences !== null ? response.preferences : {}
        return overlay(prefs)
      }

      // Adds a set or a remove for one name. A write still waiting absorbs it, so one request carries the last operation.
      // Each caller keeps the operation of its own call (0.12.109), so its resolved value can be of that type.
      function queue(name, op, value) {
        let list = writes.get(name)
        if (!list) {
          list = []
          writes.set(name, list)
        }
        let write = list[list.length - 1]
        if (!write || write.sent) {
          write = { op, value, callers: [], timer: null, firstAt: Date.now(), sent: false, done: null }
          list.push(write)
        }
        write.op = op
        write.value = value
        return new Promise((resolve, reject) => {
          write.callers.push({ op, resolve, reject })
          arm(name, write)
        })
      }

      // Restarts the debounce, but never waits past MAX_WAIT_MS from the first call of this write.
      function arm(name, write) {
        clearTimeout(write.timer)
        const wait = Math.min(DEBOUNCE_MS, write.firstAt + MAX_WAIT_MS - Date.now())
        write.timer = setTimeout(() => dispatch(name, write), Math.max(0, wait))
      }

      function dispatch(name, write) {
        if (write.sent) return
        clearTimeout(write.timer)
        write.timer = null
        write.sent = true
        const run = (tails.get(name) || Promise.resolve()).then(() => send(name, write))
        tails.set(name, run)
        write.done = run
      }

      async function send(name, write) {
        const refusal = refusalFor(write.op)
        if (refusal) return settle(name, write, refusal)
        const path = `${base}${encodeURIComponent(name)}/`
        let response
        try {
          response = write.op === 'set'
            ? await api(path, { method: 'PUT', body: JSON.stringify({ value: write.value }) })
            : await api(path, { method: 'DELETE' })
        } catch (error) {
          return settle(name, write, plainFailure(error, true))
        }
        return settle(name, write, null, write.op === 'set' ? response?.value : response?.deleted === true)
      }

      // The resolved value a caller gets for a merged write (0.12.109). A caller whose operation was the last one gets Core's
      // answer. A set() superseded by a remove() gets undefined (it stored nothing); a remove() superseded by a set() gets
      // false (it removed nothing this time).
      function ownResult(caller, write, value) {
        if (caller.op === write.op) return value
        return caller.op === 'set' ? undefined : false
      }

      // Takes a write out of the pending view and gives every caller of it the same rejection, or its own result.
      function settle(name, write, error, value) {
        const list = writes.get(name)
        const index = list ? list.indexOf(write) : -1
        if (index >= 0) {
          list.splice(index, 1)
          if (list.length === 0) writes.delete(name)
        }
        const callers = write.callers
        write.callers = []
        for (const caller of callers) {
          if (error) caller.reject(error)
          else caller.resolve(ownResult(caller, write, value))
        }
      }

      return Object.freeze({
        // The stored value of one preference, or fallback when the person has none.
        async get(name, fallback) {
          gate('get')
          const key = checkName(name)
          const prefs = await readAll()
          return Object.prototype.hasOwnProperty.call(prefs, key) ? prefs[key] : fallback
        },
        // Every preference of this module for the person, as a new object.
        async getAll() {
          gate('getAll')
          return { ...(await readAll()) }
        },
        // Stores one value and resolves with what Core stored. 0.12.108: the request waits about 400 ms for a later write to
        // the same name. 0.12.109: when a later remove supersedes it, this call resolves undefined.
        async set(name, value) {
          gate('set')
          const key = checkName(name)
          checkValue(value)
          return queue(key, 'set', value)
        },
        // Removes one preference. Resolves true when Core removed a row. 0.12.108: debounced like set(). 0.12.109: when a later
        // set supersedes it, this call resolves false.
        async remove(name) {
          gate('remove')
          const key = checkName(name)
          return queue(key, 'remove')
        },
        // 0.12.108: sends every waiting write now and resolves when all unfinished writes are done. A failed write rejects its
        // own caller, not this call.
        async flush() {
          for (const [name, list] of [...writes]) {
            for (const write of [...list]) dispatch(name, write)
          }
          await Promise.all([...writes.values()].flat().map((write) => write.done).filter(Boolean))
        },
        // Called by the loader when the module is unloaded or abandoned. Writes not yet sent are dropped and their callers
        // rejected; later calls are refused.
        clear() {
          shut = true
          for (const [name, list] of [...writes]) {
            for (const write of [...list]) {
              if (write.sent) continue
              clearTimeout(write.timer)
              write.timer = null
              settle(name, write, unloaded(write.op))
            }
          }
        },
      })
    },
  })
}
