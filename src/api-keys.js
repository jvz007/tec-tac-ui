// API keys (0.12.100, Core 1.17.26): pure helpers for the Access area's API keys tab. Tactical's own routes do the work:
// GET and POST /accounts/apikeys/, PUT and DELETE /accounts/apikeys/{id}/. The browser never sends `key` on a write; Tactical
// makes the value and drops any key it is sent on edit. Tactical's flags are read strictly from context.tactical_permissions.

export const API_KEY_NAME_MAX = 25
export const API_KEY_REDACTED = '[REDACTED]'

// Tactical's flag test: only the boolean true counts. A string, a number, null or a missing key hides the control.
export function canListApiKeys(context) {
  return context?.tactical_permissions?.can_list_api_keys === true
}

export function canManageApiKeys(context) {
  return context?.tactical_permissions?.can_manage_api_keys === true
}

// Core's account protection shows this value for a protected owner's key. It is text, never a key to copy.
export function isRedacted(value) {
  return value === API_KEY_REDACTED
}

export function normalizeApiKeys(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((row) => row && typeof row === 'object' && row.id !== undefined && row.id !== null)
    .map((row) => ({
      id: row.id,
      name: typeof row.name === 'string' ? row.name : '',
      username: typeof row.username === 'string' ? row.username : '',
      user: row.user ?? null,
      expiration: typeof row.expiration === 'string' && row.expiration ? row.expiration : null,
      key: typeof row.key === 'string' ? row.key : '',
    }))
}

// The name is the one plain rule Tactical has (unique, at most 25 characters). Blank is refused here, before any call.
export function apiKeyNameError(name) {
  const value = String(name ?? '').trim()
  if (!value) return 'Enter a name for the key.'
  if (value.length > API_KEY_NAME_MAX) return `The name can be at most ${API_KEY_NAME_MAX} characters.`
  return ''
}

// The expiry input is a local date and time. Blank means the key never expires (Tactical's null).
// Returns { iso, error }: iso is an ISO 8601 string or null; error is set when the text is not a date.
export function expiryFromLocal(value) {
  const text = String(value ?? '').trim()
  if (!text) return { iso: null, error: '' }
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return { iso: null, error: 'Enter a valid expiry date and time, or leave it blank.' }
  return { iso: date.toISOString(), error: '' }
}

// The reverse for the edit form: an ISO string from Tactical becomes the local text a datetime-local input shows.
export function expiryToLocal(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function keyBody({ name, ownerId, expiration }) {
  const owner = Number(ownerId)
  if (!Number.isInteger(owner) || owner < 1) throw new TypeError('An API key needs an owner (a Tactical user id).')
  return {
    name: String(name ?? '').trim(),
    user: owner,
    expiration: expiration || null,
  }
}

// Create body: name, user (the owner's Tactical id) and expiration (ISO or null). Never a key.
export function buildCreatePayload(input) {
  return keyBody(input)
}

// Edit body: the same three fields. `key` is never sent; Tactical drops it anyway, and Core audits it as never read.
export function buildUpdatePayload(input) {
  return keyBody(input)
}

// After a create, Tactical answers plain text and no key. The page re-reads the list and finds the new row by name and owner.
export function findCreatedKey(list, name, ownerId) {
  const wanted = String(name ?? '').trim()
  const owner = Number(ownerId)
  return normalizeApiKeys(list).find((row) => row.name === wanted && Number(row.user) === owner) || null
}

// The message for a failed call. Tactical answers a field error as { name: ['...'] }, Core as { detail: '...' }.
export function apiKeyErrorText(error, fallback = 'The API key could not be saved.') {
  const payload = error?.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (typeof payload.detail === 'string' && payload.detail.trim()) return payload.detail.trim()
    for (const [field, messages] of Object.entries(payload)) {
      if (Array.isArray(messages) && typeof messages[0] === 'string') {
        const label = field === 'user' ? 'Owner' : field.charAt(0).toUpperCase() + field.slice(1)
        return `${label}: ${messages[0]}`
      }
    }
  }
  if (typeof payload === 'string' && payload.trim()) return payload.trim()
  return error?.message || fallback
}
