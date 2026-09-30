import { reactive } from 'vue'
import { preferenceState, updateUserPreferences } from './preferences'

const MAX_QUICK_ACTIONS = 24
const MAX_PARAMS_BYTES = 8192

function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function clone(value) { return JSON.parse(JSON.stringify(value)) }

function safeParams(value) {
  const params = object(value)
  let encoded = ''
  try { encoded = JSON.stringify(params) } catch { throw new Error('Quick action parameters must be JSON-serializable.') }
  if (new TextEncoder().encode(encoded).length > MAX_PARAMS_BYTES) throw new Error('Quick action parameters exceed the 8 KiB limit.')
  return clone(params)
}

function pinId() {
  if (globalThis.crypto?.randomUUID) return `action:${globalThis.crypto.randomUUID()}`
  return `action:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
}

function readPins() {
  const rows = preferenceState.preferences?.extensions?.core?.quick_actions
  if (!Array.isArray(rows)) return []
  return rows
    .filter((row) => row && typeof row === 'object' && row.type === 'action' && typeof row.id === 'string' && typeof row.action_id === 'string')
    .slice(0, MAX_QUICK_ACTIONS)
    .map((row) => ({ ...clone(row), params: safeParams(row.params) }))
}

function writePins(rows) {
  const normalized = rows
    .filter((row) => row?.type === 'action' && typeof row.action_id === 'string')
    .slice(0, MAX_QUICK_ACTIONS)
    .map((row) => ({ ...clone(row), type: 'action', params: safeParams(row.params) }))
  updateUserPreferences((next) => {
    next.extensions ||= {}
    next.extensions.core ||= {}
    next.extensions.core.quick_actions = normalized
    return next
  })
  return normalized
}

function normalizeAction(moduleId, source, execute) {
  if (!source || typeof source !== 'object') throw new Error('quick action registration requires an action descriptor')
  const id = String(source.id || '').trim()
  const label = String(source.label || '').trim()
  if (!id) throw new Error(`module ${moduleId} attempted to register a quick action without an id`)
  if (!id.startsWith(`${moduleId}.`)) throw new Error(`quick action id ${id} must begin with ${moduleId}.`)
  if (!label) throw new Error(`quick action ${id} requires a label`)
  const handler = execute || source.execute
  if (typeof handler !== 'function') throw new Error(`quick action ${id} requires an execute(context) handler`)
  return {
    id,
    provider: moduleId,
    label,
    icon: source.icon == null ? '⚡' : String(source.icon),
    description: source.description == null ? '' : String(source.description),
    group: source.group == null ? 'Module actions' : String(source.group),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 500,
    permission: source.permission == null ? null : String(source.permission),
    dangerous: source.dangerous === true,
    directPin: source.directPin !== false,
    defaultParams: safeParams(source.defaultParams),
    visible: typeof source.visible === 'function' ? source.visible : null,
    enabled: typeof source.enabled === 'function' ? source.enabled : null,
    execute: handler,
    metadata: object(source.metadata),
  }
}

export function createQuickActionRegistry({ hasPermission } = {}) {
  const actions = reactive(new Map())

  function evaluate(action, context = {}) {
    if (action.permission && typeof hasPermission === 'function' && !hasPermission(action.permission)) {
      return { visible: true, enabled: false, reason: `Permission required: ${action.permission}` }
    }
    if (action.visible) {
      try {
        if (action.visible(context) === false) return { visible: false, enabled: false, reason: null }
      } catch (error) {
        return { visible: false, enabled: false, reason: error?.message || String(error) }
      }
    }
    if (action.enabled) {
      try {
        const result = action.enabled(context)
        if (result === false) return { visible: true, enabled: false, reason: 'Action is currently unavailable.' }
        if (result && typeof result === 'object' && result.enabled === false) {
          return { visible: true, enabled: false, reason: result.reason || 'Action is currently unavailable.' }
        }
      } catch (error) {
        return { visible: true, enabled: false, reason: error?.message || String(error) }
      }
    }
    return { visible: true, enabled: true, reason: null }
  }

  function findAction(id) { return actions.get(String(id || '')) || null }

  function listCatalog() {
    return [...actions.values()]
      .map((action) => ({ ...action, state: evaluate(action, { params: action.defaultParams, source: 'quick-action-catalog' }) }))
      .filter((action) => action.directPin && action.state.visible)
      .sort((a, b) => a.group.localeCompare(b.group) || a.order - b.order || a.label.localeCompare(b.label))
  }

  function listPins() {
    return readPins().map((pin) => {
      const action = findAction(pin.action_id)
      if (!action) return { ...pin, missing: true, state: { visible: true, enabled: false, reason: 'Provider action is not registered.' } }
      const context = { params: safeParams(pin.params), pin, source: 'quick-action-bar' }
      return {
        ...pin,
        provider: action.provider,
        dangerous: action.dangerous,
        description: action.description,
        state: evaluate(action, context),
      }
    })
  }

  function pinAction(actionId, options = {}) {
    const action = findAction(actionId)
    if (!action) throw new Error(`Quick action ${actionId} is not registered.`)
    const state = evaluate(action, { params: options.params ?? action.defaultParams, source: 'quick-action-pin' })
    if (!state.visible || !state.enabled) throw new Error(state.reason || `Quick action ${actionId} is unavailable.`)
    const pins = readPins()
    if (pins.length >= MAX_QUICK_ACTIONS) throw new Error(`Quick Actions supports up to ${MAX_QUICK_ACTIONS} shortcuts.`)
    pins.push({
      id: pinId(),
      type: 'action',
      action_id: action.id,
      label: String(options.label || action.label),
      icon: String(options.icon || action.icon || '⚡'),
      params: safeParams(options.params ?? action.defaultParams),
    })
    return writePins(pins)
  }

  function removePin(id) { return writePins(readPins().filter((pin) => pin.id !== String(id || ''))) }

  function movePin(id, offset) {
    const pins = readPins()
    const from = pins.findIndex((pin) => pin.id === String(id || ''))
    const to = from + Number(offset || 0)
    if (from < 0 || to < 0 || to >= pins.length || from === to) return pins
    const [row] = pins.splice(from, 1)
    pins.splice(to, 0, row)
    return writePins(pins)
  }

  function isActionPinned(id) { return readPins().some((pin) => pin.action_id === String(id || '')) }

  async function executePin(pinIdValue) {
    const pin = readPins().find((item) => item.id === String(pinIdValue || ''))
    if (!pin) throw new Error('Quick action shortcut was not found.')
    const action = findAction(pin.action_id)
    if (!action) throw new Error(`Quick action ${pin.action_id} is not currently registered.`)
    const context = { params: safeParams(pin.params), pin: clone(pin), source: 'quick-action-bar' }
    const state = evaluate(action, context)
    if (!state.visible || !state.enabled) throw new Error(state.reason || `Quick action ${pin.action_id} is unavailable.`)
    return await action.execute(context)
  }

  function forModule(moduleId) {
    const owned = new Set()
    return Object.freeze({
      register(source, execute) {
        const action = normalizeAction(moduleId, source, execute)
        const existing = actions.get(action.id)
        if (existing && existing.provider !== moduleId) throw new Error(`quick action ${action.id} is already owned by ${existing.provider}`)
        actions.set(action.id, action)
        owned.add(action.id)
        return () => {
          if (actions.get(action.id)?.provider === moduleId) actions.delete(action.id)
          owned.delete(action.id)
        }
      },
      pin(id, options = {}) {
        const action = actions.get(String(id || ''))
        if (!action || action.provider !== moduleId) throw new Error(`module ${moduleId} cannot pin unowned quick action ${id}`)
        return pinAction(id, options)
      },
      unpin(id) {
        const action = actions.get(String(id || ''))
        if (!action || action.provider !== moduleId) return false
        const before = readPins().length
        writePins(readPins().filter((pin) => pin.action_id !== action.id))
        return readPins().length !== before
      },
      clear() {
        for (const id of owned) if (actions.get(id)?.provider === moduleId) actions.delete(id)
        owned.clear()
      },
    })
  }

  return Object.freeze({
    forModule,
    listCatalog,
    listPins,
    pinAction,
    removePin,
    movePin,
    isActionPinned,
    executePin,
    snapshot: () => [...actions.values()].map(({ execute, visible, enabled, ...row }) => ({ ...row })),
  })
}
