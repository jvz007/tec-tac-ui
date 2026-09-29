import { reactive } from 'vue'

function normalize(provider, source, begin) {
  if (!source || typeof source !== 'object') throw new Error('SSO provider registration requires a descriptor')
  const id = String(source.id || '').trim()
  const label = String(source.label || '').trim()
  if (!id) throw new Error(`module ${provider} attempted to register an SSO provider without an id`)
  if (!id.startsWith(`${provider}.`)) throw new Error(`SSO provider id ${id} must begin with ${provider}.`)
  if (!label) throw new Error(`SSO provider ${id} requires a label`)
  const handler = begin || source.begin
  if (typeof handler !== 'function') throw new Error(`SSO provider ${id} requires a begin(context) handler`)
  return {
    id,
    provider,
    label,
    description: String(source.description || '').trim(),
    icon: String(source.icon || '').trim(),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 500,
    visible: typeof source.visible === 'function' ? source.visible : null,
    begin: handler,
    metadata: source.metadata && typeof source.metadata === 'object' ? { ...source.metadata } : {},
  }
}

export function createSsoProviderRegistry() {
  const entries = new Map()
  const signal = reactive({ version: 0 })
  const touch = () => { signal.version += 1 }

  function evaluate(entry, context = {}) {
    if (!entry.visible) return true
    try { return entry.visible(context) !== false } catch { return false }
  }

  function list(context = {}) {
    void signal.version
    return [...entries.values()]
      .filter((entry) => evaluate(entry, context))
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
  }

  function forModule(provider) {
    const owned = new Set()
    return Object.freeze({
      register(source, begin) {
        const entry = normalize(provider, source, begin)
        const existing = entries.get(entry.id)
        if (existing && existing.provider !== provider) throw new Error(`SSO provider ${entry.id} is already owned by ${existing.provider}`)
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
      async begin(id, context = {}) {
        const entry = entries.get(String(id || ''))
        if (!entry || entry.provider !== provider) throw new Error(`SSO provider ${id} is not registered by ${provider}.`)
        if (!evaluate(entry, context)) throw new Error(`SSO provider ${id} is unavailable.`)
        return await entry.begin(context)
      },
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

  async function begin(id, context = {}) {
    const entry = entries.get(String(id || ''))
    if (!entry) throw new Error(`SSO provider ${id} is not registered.`)
    if (!evaluate(entry, context)) throw new Error(`SSO provider ${id} is unavailable.`)
    return await entry.begin(context)
  }

  return Object.freeze({
    forModule,
    list,
    begin,
    snapshot: () => list({}).map(({ begin, visible, ...entry }) => ({ ...entry })),
  })
}
