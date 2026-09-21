import { reactive } from 'vue'

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  if (value == null || value === '') return []
  return [String(value)]
}

function normalizeInteraction(moduleId, source, drop) {
  if (!source || typeof source !== 'object') {
    throw new Error('context interaction registration requires an interaction descriptor')
  }

  const id = String(source.id || '').trim()
  const surface = String(source.surface || '').trim()
  if (!id) throw new Error(`module ${moduleId} attempted to register a context interaction without an id`)
  if (!id.startsWith(`${moduleId}.`)) throw new Error(`context interaction id ${id} must begin with ${moduleId}.`)
  if (!surface) throw new Error(`context interaction ${id} requires a surface`)

  const sourceTypes = asArray(source.sourceTypes || source.sourceType)
  const targetTypes = asArray(source.targetTypes || source.targetType)
  if (!sourceTypes.length) throw new Error(`context interaction ${id} requires at least one source type`)
  if (!targetTypes.length) throw new Error(`context interaction ${id} requires at least one target type`)

  const handler = drop || source.drop || source.onDrop
  if (typeof handler !== 'function') throw new Error(`context interaction ${id} requires a drop(context) handler`)

  return {
    id,
    provider: moduleId,
    surface,
    sourceTypes,
    targetTypes,
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 500,
    permission: source.permission == null ? null : String(source.permission),
    canDrop: typeof source.canDrop === 'function' ? source.canDrop : null,
    drop: handler,
    metadata: source.metadata && typeof source.metadata === 'object' ? { ...source.metadata } : {},
  }
}

export function createContextInteractionRegistry({ hasPermission } = {}) {
  const interactions = reactive(new Map())

  function removeProvider(moduleId) {
    for (const [id, interaction] of interactions.entries()) {
      if (interaction.provider === moduleId) interactions.delete(id)
    }
  }

  function evaluate(interaction, context = {}) {
    const source = context.source || null
    const target = context.target || null

    if (interaction.permission && typeof hasPermission === 'function' && !hasPermission(interaction.permission)) {
      return { visible: true, enabled: false, reason: `Permission required: ${interaction.permission}` }
    }

    if (source && !interaction.sourceTypes.includes(String(source.type || ''))) {
      return { visible: false, enabled: false, reason: 'Unsupported drag source.' }
    }

    // target may be omitted during drag-start discovery.
    if (target && !interaction.targetTypes.includes(String(target.type || ''))) {
      return { visible: false, enabled: false, reason: 'Unsupported drop target.' }
    }

    if (interaction.canDrop && target) {
      try {
        const result = interaction.canDrop(context)
        if (result === false) return { visible: true, enabled: false, reason: 'This drop is not allowed.' }
        if (result && typeof result === 'object') {
          const allowed = result.allowed ?? result.enabled
          if (allowed === false) {
            return { visible: true, enabled: false, reason: result.reason || 'This drop is not allowed.' }
          }
        }
      } catch (error) {
        return { visible: true, enabled: false, reason: error?.message || String(error) }
      }
    }

    return { visible: true, enabled: true, reason: null }
  }

  function list({ surface, source, target, context = {} } = {}) {
    const combined = { ...context, surface, source, target }
    return [...interactions.values()]
      .filter((interaction) => !surface || interaction.surface === surface)
      .filter((interaction) => !source || interaction.sourceTypes.includes(String(source.type || '')))
      .filter((interaction) => !target || interaction.targetTypes.includes(String(target.type || '')))
      .map((interaction) => ({ ...interaction, state: evaluate(interaction, combined) }))
      .filter((interaction) => interaction.state.visible)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  }

  function forModule(moduleId) {
    const owned = new Set()
    return Object.freeze({
      register(source, drop) {
        const interaction = normalizeInteraction(moduleId, source, drop)
        const existing = interactions.get(interaction.id)
        if (existing && existing.provider !== moduleId) {
          throw new Error(`context interaction ${interaction.id} is already owned by ${existing.provider}`)
        }
        interactions.set(interaction.id, interaction)
        owned.add(interaction.id)
        return () => {
          if (interactions.get(interaction.id)?.provider === moduleId) interactions.delete(interaction.id)
          owned.delete(interaction.id)
        }
      },
      unregister(id) {
        const key = String(id || '')
        if (interactions.get(key)?.provider !== moduleId) return false
        interactions.delete(key)
        owned.delete(key)
        return true
      },
      list(query = {}) {
        return list(query)
      },
      async execute(id, context = {}) {
        const interaction = interactions.get(String(id || ''))
        if (!interaction) throw new Error(`Context interaction ${id} is not registered.`)
        const state = evaluate(interaction, context)
        if (!state.visible || !state.enabled) throw new Error(state.reason || `Context interaction ${id} is unavailable.`)
        return await interaction.drop(context)
      },
      clear() {
        for (const id of owned) {
          if (interactions.get(id)?.provider === moduleId) interactions.delete(id)
        }
        owned.clear()
      },
    })
  }

  return Object.freeze({
    forModule,
    list,
    removeProvider,
    snapshot: () => [...interactions.values()].map(({ canDrop, drop, ...row }) => ({ ...row })),
  })
}
