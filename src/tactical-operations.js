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

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const MAX_QUERY_KEYS = 16
const MAX_QUERY_VALUE = 512
const MAX_FILE_NAME = 255
const RESERVED_PARTS = ['params', 'body', 'query']

// query: a flat object of at most 16 keys; each value a string or a finite whole number, as text of at most 512 characters.
function checkQuery(query) {
  if (!isPlainObject(query)) throw refuse('Tactical operation query must be a plain object.')
  const entries = Object.entries(query)
  if (entries.length > MAX_QUERY_KEYS) throw refuse(`Tactical operation query may have at most ${MAX_QUERY_KEYS} names.`)
  for (const [key, value] of entries) {
    if (!ID_PATTERN.test(key)) throw refuse(`Tactical operation query name "${key}" must be letters, digits, "_" or "-" only, and start with a letter or digit.`)
    const ok = typeof value === 'string' || (typeof value === 'number' && Number.isInteger(value))
    if (!ok) throw refuse(`Tactical operation query "${key}" must be a string or a whole number.`)
    const rendered = String(value)
    if (rendered.length > MAX_QUERY_VALUE) throw refuse(`Tactical operation query "${key}" must be at most ${MAX_QUERY_VALUE} characters.`)
    if (CONTROL.test(rendered)) throw refuse(`Tactical operation query "${key}" must not contain control characters.`)
  }
  return query
}

// file: a File, or a Blob with a non-empty name. Anything else is refused.
function checkFile(file) {
  const isBlob = typeof Blob !== 'undefined' && file instanceof Blob
  const name = isBlob ? file.name : undefined
  if (!isBlob || typeof name !== 'string' || !name) throw refuse('Tactical operation file must be a File or a Blob with a name.')
  if (name.length > MAX_FILE_NAME) throw refuse(`Tactical operation file name must be at most ${MAX_FILE_NAME} characters.`)
  if (CONTROL.test(name)) throw refuse('Tactical operation file name must not contain control characters.')
  // The text parts use these names; a file named like one would be read as that part.
  if (RESERVED_PARTS.includes(name)) throw refuse(`Tactical operation file name must not be "${name}", which is the name of a text part. Rename the file.`)
  return file
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
    const { params = {}, body = {}, query, file, signal } = opts
    if (!isPlainObject(params)) throw refuse('Tactical operation params must be a plain object.')
    for (const [key, value] of Object.entries(params)) {
      const ok = typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
      if (!ok) throw refuse(`Tactical operation param "${key}" must be a string or a number.`)
    }
    if (!isPlainObject(body)) throw refuse('Tactical operation body must be a plain object.')
    if (query !== undefined) checkQuery(query)
    if (file !== undefined) checkFile(file)

    const path = `/api/tfd/tactical-operations/${encodeURIComponent(moduleId)}/${encodeURIComponent(operationId)}/`
    let init
    if (file !== undefined) {
      // multipart/form-data: no Content-Type header, so the browser writes the boundary.
      // The part is named after the file and carries the same filename.
      const form = new FormData()
      form.append('params', JSON.stringify(params))
      form.append('body', JSON.stringify(body))
      if (query !== undefined) form.append('query', JSON.stringify(query))
      form.append(file.name, file, file.name)
      init = { method: 'POST', body: form }
    } else {
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query === undefined ? { params, body } : { params, body, query }),
      }
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
