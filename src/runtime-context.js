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
    tactical_web_ui: { installed: false, url: null },
    preferences_initialized: false,
    preferences_updated_at: null,
    notice_unread_count: 0,
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
    tactical_web_ui: source.tactical_web_ui && typeof source.tactical_web_ui === 'object'
      ? { installed: source.tactical_web_ui.installed === true, url: typeof source.tactical_web_ui.url === 'string' ? source.tactical_web_ui.url : null }
      : { installed: false, url: null },
    preferences_initialized: source.preferences_initialized === true,
    preferences_updated_at: source.preferences_updated_at || null,
    notice_unread_count: Number(source.notice_unread_count || 0),
  }
}
