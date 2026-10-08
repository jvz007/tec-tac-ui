import { reactive } from 'vue'
import {
  apiFetch,
  clearTacticalSession,
  loadStaticModuleManifest,
  TACTICAL_SESSION_INVALID_EVENT,
  tacticalAuthStage,
  tacticalIdentityFromStorage,
  tacticalServerUrl,
  tacticalToken,
  validateTacticalSession,
} from './api'
import { emptyRuntimeContext, normalizeBackendRuntimeContext } from './runtime-context'

export const state = reactive({
  status: 'loading',
  authStatus: 'unknown',
  authProof: null,
  error: null,
  contextSource: 'none',
  context: emptyRuntimeContext(tacticalIdentityFromStorage()),

  moduleLoad: { loaded: [], failed: [], skipped: [] },
  publicModuleLoad: { loaded: [], failed: [] },
  publicModules: [],
  // Failures captured by Core's error boundaries and the app error handler.
  // Newest last, capped at MODULE_RUNTIME_ERROR_LIMIT.
  moduleRuntimeErrors: [],
})

export const MODULE_RUNTIME_ERROR_LIMIT = 50

// Record a contained runtime failure so Modules can report the provider as
// unhealthy. Never throws.
export function recordModuleRuntimeError({ provider = 'Core', variant = '', label = '', error = null, message = '', info = '' } = {}) {
  try {
    const entry = {
      provider: String(provider || 'Core'),
      variant: String(variant || ''),
      label: String(label || ''),
      message: String(message || error?.message || error || 'Unknown error'),
      info: String(info || ''),
      at: new Date().toISOString(),
    }
    state.moduleRuntimeErrors.push(entry)
    while (state.moduleRuntimeErrors.length > MODULE_RUNTIME_ERROR_LIMIT) state.moduleRuntimeErrors.shift()
    return entry
  } catch {
    return null
  }
}

function normalizeStaticModules(modules, context = state.context) {
  const permissionSet = new Set(context.permissions || [])
  return modules.map((module) => {
    const permissions = Array.isArray(module.permissions) ? module.permissions : []
    const allowed = module.allowed !== false && (
      context.user?.superuser ||
      permissions.length === 0 ||
      permissions.every((code) => permissionSet.has(code))
    )
    return {
      ...module,
      allowed,
      permissions,
      navigation: module.navigation || {
        label: module.id,
        section: 'Extensions',
        icon: '◇',
      },
    }
  })
}

function markUnauthenticated(error = null) {
  clearTacticalSession()
  state.error = error
  state.authStatus = 'required'
  state.authProof = null
  state.status = 'unauthenticated'
  state.contextSource = 'tactical-auth'
  state.context = emptyRuntimeContext(tacticalIdentityFromStorage())
}

if (typeof window !== 'undefined' && !window.__tecTacSessionInvalidListener) {
  window.__tecTacSessionInvalidListener = true
  window.addEventListener(TACTICAL_SESSION_INVALID_EVENT, (event) => {
    const detail = event?.detail || {}
    const error = new Error(detail.message || 'Your Tactical session is no longer valid. Sign in again.')
    error.status = 401
    error.code = detail.code || null
    markUnauthenticated(error)
  })
}

export async function loadContext(staticModules = null) {
  state.status = 'loading'
  state.authStatus = 'verifying'
  state.authProof = null
  state.error = null
  state.contextSource = 'none'
  state.context = emptyRuntimeContext(tacticalIdentityFromStorage())

  if (!tacticalToken()) {
    markUnauthenticated()
    return state.context
  }

  // /v2/checkcreds/ issues a short-lived token before first-time TOTP
  // enrollment. That token is setup-only and must never unlock Tec-Tac.
  // If the browser reloads mid-enrollment, discard it and require the
  // credential flow again so the password is never persisted.
  if (tacticalAuthStage() === 'totp-setup') {
    markUnauthenticated()
    return state.context
  }

  let verification
  try {
    verification = await validateTacticalSession()
  } catch (error) {
    state.error = error
    state.authStatus = 'error'
    state.status = 'failed'
    state.contextSource = 'tactical-auth'
    return state.context
  }

  if (!verification.authenticated) {
    markUnauthenticated()
    return state.context
  }

  state.authStatus = 'verified'
  state.authProof = verification.status === 403 ? 'authenticated-rbac-denied' : 'authenticated'

  const browserUser = tacticalIdentityFromStorage()
  let richContext = null

  try {
    richContext = await apiFetch('/api/tfd/ui/context/')
  } catch (error) {
    if (error.status === 401) {
      markUnauthenticated(error)
      return state.context
    }
    if (error.status !== 404) {
      state.error = error
      state.status = 'failed'
      state.contextSource = 'backend'
      return state.context
    }
  }

  try {
    const baseContext = richContext
      ? normalizeBackendRuntimeContext(richContext, browserUser)
      : emptyRuntimeContext(browserUser)

    const manifest = Array.isArray(staticModules) ? staticModules : await loadStaticModuleManifest()
    const modules = normalizeStaticModules(manifest, baseContext)
    state.context = { ...baseContext, modules, server_url: tacticalServerUrl() }
    state.contextSource = richContext ? 'backend' : 'local-manifest'
    state.status = 'ready'
  } catch (error) {
    state.error = error
    state.contextSource = richContext ? 'backend' : 'local-manifest'
    state.status = 'failed'
  }

  return state.context
}
