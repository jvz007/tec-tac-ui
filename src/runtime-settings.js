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

// Superusers and holders of core.privileged_operations or
// core.runtime_settings.manage see the edit forms (Core 1.17.2). The permission
// list is the effective set Core puts in context.permissions. This only decides
// whether a form is shown; the backend refuses everyone else.
export const RUNTIME_SETTINGS_PERMISSIONS = Object.freeze(['core.privileged_operations', 'core.runtime_settings.manage'])
export function canEditRuntimeSettings(context = {}) {
  if (context?.user?.superuser === true) return true
  const held = Array.isArray(context?.permissions) ? context.permissions : []
  return RUNTIME_SETTINGS_PERMISSIONS.some((code) => held.includes(code))
}

// Only a superuser changes the update source (Core 1.17.5 enforces it). The
// System Updates page hides the source controls for everyone else. This is
// display only; the backend refuses the save.
export function canChangeUpdateSource(context = {}) {
  return context?.user?.superuser === true
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

// The raw answer of GET runtime-settings, or null when this Core has no such endpoint (404), so the
// caller can leave the cards out on an older Core. Other errors are thrown.
export async function getRuntimeSettingsPayload({ api = apiFetch } = {}) {
  try {
    return await api(RUNTIME_SETTINGS_PATH)
  } catch (error) {
    if (error?.status === 404) return null
    throw error
  }
}

// Returns null when this Core has no runtime-settings endpoint (404), so the
// caller can leave the card out on an older Core. Other errors are thrown.
export async function getRuntimeSettings({ api = apiFetch } = {}) {
  return normalizeRuntimeSettings(await getRuntimeSettingsPayload({ api }))
}

// The Tactical operation upload ceiling (Core 1.17.14, CQ40 and CQ44): whole MiB, 1 to 25, 10 by default.
// Only a superuser changes it. Core answers anyone else with 403 for this key.
export const UPLOAD_LIMIT_KEY = 'tactical_operation_upload_max_mib'
export const UPLOAD_LIMIT_MIN = 1
export const UPLOAD_LIMIT_MAX = 25
export const UPLOAD_LIMIT_DEFAULT = 10

// Display only: the superuser check decides whether the form shows. The backend refuses everyone else.
export function canEditUploadLimit(context = {}) {
  return context?.user?.superuser === true
}

export function uploadLimitDefaultText(value = UPLOAD_LIMIT_DEFAULT) {
  return `${value} MiB by default`
}

export function uploadLimitRangeText(minimum = UPLOAD_LIMIT_MIN, maximum = UPLOAD_LIMIT_MAX) {
  return `${minimum} to ${maximum} MiB`
}

export function validateUploadLimit(value, { minimum = UPLOAD_LIMIT_MIN, maximum = UPLOAD_LIMIT_MAX } = {}) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { valid: false, message: `Enter a whole number of MiB from ${minimum} to ${maximum}.` }
  }
  if (value < minimum || value > maximum) {
    return { valid: false, message: `The limit must be from ${minimum} to ${maximum} MiB.` }
  }
  return { valid: true, message: '' }
}

// { value, minimum, maximum, default } from a runtime-settings answer, or null when the key is absent.
export function normalizeUploadLimit(payload) {
  const entry = payload && typeof payload === 'object' ? payload[UPLOAD_LIMIT_KEY] : null
  if (!entry || typeof entry !== 'object') return null
  const number = (value, fallback) => (Number.isInteger(value) ? value : fallback)
  return {
    value: number(entry.value, UPLOAD_LIMIT_DEFAULT),
    minimum: number(entry.minimum, UPLOAD_LIMIT_MIN),
    maximum: number(entry.maximum, UPLOAD_LIMIT_MAX),
    default: number(entry.default, UPLOAD_LIMIT_DEFAULT),
  }
}

// Core's 400 and 403 messages reach the caller unchanged in error.message.
export async function saveUploadLimit(mib, { api = apiFetch } = {}) {
  const check = validateUploadLimit(mib)
  if (!check.valid) throw Object.assign(new Error(check.message), { status: 0, payload: null, code: null })
  const payload = await api(RUNTIME_SETTINGS_PATH, {
    method: 'PATCH',
    body: JSON.stringify({ [UPLOAD_LIMIT_KEY]: mib }),
  })
  return normalizeUploadLimit(payload)
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
