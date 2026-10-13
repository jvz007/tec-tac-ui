import { reactive } from 'vue'

// 0.12.101: the browser service registry between modules. A provider publishes a named browser operation; another module
// looks it up and calls it. Permission is checked each time a service is listed, asked for or called (AD-12): a service
// the person may not use is hidden, and call() refuses it. The provider's handler receives the caller's module id as a
// hint. It is never authorization: the backend decides every server action.
// 0.12.102: fail closed. A service needs at least one permission (the module's own, the service's, or a Tactical flag),
// and outside a backend-supplied context every service is hidden and refused (AD-12). The loader's unload calls
// removeProvider when a module is switched off.

const MAX_NAME = 120
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

function asList(value) {
  const values = Array.isArray(value) ? value : (value == null || value === '' ? [] : [value])
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))]
}

function refusal(message, code, service, provider = null) {
  return Object.assign(new Error(message), { code, service, provider })
}

export function createModuleServiceRegistry({ hasPermission = () => false, hasTacticalPermission = () => false, isTrustedContext = () => true } = {}) {
  const entries = new Map()
  const signal = reactive({ version: 0 })
  const touch = () => { signal.version += 1 }

  // The module's permissions always apply. A permission named by the provider only adds to them, so it can narrow a
  // service but never widen it. Tactical flags are strict: only the boolean true counts.
  function allowed(entry) {
    if (!isTrustedContext()) return false
    if (entry.permissions.some((code) => !hasPermission(code))) return false
    return entry.tacticalPermissions.every((flag) => hasTacticalPermission(flag) === true)
  }

  function has(name) {
    void signal.version
    const entry = entries.get(String(name || ''))
    return Boolean(entry) && allowed(entry)
  }

  function list() {
    void signal.version
    return [...entries.values()]
      .filter(allowed)
      .map((entry) => ({ name: entry.name, label: entry.label, provider: entry.provider }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.provider.localeCompare(b.provider))
  }

  // The caller is passed by the loader, bound to the calling module. An argument can never set it.
  async function call(name, args, caller) {
    const key = String(name || '')
    const entry = entries.get(key)
    if (!entry) throw refusal(`Service ${key || '(no name)'} is not available.`, 'service_unavailable', key)
    if (!allowed(entry)) throw refusal(`Service ${key} is not available to you.`, 'service_denied', key, entry.provider)
    try {
      return await entry.handler(args, { caller })
    } catch (error) {
      throw Object.assign(new Error(`Service ${key} from ${entry.provider} failed: ${error?.message || String(error)}`), {
        service: key,
        provider: entry.provider,
        cause: error,
      })
    }
  }

  function forModule(moduleId, defaults = {}) {
    const provider = String(moduleId || '').trim()
    if (!provider) throw new Error('module ID is required for services')
    const defaultPermissions = asList(defaults.permissions)
    const owned = new Map()

    return Object.freeze({
      provide(name, handler, options = {}) {
        const key = String(name || '').trim()
        if (!key.startsWith(`${provider}.`) || key.length <= provider.length + 1) {
          throw new Error(`service name ${key || '(empty)'} must begin with ${provider}.`)
        }
        if (key.length > MAX_NAME || !NAME_PATTERN.test(key)) {
          throw new Error(`service name ${key} may use letters, digits, '.', '_' and '-' only, and at most ${MAX_NAME} characters`)
        }
        if (typeof handler !== 'function') throw new Error(`service ${key} requires a handler function`)
        const existing = entries.get(key)
        if (existing && existing.provider !== provider) throw new Error(`service ${key} is already provided by ${existing.provider}`)
        const source = options && typeof options === 'object' ? options : {}
        const permissions = asList([...defaultPermissions, ...asList(source.permission), ...asList(source.permissions)])
        const tacticalPermissions = asList(source.tacticalPermission)
        // Fail closed (0.12.102): a service with no permission at all would be open to every module and person.
        if (permissions.length === 0 && tacticalPermissions.length === 0) {
          throw new Error(`Service ${key} needs at least one permission: declare one for the module or for this service.`)
        }
        const entry = {
          name: key,
          provider,
          label: String(source.label || key),
          permissions,
          tacticalPermissions,
          handler,
        }
        entries.set(key, entry)
        owned.set(key, entry)
        touch()
        return () => {
          if (entries.get(key) === entry) entries.delete(key)
          if (owned.get(key) === entry) owned.delete(key)
          touch()
        }
      },
      has: (name) => has(name),
      list: () => list(),
      call: (name, args) => call(name, args, provider),
      // Removes every service this module provides. Called when the module fails, times out or is abandoned.
      clear() {
        for (const [key, entry] of owned) if (entries.get(key) === entry) entries.delete(key)
        owned.clear()
        touch()
      },
    })
  }

  // The shell's hook for a module that is turned off while the page is open (same rule as context actions).
  function removeProvider(moduleId) {
    const provider = String(moduleId || '')
    let changed = false
    for (const [key, entry] of [...entries]) {
      if (entry.provider === provider) {
        entries.delete(key)
        changed = true
      }
    }
    if (changed) touch()
  }

  return Object.freeze({ forModule, list, removeProvider })
}
