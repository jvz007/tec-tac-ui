import { reactive, markRaw } from 'vue'

function normalizeSize(value = {}, fallback = { w: 4, h: 3 }) {
  const w = Math.min(12, Math.max(1, Number(value.w ?? value.width ?? fallback.w) || fallback.w))
  const h = Math.min(12, Math.max(1, Number(value.h ?? value.height ?? fallback.h) || fallback.h))
  return { w, h }
}

export function createDashboardWidgetRegistry({ hasPermission = () => true } = {}) {
  const entries = new Map()
  const signal = reactive({ version: 0 })

  function touch() { signal.version += 1 }

  function normalize(provider, descriptor) {
    if (!descriptor || typeof descriptor !== 'object') throw new Error('dashboard widget descriptor must be an object')
    const id = String(descriptor.id || '').trim()
    if (!id) throw new Error('dashboard widget id is required')
    if (!id.startsWith(`${provider}.`)) throw new Error(`dashboard widget id ${id} must be namespaced to provider ${provider}`)
    const title = String(descriptor.title || '').trim()
    if (!title) throw new Error(`dashboard widget ${id} requires a title`)
    if (!descriptor.component) throw new Error(`dashboard widget ${id} requires a Vue component`)
    return {
      id,
      provider,
      title,
      description: String(descriptor.description || '').trim(),
      category: String(descriptor.category || 'General').trim() || 'General',
      permission: descriptor.permission ? String(descriptor.permission) : null,
      defaultSize: normalizeSize(descriptor.defaultSize || descriptor.size),
      minSize: normalizeSize(descriptor.minSize || { w: 2, h: 2 }, { w: 2, h: 2 }),
      maxSize: normalizeSize(descriptor.maxSize || { w: 12, h: 12 }, { w: 12, h: 12 }),
      component: markRaw(descriptor.component),
      metadata: descriptor.metadata && typeof descriptor.metadata === 'object' ? { ...descriptor.metadata } : {},
    }
  }

  function register(provider, descriptor) {
    const entry = normalize(provider, descriptor)
    if (entries.has(entry.id)) throw new Error(`dashboard widget ${entry.id} is already registered`)
    entries.set(entry.id, entry)
    touch()
    let disposed = false
    return {
      dispose() {
        if (disposed) return
        disposed = true
        if (entries.get(entry.id)?.provider === provider) {
          entries.delete(entry.id)
          touch()
        }
      },
    }
  }

  function permitted(entry) {
    return !entry.permission || hasPermission(entry.permission)
  }

  function list() {
    void signal.version
    return [...entries.values()]
      .filter(permitted)
      .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title))
  }

  function snapshot() {
    return list().map(({ component, ...entry }) => ({ ...entry }))
  }

  function get(id) {
    void signal.version
    const entry = entries.get(String(id))
    return entry && permitted(entry) ? entry : null
  }

  function removeProvider(provider) {
    let changed = false
    for (const [id, entry] of entries) {
      if (entry.provider === provider) {
        entries.delete(id)
        changed = true
      }
    }
    if (changed) touch()
  }

  function forModule(provider) {
    const owned = new Set()
    return {
      register(descriptor) {
        const disposable = register(provider, descriptor)
        owned.add(descriptor.id)
        return {
          dispose() {
            disposable.dispose()
            owned.delete(descriptor.id)
          },
        }
      },
      unregister(id) {
        const key = String(id)
        const entry = entries.get(key)
        if (!entry || entry.provider !== provider) return false
        entries.delete(key)
        owned.delete(key)
        touch()
        return true
      },
      list,
      get,
      snapshot,
      clear() {
        for (const id of [...owned]) {
          const entry = entries.get(id)
          if (entry?.provider === provider) entries.delete(id)
        }
        owned.clear()
        touch()
      },
    }
  }

  return { forModule, list, get, snapshot, removeProvider }
}
