import { reactive } from 'vue'
import { apiFetch } from './api'
import { normalizeSessionTheme } from './runtime-context'

export const DEFAULT_USER_PREFERENCES = Object.freeze({
  appearance: { theme: 'dark', font_scale: 1 },
  navigation: {
    order: {},
    section_order: [],
    favorites: [],
    collapsed_sections: {},
    rail_collapsed: false,
  },
  dashboard: {
    default_dashboard_id: null,
    last_dashboard_id: null,
    restore_last_dashboard: true,
  },
  extensions: {},
})

function clone(value) { return JSON.parse(JSON.stringify(value)) }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }

function normalize(value = {}) {
  const source = object(value)
  const appearance = object(source.appearance)
  const navigation = object(source.navigation)
  const dashboard = object(source.dashboard)
  return {
    appearance: {
      theme: ['dark', 'light', 'high-contrast'].includes(appearance.theme) ? appearance.theme : 'dark',
      font_scale: [0.9, 1, 1.1, 1.2].includes(Number(appearance.font_scale)) ? Number(appearance.font_scale) : 1,
    },
    navigation: {
      order: object(navigation.order),
      section_order: Array.isArray(navigation.section_order) ? [...new Set(navigation.section_order.filter((item) => typeof item === 'string' && item))] : [],
      favorites: Array.isArray(navigation.favorites) ? [...new Set(navigation.favorites.filter((item) => typeof item === 'string' && item))] : [],
      collapsed_sections: Object.fromEntries(Object.entries(object(navigation.collapsed_sections)).filter(([, v]) => typeof v === 'boolean')),
      rail_collapsed: navigation.rail_collapsed === true,
    },
    dashboard: {
      default_dashboard_id: typeof dashboard.default_dashboard_id === 'string' ? dashboard.default_dashboard_id : null,
      last_dashboard_id: typeof dashboard.last_dashboard_id === 'string' ? dashboard.last_dashboard_id : null,
      restore_last_dashboard: dashboard.restore_last_dashboard !== false,
    },
    extensions: object(source.extensions),
  }
}

function legacySnapshot(username) {
  let collapsed = {}
  let nav = {}
  try { collapsed = JSON.parse(localStorage.getItem('tec_tac_nav_sections') || '{}') || {} } catch { collapsed = {} }
  try { nav = JSON.parse(localStorage.getItem(`tec_tac_nav_preferences:${username}`) || '{}') || {} } catch { nav = {} }
  return normalize({
    appearance: { theme: localStorage.getItem('tec_tac_theme') || 'dark', font_scale: Number(localStorage.getItem('tec_tac_font_scale') || '1') },
    navigation: {
      order: object(nav.order),
      section_order: Array.isArray(nav.section_order) ? nav.section_order : [],
      favorites: Array.isArray(nav.favorites) ? nav.favorites : [],
      collapsed_sections: object(collapsed),
      rail_collapsed: localStorage.getItem('tec_tac_nav_rail_collapsed') === '1',
    },
  })
}

function hasLegacyCustomizations(username) {
  return Boolean(
    localStorage.getItem('tec_tac_theme') ||
    localStorage.getItem('tec_tac_font_scale') ||
    localStorage.getItem('tec_tac_nav_rail_collapsed') ||
    localStorage.getItem('tec_tac_nav_sections') ||
    localStorage.getItem(`tec_tac_nav_preferences:${username}`)
  )
}

function writeLegacyCache(preferences, username) {
  localStorage.setItem('tec_tac_theme', preferences.appearance.theme)
  localStorage.setItem('tec_tac_font_scale', String(preferences.appearance.font_scale || 1))
  localStorage.setItem('tec_tac_nav_rail_collapsed', preferences.navigation.rail_collapsed ? '1' : '0')
  localStorage.setItem('tec_tac_nav_sections', JSON.stringify(preferences.navigation.collapsed_sections))
  if (username) {
    localStorage.setItem(`tec_tac_nav_preferences:${username}`, JSON.stringify({
      order: preferences.navigation.order,
      section_order: preferences.navigation.section_order,
      favorites: preferences.navigation.favorites,
    }))
  }
}

const cachedTheme = localStorage.getItem('tec_tac_theme') || 'dark'
const cachedFontScale = Number(localStorage.getItem('tec_tac_font_scale') || '1')
export const preferenceState = reactive({
  initialized: false,
  loading: false,
  saving: false,
  error: '',
  username: '',
  updatedAt: null,
  // Core 1.17.24 (CO9): the header theme for this session. null means the saved theme is in effect.
  sessionTheme: null,
  // True when the last clearSessionTheme could not reach Core: the old header theme may return after a refresh.
  sessionThemeClearFailed: false,
  preferences: normalize({ appearance: { theme: cachedTheme, font_scale: cachedFontScale } }),
})

