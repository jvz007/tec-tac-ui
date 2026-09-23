const FORBIDDEN_EVENT_FIELDS = new Set([
  'module_id', 'module_version', 'username', 'actor', 'user', 'source', 'request_id', 'correlation_id',
])

function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('audit.record(event) requires an event object')
  for (const key of Object.keys(event)) {
    if (FORBIDDEN_EVENT_FIELDS.has(key)) throw new Error(`audit field ${key} is Core-owned and may not be supplied by a module`)
  }
  if (!String(event.action || '').trim()) throw new Error('audit action is required')
  if (!String(event.object_type || '').trim()) throw new Error('audit object_type is required')
}

export function createAuditService(api) {
  if (typeof api !== 'function') throw new Error('createAuditService requires the Core authenticated api helper')

  function forModule(moduleId) {
    const owner = String(moduleId || '').trim()
    if (!owner) throw new Error('audit module owner is required')
    return Object.freeze({
      async record(event) {
        validateEvent(event)
        try {
          return await api('/api/tfd/audit/record/', {
            method: 'POST',
            body: JSON.stringify({ module_id: owner, ...event }),
          })
        } catch (error) {
          // Audit persistence is deliberately non-fatal for normal module UI
          // actions. Core/server logs remain the durable failure signal.
          console.error(`[TEC-TAC-AUDIT] Audit write failed for module ${owner}.`, error)
          return {
            recorded: false,
            error: 'audit_service_unavailable',
            error_type: error?.name || 'Error',
            module_id: owner,
          }
        }
      },
    })
  }

  return Object.freeze({ forModule })
}
