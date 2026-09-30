import { reactive } from 'vue'

function normalizeView(moduleId, source) {
  if (!source || typeof source !== 'object') throw new Error('resource view registration requires a descriptor')

  const id = String(source.id || '').trim()
  const resource = String(source.resource || '').trim()
  const placement = String(source.placement || '').trim()
  if (!id) throw new Error(`module ${moduleId} attempted to register a resource view without an id`)
  if (!id.startsWith(`${moduleId}.`)) throw new Error(`resource view id ${id} must begin with ${moduleId}.`)
  if (!resource) throw new Error(`resource view ${id} requires a resource`)
  if (!placement) throw new Error(`resource view ${id} requires a placement`)
  if (!source.component) throw new Error(`resource view ${id} requires a component`)

  const rawProps = source.props
  if (rawProps != null && typeof rawProps !== 'function' && typeof rawProps !== 'object') {
    throw new Error(`resource view ${id} props must be an object or function`)
  }

  return {
    id,
    provider: moduleId,
    resource,
    placement,
    label: String(source.label || id),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 500,
    permission: source.permission == null ? null : String(source.permission),
    component: source.component,
    visible: typeof source.visible === 'function' ? source.visible : null,
    props: rawProps ?? null,
    metadata: source.metadata && typeof source.metadata === 'object' ? { ...source.metadata } : {},
  }
}

export function createResourceViewRegistry({ hasPermission } = {}) {
  const views = reactive(new Map())

  function removeProvider(moduleId) {
    for (const [id, view] of views.entries()) {
      if (view.provider === moduleId) views.delete(id)
    }
  }

  function evaluate(view, context = {}) {
    if (view.permission && typeof hasPermission === 'function' && !hasPermission(view.permission)) {
      return { visible: false, reason: `Permission required: ${view.permission}` }
    }
    if (view.visible) {
      try {
        if (view.visible(context) === false) return { visible: false, reason: null }
      } catch (error) {
        return { visible: false, reason: error?.message || String(error) }
      }
    }
    return { visible: true, reason: null }
  }

  function resolveProps(view, context = {}) {
    try {
      if (typeof view.props === 'function') {
        const result = view.props(context)
        return result && typeof result === 'object' ? result : {}
      }
      return view.props && typeof view.props === 'object' ? { ...view.props } : {}
    } catch (error) {
      return { resourceViewError: error?.message || String(error) }
    }
  }

  function list({ resource, placement, context = {} } = {}) {
    return [...views.values()]
      .filter((view) => (!resource || view.resource === resource) && (!placement || view.placement === placement))
      .map((view) => ({ ...view, state: evaluate(view, context), resolvedProps: resolveProps(view, context) }))
      .filter((view) => view.state.visible)
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
  }

  function forModule(moduleId) {
    const owned = new Set()
    return Object.freeze({
      register(source) {
        const view = normalizeView(moduleId, source)
        const existing = views.get(view.id)
        if (existing && existing.provider !== moduleId) {
          throw new Error(`resource view ${view.id} is already owned by ${existing.provider}`)
        }
        views.set(view.id, view)
        owned.add(view.id)
        return () => {
          if (views.get(view.id)?.provider === moduleId) views.delete(view.id)
          owned.delete(view.id)
        }
      },
      unregister(id) {
        const key = String(id || '')
        if (views.get(key)?.provider !== moduleId) return false
        views.delete(key)
        owned.delete(key)
        return true
      },
      list(query = {}) {
        return list(query)
      },
      clear() {
        for (const id of owned) {
          if (views.get(id)?.provider === moduleId) views.delete(id)
        }
        owned.clear()
      },
    })
  }

  return Object.freeze({
    forModule,
    list,
    removeProvider,
    snapshot: () => [...views.values()].map(({ component, visible, props, ...row }) => ({ ...row })),
  })
}