// The theme in effect: the session theme when one is chosen, else the saved theme. Only the saved theme is written to
// Core's preferences or to browser storage; Save preferences makes a theme permanent.
export function effectiveTheme() {
  return preferenceState.sessionTheme ?? preferenceState.preferences.appearance.theme
}

let saveTimer = null

function replacePreferences(preferences, { updatedAt = null } = {}) {
  preferenceState.preferences = normalize(preferences)
  preferenceState.updatedAt = updatedAt
  writeLegacyCache(preferenceState.preferences, preferenceState.username)
}

export async function initializeUserPreferences(context) {
  // A page refresh keeps the session theme Core holds for this session (CO9).
  preferenceState.sessionTheme = normalizeSessionTheme(context?.session_theme)
  const username = String(context?.user?.username || localStorage.getItem('user_name') || '').trim()
  if (!username) return preferenceState.preferences
  preferenceState.username = username
  preferenceState.loading = true
  preferenceState.error = ''
  try {
    if (context?.preferences_initialized === false && hasLegacyCustomizations(username)) {
      const migrated = legacySnapshot(username)
      const response = await apiFetch('/api/tfd/ui/preferences/', {
        method: 'PUT',
        body: JSON.stringify({ preferences: migrated }),
      })
      replacePreferences(response?.preferences || migrated, { updatedAt: response?.updated_at || null })
    } else {
      replacePreferences(context?.preferences || DEFAULT_USER_PREFERENCES, { updatedAt: context?.preferences_updated_at || null })
    }
    preferenceState.initialized = true
  } catch (error) {
    // Keep the local cache usable if the preference API is temporarily unavailable.
    replacePreferences(legacySnapshot(username))
    preferenceState.error = error?.message || 'Unable to load user preferences.'
  } finally {
    preferenceState.loading = false
  }
  return preferenceState.preferences
}

export async function saveUserPreferences(preferences = preferenceState.preferences) {
  preferenceState.saving = true
  preferenceState.error = ''
  try {
    const normalized = normalize(preferences)
    const response = await apiFetch('/api/tfd/ui/preferences/', {
      method: 'PUT',
      body: JSON.stringify({ preferences: normalized }),
    })
    replacePreferences(response?.preferences || normalized, { updatedAt: response?.updated_at || null })
    preferenceState.initialized = true
    return preferenceState.preferences
  } catch (error) {
    preferenceState.error = error?.message || 'Unable to save user preferences.'
    throw error
  } finally {
    preferenceState.saving = false
  }
}

// The header theme for this session (CO9). It applies at once and Core keeps it for a page refresh. It is never written
// to the saved preferences, so the next autosave, the menu layout and the Preferences page keep the saved theme. If Core
// does not take the choice, it still applies on this page load only and nothing is saved.
export async function setSessionTheme(value) {
  const theme = normalizeSessionTheme(value)
  if (!theme) return effectiveTheme()
  preferenceState.sessionTheme = theme
  try {
    await apiFetch('/api/tfd/session/theme/', {
      method: 'PUT',
      body: JSON.stringify({ theme }),
    })
  } catch {
    // Kept in memory for this page load. Not saved, not kept for a refresh.
  }
  return effectiveTheme()
}

// Back to the saved theme. Save preferences calls this after it saves the theme on the page.
// A failed DELETE never throws: the saved preferences already worked. The page shows the theme the person saved, and
// sessionThemeClearFailed tells the caller to say the old header theme may return on refresh.
export async function clearSessionTheme() {
  preferenceState.sessionTheme = null
  preferenceState.sessionThemeClearFailed = false
  try {
    await apiFetch('/api/tfd/session/theme/', { method: 'DELETE' })
  } catch {
    preferenceState.sessionThemeClearFailed = true
  }
  return effectiveTheme()
}

export function schedulePreferenceSave(delay = 250) {
  writeLegacyCache(preferenceState.preferences, preferenceState.username)
  if (!preferenceState.initialized) return
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    saveUserPreferences().catch(() => {})
  }, delay)
}

export function updateUserPreferences(mutator, { save = true } = {}) {
  const next = clone(preferenceState.preferences)
  const changed = typeof mutator === 'function' ? (mutator(next) || next) : mutator
  replacePreferences(changed)
  if (save) schedulePreferenceSave()
  return preferenceState.preferences
}

export async function resetUserPreferences() {
  preferenceState.saving = true
  preferenceState.error = ''
  try {
    const response = await apiFetch('/api/tfd/ui/preferences/', { method: 'DELETE' })
    replacePreferences(response?.preferences || DEFAULT_USER_PREFERENCES, { updatedAt: null })
    preferenceState.initialized = true
    return preferenceState.preferences
  } finally {
    preferenceState.saving = false
  }
}

export function resetNavigationPreferences({ save = true } = {}) {
  return updateUserPreferences((next) => {
    next.navigation = clone(DEFAULT_USER_PREFERENCES.navigation)
    return next
  }, { save })
}
