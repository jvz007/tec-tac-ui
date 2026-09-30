function normalizeVersion(value) {
  const text = String(value || '').trim().replace(/^v/i, '')
  const match = text.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+.](.*))?$/)
  if (!match) return null
  return [Number(match[1] || 0), Number(match[2] || 0), Number(match[3] || 0), match[4] || '']
}

function compareVersions(left, right) {
  const a = normalizeVersion(left)
  const b = normalizeVersion(right)
  if (!a || !b) return null
  for (let i = 0; i < 3; i += 1) {
    if (a[i] < b[i]) return -1
    if (a[i] > b[i]) return 1
  }
  if (a[3] === b[3]) return 0
  if (!a[3]) return 1
  if (!b[3]) return -1
  return a[3] < b[3] ? -1 : 1
}

function satisfiesOne(version, expression) {
  const match = String(expression || '').trim().match(/^(==|!=|>=|<=|>|<)?\s*([^\s]+)$/)
  if (!match) return false
  const [, rawOp, wanted] = match
  const cmp = compareVersions(version, wanted)
  if (cmp == null) return false
  const op = rawOp || '=='
  return ({ '==': cmp === 0, '!=': cmp !== 0, '>': cmp > 0, '>=': cmp >= 0, '<': cmp < 0, '<=': cmp <= 0 })[op]
}

export function createModuleStatusService(snapshot = [], activeDescriptors = []) {
  const rows = new Map()

  for (const value of Array.isArray(snapshot) ? snapshot : []) {
    const id = String(value?.id || '').trim()
    if (!id) continue
    rows.set(id, Object.freeze({
      id,
      version: String(value.version || '0.0.0'),
      installed: value.installed !== false,
      enabled: value.enabled !== false,
      active: value.active !== false && value.enabled !== false,
      legacy: value.legacy === true,
    }))
  }

  // Compatibility fallback for older Core versions: the deployed UI manifest
  // only contains modules that are active, so it can safely prove active=true
  // even though it cannot distinguish missing from installed-but-disabled.
  for (const descriptor of Array.isArray(activeDescriptors) ? activeDescriptors : []) {
    const id = String(descriptor?.id || '').trim()
    if (!id || rows.has(id)) continue
    rows.set(id, Object.freeze({
      id,
      version: String(descriptor.version || '0.0.0'),
      installed: true,
      enabled: true,
      active: true,
      legacy: false,
    }))
  }

  const get = (moduleId) => rows.get(String(moduleId || '').trim()) || null
  const list = () => [...rows.values()]

  return Object.freeze({
    list,
    get,
    has(moduleId) { return Boolean(get(moduleId)?.installed) },
    isInstalled(moduleId) { return Boolean(get(moduleId)?.installed) },
    isEnabled(moduleId) { return Boolean(get(moduleId)?.enabled) },
    isActive(moduleId) { return Boolean(get(moduleId)?.installed && get(moduleId)?.enabled && get(moduleId)?.active) },
    version(moduleId) { return get(moduleId)?.version || null },
    satisfies(moduleId, constraint) {
      const version = get(moduleId)?.version
      const raw = String(constraint || '').trim()
      if (!version) return false
      if (!raw || raw === '*') return true
      return raw.split(',').every((part) => satisfiesOne(version, part))
    },
  })
}
