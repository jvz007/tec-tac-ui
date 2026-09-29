import { markRaw, reactive } from 'vue'

const MAX_VISIBLE_HEADER_CONTRIBUTIONS = 6

function normalize(provider, source) {
  if (!source || typeof source !== 'object') throw new Error('header contribution registration requires a descriptor')
  const id = String(source.id || '').trim()
  if (!id) throw new Error(`module ${provider} attempted to register a header contribution without an id`)
  if (!id.startsWith(`${provider}.`)) throw new Error(`header contribution id ${id} must begin with ${provider}.`)
  if (!source.component) throw new Error(`header contribution ${id} requires a Vue component`)
  const rawProps = source.props
  if (rawProps != null && typeof rawProps !== 'function' && typeof rawProps !== 'object') throw new Error(`header contribution ${id} props must be an object or function`)
  return {
    id,
    provider,
    label: String(source.label || id),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 500,
    permission: source.permission == null ? null : String(source.permission),
    visible: typeof source.visible === 'function' ? source.visible : null,
    component: markRaw(source.component),
    props: rawProps ?? null,
    metadata: source.metadata && typeof source.metadata === 'object' ? { ...source.metadata } : {},
  }
}

export function createHeaderContributionRegistry({ hasPermission = () => true } = {}) {
  const entries = new Map()
  const signal = reactive({ version: 0 })
  const touch = () => { signal.version += 1 }

  function evaluate(entry, context = {}) {
    if (entry.permission && !hasPermission(entry.permission)) return false
    if (!entry.visible) return true
    try { return entry.visible(context) !== false } catch { return false }
  }

  function resolveProps(entry, context = {}) {
    try {
      if (typeof entry.props === 'function') {
        const value = entry.props(context)
        return value && typeof value === 'object' ? value : {}
      }
      return entry.props && typeof entry.props === 'object' ? { ...entry.props } : {}
    } catch (error) {
      return { headerContributionError: error?.message || String(error) }
    }
  }

  function list(context = {}) {
    void signal.version
    return [...entries.values()]
      .filter((entry) => evaluate(entry, context))
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
      .slice(0, MAX_VISIBLE_HEADER_CONTRIBUTIONS)
      .map((entry) => ({ ...entry, resolvedProps: resolveProps(entry, context) }))
  }

  function forModule(provider) {
    const owned = new Set()
    return Object.freeze({
      register(source) {
        const entry = normalize(provider, source)
        const existing = entries.get(entry.id)
        if (existing && existing.provider !== provider) throw new Error(`header contribution ${entry.id} is already owned by ${existing.provider}`)
        entries.set(entry.id, entry)
        owned.add(entry.id)
        touch()
        return () => {
          if (entries.get(entry.id)?.provider === provider) entries.delete(entry.id)
          owned.delete(entry.id)
          touch()
        }
      },
      unregister(id) {
        const key = String(id || '')
        if (entries.get(key)?.provider !== provider) return false
        entries.delete(key)
        owned.delete(key)
        touch()
        return true
      },
      list,
      clear() {
        let changed = false
        for (const id of owned) {
          if (entries.get(id)?.provider === provider) { entries.delete(id); changed = true }
        }
        owned.clear()
        if (changed) touch()
      },
    })
  }

  return Object.freeze({
    forModule,
    list,
    snapshot: () => [...entries.values()].map(({ component, visible, props, ...entry }) => ({ ...entry })),
  })
}
