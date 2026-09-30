import { reactive } from 'vue'

function normalize(provider, source, legacyBegin, { allowModuleBegin }) {
  if (!source || typeof source !== 'object') throw new Error('SSO provider registration requires a descriptor')
  const id = String(source.id || '').trim()
  const label = String(source.label || '').trim()
  if (!id) throw new Error(`module ${provider} attempted to register an SSO provider without an id`)
  if (!id.startsWith(`${provider}.`)) throw new Error(`SSO provider id ${id} must begin with ${provider}.`)
  if (!label) throw new Error(`SSO provider ${id} requires a label`)

  const providerId = String(source.provider_id || source.providerId || source.tactical_provider_id || '').trim()
  const moduleBegin = legacyBegin || source.begin
  if (!allowModuleBegin && typeof moduleBegin === 'function') {
    throw new Error(`SSO provider ${id} must not supply begin(); Core owns Tactical SSO initiation. Register provider_id instead.`)
  }
  if (!providerId && !allowModuleBegin) {
    throw new Error(`SSO provider ${id} requires Tactical provider_id`)
  }
  if (!providerId && typeof moduleBegin !== 'function') {
    throw new Error(`SSO provider ${id} requires Tactical provider_id`)
  }

  return {
    id,
    provider,
    provider_id: providerId || null,
    label,
    description: String(source.description || '').trim(),
    icon: String(source.icon || '').trim(),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 500,
    visible: typeof source.visible === 'function' ? source.visible : null,
    begin: allowModuleBegin && typeof moduleBegin === 'function' ? moduleBegin : null,
    metadata: source.metadata && typeof source.metadata === 'object' ? { ...source.metadata } : {},
  }
}

export function createSsoProviderRegistry({ beginProvider = null, allowModuleBegin = beginProvider == null } = {}) {
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

  async function start(entry, context = {}) {
    if (typeof beginProvider === 'function') {
      if (!entry.provider_id) throw new Error(`SSO provider ${entry.id} does not declare Tactical provider_id.`)
      return await beginProvider(entry, context)
    }
    if (typeof entry.begin === 'function') return await entry.begin(context)
    throw new Error(`SSO provider ${entry.id} cannot be started.`)
  }

  function forModule(provider) {
    const owned = new Set()
    return Object.freeze({
      register(source, begin) {
        const entry = normalize(provider, source, begin, { allowModuleBegin })
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
        return await start(entry, context)
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
    return await start(entry, context)
  }

  return Object.freeze({
    forModule,
    list,
    begin,
    snapshot: () => list({}).map(({ begin, visible, ...entry }) => ({ ...entry })),
  })
}
