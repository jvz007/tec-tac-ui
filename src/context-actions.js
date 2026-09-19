import { reactive } from 'vue'

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  if (value == null || value === '') return []
  return [String(value)]
}

function normalizeSelectionRule(value = {}) {
  const min = Number.isFinite(Number(value.min)) ? Math.max(0, Number(value.min)) : 1
  const rawMax = value.max
  const max = rawMax == null || rawMax === '' ? null : Math.max(min, Number(rawMax))
  return { min, max: Number.isFinite(max) ? max : null }
}

function normalizeAction(moduleId, source, execute) {
  if (!source || typeof source !== 'object') throw new Error('context action registration requires an action descriptor')
  const id = String(source.id || '').trim()
  const resource = String(source.resource || '').trim()
  const label = String(source.label || '').trim()
  if (!id) throw new Error(`module ${moduleId} attempted to register a context action without an id`)
  if (!id.startsWith(`${moduleId}.`)) throw new Error(`context action id ${id} must begin with ${moduleId}.`)
  if (!resource) throw new Error(`context action ${id} requires a resource`)
  if (!label) throw new Error(`context action ${id} requires a label`)

  const placements = asArray(source.placements || source.placement)
  if (!placements.length) throw new Error(`context action ${id} requires at least one placement`)
  const handler = execute || source.execute
  if (typeof handler !== 'function') throw new Error(`context action ${id} requires an execute(context) handler`)

  return {
    id,
    provider: moduleId,
    resource,
    label,
    icon: source.icon == null ? '' : String(source.icon),
    group: source.group == null ? 'integrations' : String(source.group),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 500,
    placements,
    permission: source.permission == null ? null : String(source.permission),
    dangerous: source.dangerous === true,
    selection: normalizeSelectionRule(source.selection),
    visible: typeof source.visible === 'function' ? source.visible : null,
    enabled: typeof source.enabled === 'function' ? source.enabled : null,
    execute: handler,
    metadata: source.metadata && typeof source.metadata === 'object' ? { ...source.metadata } : {},
  }
}

export function createContextActionRegistry({ hasPermission } = {}) {
  const actions = reactive(new Map())

  function removeProvider(moduleId) {
    for (const [id, action] of actions.entries()) {
      if (action.provider === moduleId) actions.delete(id)
    }
  }

  function evaluate(action, context = {}) {
    const selection = Array.isArray(context.selection) ? context.selection : (context.resource ? [context.resource] : [])
    if (action.permission && typeof hasPermission === 'function' && !hasPermission(action.permission)) {
      return { visible: true, enabled: false, reason: `Permission required: ${action.permission}` }
    }
    if (selection.length < action.selection.min) {
      return { visible: true, enabled: false, reason: `Select at least ${action.selection.min} item${action.selection.min === 1 ? '' : 's'}.` }
    }
    if (action.selection.max != null && selection.length > action.selection.max) {
      return { visible: true, enabled: false, reason: `Select no more than ${action.selection.max} item${action.selection.max === 1 ? '' : 's'}.` }
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
        if (result === false) return { visible: true, enabled: false, reason: 'Unavailable for this selection.' }
        if (result && typeof result === 'object' && result.enabled === false) {
          return { visible: true, enabled: false, reason: result.reason || 'Unavailable for this selection.' }
        }
      } catch (error) {
        return { visible: true, enabled: false, reason: error?.message || String(error) }
      }
    }
    return { visible: true, enabled: true, reason: null }
  }

  function list({ resource, placement, context = {} } = {}) {
    return [...actions.values()]
      .filter((action) => (!resource || action.resource === resource) && (!placement || action.placements.includes(placement)))
      .map((action) => ({ ...action, state: evaluate(action, context) }))
      .filter((action) => action.state.visible)
      .sort((a, b) => a.group.localeCompare(b.group) || a.order - b.order || a.label.localeCompare(b.label))
  }

  function forModule(moduleId) {
    const owned = new Set()
    return Object.freeze({
      register(source, execute) {
        const action = normalizeAction(moduleId, source, execute)
        const existing = actions.get(action.id)
        if (existing && existing.provider !== moduleId) throw new Error(`context action ${action.id} is already owned by ${existing.provider}`)
        actions.set(action.id, action)
        owned.add(action.id)
        return () => {
          if (actions.get(action.id)?.provider === moduleId) actions.delete(action.id)
          owned.delete(action.id)
        }
      },
      unregister(id) {
        const key = String(id || '')
        if (actions.get(key)?.provider !== moduleId) return false
        actions.delete(key)
        owned.delete(key)
        return true
      },
      list(query = {}) {
        return list(query)
      },
      async execute(id, context = {}) {
        const action = actions.get(String(id || ''))
        if (!action) throw new Error(`Context action ${id} is not registered.`)
        const state = evaluate(action, context)
        if (!state.visible || !state.enabled) throw new Error(state.reason || `Context action ${id} is unavailable.`)
        return await action.execute(context)
      },
      clear() {
        for (const id of owned) {
          if (actions.get(id)?.provider === moduleId) actions.delete(id)
        }
        owned.clear()
      },
    })
  }

  return Object.freeze({
    forModule,
    list,
    removeProvider,
    snapshot: () => [...actions.values()].map(({ execute, visible, enabled, ...row }) => ({ ...row })),
  })
}
