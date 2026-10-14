// 0.12.106: module user preferences (Core 1.17.35, core.module_preferences 1.0.0). A module keeps one small per-person choice
// through Core, such as a collapse control. The helper is bound to the module that receives it: the id is the loader's
// descriptor id, never an argument, so a module cannot name another module. There is no AD-20 replaced-module exception:
// a replacement keeps its own preferences. Calls go through the module's own guarded api(). Nothing is cached and nothing
// is written to browser storage. Name and value limits are checked before any request; Core stays the authority.
// The contract row ui.authenticated.modulePreferences is written by Core (reviews/requests/core.md).

// Core's limits (framwork/tec_tac/module_preferences.py): one name 1 to 64 characters, a value at most 4 KiB when stored
// and at most 5 levels deep.
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const MAX_VALUE_BYTES = 4 * 1024
const MAX_VALUE_DEPTH = 5

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

      // Refused before any request: abandoned, unloaded, or signed out.
      function gate(operation) {
        if (typeof isAbandoned === 'function' && isAbandoned()) {
          throw new Error(`module ${id} was abandoned after a failed or timed-out register(); modulePreferences.${operation}() is refused`)
        }
        if (shut) throw new Error(`module ${id} was unloaded; modulePreferences.${operation}() is refused`)
        if (typeof isSignedOut === 'function' && isSignedOut() === true) {
          throw refuse('signed_out', 'You are signed out. Sign in again to continue.', 401)
        }
      }

      async function readAll() {
        const response = await api(base)
        const prefs = response && typeof response.preferences === 'object' && response.preferences !== null ? response.preferences : {}
        return prefs
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
        // Stores one value and returns what Core stored.
        async set(name, value) {
          gate('set')
          const key = checkName(name)
          checkValue(value)
          const response = await api(`${base}${encodeURIComponent(key)}/`, {
            method: 'PUT',
            body: JSON.stringify({ value }),
          })
          return response?.value
        },
        // Removes one preference. True when Core removed a row.
        async remove(name) {
          gate('remove')
          const key = checkName(name)
          const response = await api(`${base}${encodeURIComponent(key)}/`, { method: 'DELETE' })
          return response?.deleted === true
        },
        // Called by the loader when the module is unloaded or abandoned. Later calls are refused.
        clear() {
          shut = true
        },
      })
    },
  })
}
