export const DEFAULT_MODULE_REGISTER_TIMEOUT_SECONDS = 30
export const MIN_MODULE_REGISTER_TIMEOUT_SECONDS = 5
export const MAX_MODULE_REGISTER_TIMEOUT_SECONDS = 300

// A whole number from 5 to 300, otherwise the default. Strings and booleans are
// not coerced: an unexpected type from the backend falls back to the default.
export function normalizeRegisterTimeoutSeconds(value) {
  return Number.isInteger(value)
    && value >= MIN_MODULE_REGISTER_TIMEOUT_SECONDS
    && value <= MAX_MODULE_REGISTER_TIMEOUT_SECONDS
    ? value
    : DEFAULT_MODULE_REGISTER_TIMEOUT_SECONDS
}

// Core's tactical_permissions: a plain object of can_* keys with strict boolean
// values. Anything else is dropped, never coerced.
export function normalizeTacticalPermissions(value) {
  const out = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [key, flag] of Object.entries(value)) {
    if (/^can_[a-z0-9_]+$/.test(key) && typeof flag === 'boolean') out[key] = flag
  }
  return out
}

export function emptyRuntimeContext(user = {}) {
  return {
    user: user || {},
    permissions: [],
    extensions: [],
    capabilities: null,
    module_status: [],
    modules: [],
    preferences: null,
    locale: null,
    timeZone: null,
    dateTimeFormat: null,
    tactical_ui: null,
    tactical_permissions: {},
    tactical_web_ui: { installed: false, url: null },
    preferences_initialized: false,
    preferences_updated_at: null,
    notice_unread_count: 0,
    module_register_timeout_seconds: DEFAULT_MODULE_REGISTER_TIMEOUT_SECONDS,
    // Set by state.js after normalizing; this file stays import-free.
    server_url: '',
  }
}

export function normalizeBackendRuntimeContext(richContext, browserUser = {}) {
  const source = richContext && typeof richContext === 'object' ? richContext : {}
  return {
    user: { ...(browserUser || {}), ...(source.user || {}) },
    permissions: Array.isArray(source.permissions) ? source.permissions : [],
    extensions: Array.isArray(source.extensions) ? source.extensions : [],
    capabilities: source.capabilities && typeof source.capabilities === 'object' ? source.capabilities : null,
    module_status: Array.isArray(source.module_status) ? source.module_status : [],
    modules: [],
    preferences: source.preferences || null,
    locale: typeof source.locale === 'string' && source.locale ? source.locale : null,
    timeZone: typeof source.timeZone === 'string' && source.timeZone ? source.timeZone : null,
    dateTimeFormat: typeof source.dateTimeFormat === 'string' && source.dateTimeFormat ? source.dateTimeFormat : null,
    tactical_ui: source.tactical_ui && typeof source.tactical_ui === 'object' ? source.tactical_ui : null,
    tactical_permissions: normalizeTacticalPermissions(source.tactical_permissions),
    tactical_web_ui: source.tactical_web_ui && typeof source.tactical_web_ui === 'object'
      ? { installed: source.tactical_web_ui.installed === true, url: typeof source.tactical_web_ui.url === 'string' ? source.tactical_web_ui.url : null }
      : { installed: false, url: null },
    preferences_initialized: source.preferences_initialized === true,
    preferences_updated_at: source.preferences_updated_at || null,
    notice_unread_count: Number(source.notice_unread_count || 0),
    module_register_timeout_seconds: normalizeRegisterTimeoutSeconds(source.module_register_timeout_seconds),
    server_url: '',
  }
}
