import { apiFetch } from './api.js'

export const RUNTIME_SETTINGS_PATH = '/api/tfd/system/runtime-settings/'
export const REGISTER_TIMEOUT_KEY = 'module_register_timeout_seconds'
export const REGISTER_TIMEOUT_MIN = 5
export const REGISTER_TIMEOUT_MAX = 300
export const REGISTER_TIMEOUT_DEFAULT = 30

// The server enforces the same rule. Here it only saves a round trip: a whole
// number from 5 to 300. Strings, floats, booleans and empty values are refused.
export function validateRegisterTimeout(value, { minimum = REGISTER_TIMEOUT_MIN, maximum = REGISTER_TIMEOUT_MAX } = {}) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { valid: false, message: `Enter a whole number of seconds from ${minimum} to ${maximum}.` }
  }
  if (value < minimum || value > maximum) {
    return { valid: false, message: `The limit must be from ${minimum} to ${maximum} seconds.` }
  }
  return { valid: true, message: '' }
}

// Superusers and holders of core.privileged_operations may change it, which is
// what Core 1.17.1 enforces. This only decides whether the form is shown; the
// backend refuses everyone else.
export function canEditRuntimeSettings(context = {}) {
  if (context?.user?.superuser === true) return true
  return Array.isArray(context?.permissions) && context.permissions.includes('core.privileged_operations')
}

export function normalizeRuntimeSettings(payload) {
  const entry = payload && typeof payload === 'object' ? payload[REGISTER_TIMEOUT_KEY] : null
  if (!entry || typeof entry !== 'object') return null
  const number = (value, fallback) => (Number.isInteger(value) ? value : fallback)
  return {
    value: number(entry.value, REGISTER_TIMEOUT_DEFAULT),
    minimum: number(entry.minimum, REGISTER_TIMEOUT_MIN),
    maximum: number(entry.maximum, REGISTER_TIMEOUT_MAX),
    default: number(entry.default, REGISTER_TIMEOUT_DEFAULT),
    updated_by: typeof payload.updated_by === 'string' ? payload.updated_by : null,
    updated_at: typeof payload.updated_at === 'string' ? payload.updated_at : null,
  }
}

// Returns null when this Core has no runtime-settings endpoint (404), so the
// caller can leave the card out on an older Core. Other errors are thrown.
export async function getRuntimeSettings({ api = apiFetch } = {}) {
  try {
    return normalizeRuntimeSettings(await api(RUNTIME_SETTINGS_PATH))
  } catch (error) {
    if (error?.status === 404) return null
    throw error
  }
}

// Core's 400, 403 and 429 messages reach the caller unchanged in error.message.
export async function saveRegisterTimeout(seconds, { api = apiFetch } = {}) {
  const check = validateRegisterTimeout(seconds)
  if (!check.valid) throw Object.assign(new Error(check.message), { status: 0, payload: null, code: null })
  const payload = await api(RUNTIME_SETTINGS_PATH, {
    method: 'PATCH',
    body: JSON.stringify({ [REGISTER_TIMEOUT_KEY]: seconds }),
  })
  return normalizeRuntimeSettings(payload)
}
