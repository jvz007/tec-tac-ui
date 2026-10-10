import { reactive } from 'vue'

// The one placement that takes a data loader instead of a component: the
// Endpoints grid. Every other placement keeps the component-required rule.
export const GRID_COLUMN_PLACEMENT = 'endpoint.grid-columns'
export const GRID_COLUMN_MAX_IDS = 100
const DEFAULT_GRID_TIMEOUT_SECONDS = 30

function normalizeView(moduleId, source) {
  if (!source || typeof source !== 'object') throw new Error('resource view registration requires a descriptor')

  const id = String(source.id || '').trim()
  const resource = String(source.resource || '').trim()
  const placement = String(source.placement || '').trim()
  if (!id) throw new Error(`module ${moduleId} attempted to register a resource view without an id`)
  if (!id.startsWith(`${moduleId}.`)) throw new Error(`resource view id ${id} must begin with ${moduleId}.`)
  if (!resource) throw new Error(`resource view ${id} requires a resource`)
  if (!placement) throw new Error(`resource view ${id} requires a placement`)
  const isGridColumn = placement === GRID_COLUMN_PLACEMENT
  if (isGridColumn) {
    if (typeof source.load !== 'function') throw new Error(`resource view ${id} at ${GRID_COLUMN_PLACEMENT} requires a load function`)
    if (source.cell != null && typeof source.cell !== 'object' && typeof source.cell !== 'function') {
      throw new Error(`resource view ${id} cell must be a component`)
    }
  } else {
    if (source.load != null) throw new Error(`resource view ${id}: load is only accepted at ${GRID_COLUMN_PLACEMENT}`)
    if (!source.component) throw new Error(`resource view ${id} requires a component`)
  }

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
    component: source.component || null,
    visible: typeof source.visible === 'function' ? source.visible : null,
    props: rawProps ?? null,
    metadata: source.metadata && typeof source.metadata === 'object' ? { ...source.metadata } : {},
    ...(isGridColumn
      ? {
          load: source.load,
          cell: source.cell || null,
          sortable: source.sortable === true,
          filterable: source.filterable === true,
        }
      : {}),
  }
}

// timeoutSeconds is a getter (read on every load) so main.js can follow a
// reloaded runtime context; this file stays import-free.
export function createResourceViewRegistry({ hasPermission, timeoutSeconds } = {}) {
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

  function gridColumns({ resource = 'endpoint', ids, context = {} } = {}) {
    const visible = list({ resource, placement: GRID_COLUMN_PLACEMENT, context })
    if (!Array.isArray(ids)) return visible
    const byId = new Map(visible.map((row) => [row.id, row]))
    const out = []
    for (const id of new Set(ids.map(String))) {
      if (byId.has(id)) out.push(byId.get(id))
    }
    return out
  }

  function readLimitMs() {
    let seconds = DEFAULT_GRID_TIMEOUT_SECONDS
    try {
      const value = typeof timeoutSeconds === 'function' ? Number(timeoutSeconds()) : NaN
      if (Number.isFinite(value) && value > 0) seconds = value
    } catch { /* default */ }
    return seconds * 1000
  }

  function loadOne(id, agentIds, context, hostSignal, limitMs) {
    const failed = (status) => ({ id, status, values: {} })
    // Re-check against the registry row, not the object the caller passed.
    const view = views.get(id)
    if (!view || view.placement !== GRID_COLUMN_PLACEMENT || typeof view.load !== 'function' || !evaluate(view, context).visible) {
      return Promise.resolve(failed('failed'))
    }
    const controller = new AbortController()
    const onHostAbort = () => controller.abort()
    if (hostSignal?.aborted) controller.abort()
    else hostSignal?.addEventListener?.('abort', onHostAbort, { once: true })
    let timer
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve(failed('timeout'))
      }, limitMs)
    })
    const work = (async () => {
      try {
        const answer = await view.load([...agentIds], {
          resource: view.resource,
          placement: view.placement,
          context,
          signal: controller.signal,
        })
        if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return failed('failed')
        const values = Object.fromEntries(
          agentIds.filter((agentId) => Object.prototype.hasOwnProperty.call(answer, agentId)).map((agentId) => [agentId, answer[agentId]]),
        )
        return { id, status: 'ready', values }
      } catch {
        return failed('failed')
      }
    })()
    return Promise.race([work, timeout]).finally(() => {
      clearTimeout(timer)
      hostSignal?.removeEventListener?.('abort', onHostAbort)
    })
  }

  function loadGridColumns({ columns, agentIds, context = {}, signal } = {}) {
    const ids = [...new Set((Array.isArray(agentIds) ? agentIds : []).filter((x) => x != null).map(String))]
    if (ids.length > GRID_COLUMN_MAX_IDS) {
      throw new RangeError(`loadGridColumns accepts at most ${GRID_COLUMN_MAX_IDS} agent ids per call`)
    }
    const limitMs = readLimitMs()
    const out = {}
    for (const column of Array.isArray(columns) ? columns : []) {
      const id = column && typeof column === 'object' ? String(column.id || '') : ''
      if (!id || Object.prototype.hasOwnProperty.call(out, id)) continue
      out[id] = loadOne(id, ids, context, signal, limitMs)
    }
    return out
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
      gridColumns(query = {}) {
        return gridColumns(query)
      },
      loadGridColumns(query = {}) {
        return loadGridColumns(query)
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
    snapshot: () => [...views.values()].map(({ component, visible, props, load, cell, ...row }) => ({ ...row })),
  })
}
