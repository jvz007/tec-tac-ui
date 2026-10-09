// Runtime helper for Core's server-side Tactical operations (AD-19):
//   POST /api/tfd/tactical-operations/<module_id>/<operation_id>/
// Import-free: the transport is injected, so no token or auth header is built here.

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
export const AUDIT_HEADER = 'X-Tec-Tac-Audit'

function refuse(message) {
  return Object.assign(new Error(message), { status: 0, payload: null, code: null })
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function checkId(label, value) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw refuse(`The ${label} must be letters, digits, "_" or "-" only, and start with a letter or digit.`)
  }
  return value
}

// Filename from Content-Disposition. filename* (RFC 5987) wins over filename.
export function parseContentDisposition(header) {
  if (typeof header !== 'string' || !header) return ''
  const star = /filename\*\s*=\s*([^;]+)/i.exec(header)
  if (star) {
    const raw = star[1].trim().replace(/^"|"$/g, '')
    const match = /^[^']*'[^']*'(.*)$/.exec(raw)
    const encoded = match ? match[1] : raw
    try { return decodeURIComponent(encoded) } catch { return encoded }
  }
  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header)
  if (quoted) return quoted[1].trim()
  const bare = /filename\s*=\s*([^;]+)/i.exec(header)
  return bare ? bare[1].trim() : ''
}

function isTextual(contentType) {
  const type = contentType.split(';')[0].trim().toLowerCase()
  if (!type) return true
  return type.startsWith('text/') || type === 'application/json' || type.endsWith('+json') || type === 'application/xml' || type.endsWith('+xml')
}

function auditValue(raw) {
  return raw === 'recorded' || raw === 'not-recorded' ? raw : ''
}

export function createTacticalOperation({ apiRaw } = {}) {
  return async function tacticalOperation(moduleId, operationId, options = {}) {
    checkId('module id', moduleId)
    checkId('operation id', operationId)
    const opts = options === undefined || options === null ? {} : options
    if (!isPlainObject(opts)) throw refuse('Tactical operation options must be an object.')
    const { params = {}, body = {}, signal } = opts
    if (!isPlainObject(params)) throw refuse('Tactical operation params must be a plain object.')
    for (const [key, value] of Object.entries(params)) {
      const ok = typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
      if (!ok) throw refuse(`Tactical operation param "${key}" must be a string or a number.`)
    }
    if (!isPlainObject(body)) throw refuse('Tactical operation body must be a plain object.')

    const path = `/api/tfd/tactical-operations/${encodeURIComponent(moduleId)}/${encodeURIComponent(operationId)}/`
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params, body }),
    }
    if (signal) init.signal = signal
    const response = await apiRaw(path, init)

    const contentType = response.headers.get('content-type') || ''
    const contentDisposition = response.headers.get('content-disposition') || ''
    const audit = auditValue(response.headers.get(AUDIT_HEADER))
    const result = {
      ok: true,
      status: response.status,
      data: null,
      blob: null,
      contentType,
      contentDisposition,
      filename: parseContentDisposition(contentDisposition),
      audit,
      auditRecorded: audit === 'recorded' ? true : (audit === 'not-recorded' ? false : null),
    }
    if (response.status === 204) return result
    const attachment = /^\s*attachment/i.test(contentDisposition)
    if (attachment || !isTextual(contentType)) {
      result.blob = await response.blob()
      return result
    }
    const text = await response.text()
    if (text === '') return result
    if (contentType.toLowerCase().includes('json')) {
      try { result.data = JSON.parse(text) } catch { result.data = text }
    } else {
      result.data = text
    }
    return result
  }
}
