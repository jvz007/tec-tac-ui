export function createKeyedLatestRequestGate(keys = []) {
  const active = new Map(keys.map((key) => [String(key), 0]))
  return {
    begin(key) {
      const normalized = String(key)
      const next = Number(active.get(normalized) || 0) + 1
      active.set(normalized, next)
      return next
    },
    isCurrent(key, requestId) {
      return Number(active.get(String(key)) || 0) === Number(requestId)
    },
    invalidate(key) {
      const normalized = String(key)
      active.set(normalized, Number(active.get(normalized) || 0) + 1)
    },
  }
}
