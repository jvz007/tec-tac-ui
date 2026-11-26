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

// System name (Core 1.17.23): the name an authenticator app shows beside the account. Core stays the authority; this
// check only saves a round trip, and Core's own refusal text is shown as sent.
export const SYSTEM_NAME_KEY = 'system_name'
export const SYSTEM_NAME_DEFAULT = 'Tec-Tac'
export const SYSTEM_NAME_MAX = 60
const SYSTEM_NAME_INVISIBLE = new RegExp('[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u2060-\u2064\ufeff]')

// { value, maximum_length, default } from a runtime-settings answer, or null when this Core sends no system_name.
export function normalizeSystemName(payload) {
  const entry = payload && typeof payload === 'object' ? payload[SYSTEM_NAME_KEY] : null
  if (!entry || typeof entry !== 'object' || typeof entry.value !== 'string') return null
  return {
    value: entry.value,
    maximum_length: Number.isInteger(entry.maximum_length) ? entry.maximum_length : SYSTEM_NAME_MAX,
    default: typeof entry.default === 'string' && entry.default ? entry.default : SYSTEM_NAME_DEFAULT,
  }
}

export function validateSystemName(value, { maximum = SYSTEM_NAME_MAX } = {}) {
  if (typeof value !== 'string') return { valid: false, message: 'Enter a name.' }
  const name = value.trim()
  if (!name) return { valid: false, message: 'Enter a name.' }
  if (name.length > maximum) return { valid: false, message: `The name can be up to ${maximum} characters.` }
  if (name.includes(':')) return { valid: false, message: 'The name cannot contain a colon.' }
  if (SYSTEM_NAME_INVISIBLE.test(name)) return { valid: false, message: 'The name cannot contain control or invisible characters.' }
  return { valid: true, message: '' }
}

// Core's 400 and 403 messages reach the caller unchanged in error.message.
export async function saveSystemName(name, { api = apiFetch } = {}) {
  const check = validateSystemName(name)
  if (!check.valid) throw Object.assign(new Error(check.message), { status: 0, payload: null, code: null })
  return normalizeSystemName(await api(RUNTIME_SETTINGS_PATH, {
    method: 'PATCH',
    body: JSON.stringify({ [SYSTEM_NAME_KEY]: name.trim() }),
  }))
}

// Core 1.17.24 answers 403 to a system name change unless the caller is an effective superuser (AD-12). Display only:
// the form shows for a superuser; everyone else sees the name read-only and Core refuses a stale session.
export function canEditSystemName(context = {}) {
  return context?.user?.superuser === true
}

// JSON null puts the name back to the default.
export async function resetSystemName({ api = apiFetch } = {}) {
  return normalizeSystemName(await api(RUNTIME_SETTINGS_PATH, {
    method: 'PATCH',
    body: JSON.stringify({ [SYSTEM_NAME_KEY]: null }),
  }))
}

// Engineer Console certificate validity (Core 1.18.52): whole days, 1 to 730, 365 by default. It affects new certificates only.
// Only an effective superuser changes it. Core refuses null and anyone else; the check here only saves a round trip and
// Core's 400 and 403 text is shown as sent. There is no reset button, so null is never sent.
export const CONSOLE_CERT_VALIDITY_KEY = 'console_certificate_validity_days'
export const CONSOLE_CERT_VALIDITY_MIN = 1
export const CONSOLE_CERT_VALIDITY_MAX = 730
export const CONSOLE_CERT_VALIDITY_DEFAULT = 365

// { value, minimum, maximum, default } from a runtime-settings answer, or null when the key is absent (an older Core).
export function normalizeConsoleCertValidity(payload) {
  const entry = payload && typeof payload === 'object' ? payload[CONSOLE_CERT_VALIDITY_KEY] : null
  if (!entry || typeof entry !== 'object') return null
  const number = (value, fallback) => (Number.isInteger(value) ? value : fallback)
  return {
    value: number(entry.value, CONSOLE_CERT_VALIDITY_DEFAULT),
    minimum: number(entry.minimum, CONSOLE_CERT_VALIDITY_MIN),
    maximum: number(entry.maximum, CONSOLE_CERT_VALIDITY_MAX),
    default: number(entry.default, CONSOLE_CERT_VALIDITY_DEFAULT),
  }
}

export function validateConsoleCertValidity(value, { minimum = CONSOLE_CERT_VALIDITY_MIN, maximum = CONSOLE_CERT_VALIDITY_MAX } = {}) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { valid: false, message: `Enter a whole number of days from ${minimum} to ${maximum}.` }
  }
  if (value < minimum || value > maximum) {
    return { valid: false, message: `The validity must be from ${minimum} to ${maximum} days.` }
  }
  return { valid: true, message: '' }
}

// Display only: the form shows for a superuser; Core refuses everyone else.
export function canEditConsoleCertValidity(context = {}) {
  return context?.user?.superuser === true
}

export async function saveConsoleCertValidity(days, { api = apiFetch } = {}) {
  const check = validateConsoleCertValidity(days)
  if (!check.valid) throw Object.assign(new Error(check.message), { status: 0, payload: null, code: null })
  const payload = await api(RUNTIME_SETTINGS_PATH, {
    method: 'PATCH',
    body: JSON.stringify({ [CONSOLE_CERT_VALIDITY_KEY]: days }),
  })
  return normalizeConsoleCertValidity(payload)
}

// Console web address (Core 1.18.58): the Tec-Tac web address the Engineer Console opens for its sign-in. Core stays the
// authority for the address rules (https only, no user name, query or fragment, path empty or /tec-tac). Here only the
// length is checked, to save a round trip; Core's 400 text is shown as sent. Only a superuser changes it (display only).
export const CONSOLE_UI_URL_KEY = 'console_ui_url'
export const CONSOLE_UI_URL_MAX = 300

// { value, maximum_length, default } from a runtime-settings answer, or null when the key is absent (an older Core).
export function normalizeConsoleUiUrl(payload) {
  const entry = payload && typeof payload === 'object' ? payload[CONSOLE_UI_URL_KEY] : null
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  return {
    value: typeof entry.value === 'string' ? entry.value : '',
    maximum_length: Number.isInteger(entry.maximum_length) ? entry.maximum_length : CONSOLE_UI_URL_MAX,
    default: '',
  }
}

export function validateConsoleUiUrl(text, { maximum = CONSOLE_UI_URL_MAX } = {}) {
  const value = typeof text === 'string' ? text.trim() : ''
  if (value.length > maximum) return { valid: false, message: `The address must be at most ${maximum} characters.` }
  return { valid: true, message: '' }
}

export function canEditConsoleUiUrl(context = {}) {
  return context?.user?.superuser === true
}

// One key only: Core refuses a mixed body whole for a non-superuser. Empty or blank text is sent as null, which resets it.
export async function saveConsoleUiUrl(text, { api = apiFetch } = {}) {
  const value = typeof text === 'string' ? text.trim() : ''
  const payload = await api(RUNTIME_SETTINGS_PATH, {
    method: 'PATCH',
    body: JSON.stringify({ [CONSOLE_UI_URL_KEY]: value === '' ? null : value }),
  })
  return normalizeConsoleUiUrl(payload)
}
