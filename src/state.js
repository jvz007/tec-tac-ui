import { reactive } from 'vue'
import {
  apiFetch,
  clearTacticalSession,
  loadStaticModuleManifest,
  tacticalIdentityFromStorage,
  tacticalToken,
  validateTacticalSession,
} from './api'

export const state = reactive({
  status: 'loading',
  authStatus: 'unknown',
  authProof: null,
  error: null,
  contextSource: 'none',
  context: {
    user: tacticalIdentityFromStorage(),
    permissions: [],
    modules: [],
  },
  moduleLoad: { loaded: [], failed: [] },
})

function normalizeStaticModules(modules) {
  return modules.map((module) => ({
    ...module,
    allowed: module.allowed !== false,
    permissions: Array.isArray(module.permissions) ? module.permissions : [],
    navigation: module.navigation || {
      label: module.id,
      section: 'Extensions',
      icon: '◇',
    },
  }))
}

function markUnauthenticated(error = null) {
  clearTacticalSession()
  state.error = error
  state.authStatus = 'required'
  state.authProof = null
  state.status = 'unauthenticated'
  state.contextSource = 'tactical-auth'
  state.context = {
    user: tacticalIdentityFromStorage(),
    permissions: [],
    modules: [],
  }
}

export async function loadContext() {
  state.status = 'loading'
  state.authStatus = 'verifying'
  state.authProof = null
  state.error = null
  state.contextSource = 'none'
  state.context = {
    user: tacticalIdentityFromStorage(),
    permissions: [],
    modules: [],
  }

  if (!tacticalToken()) {
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

  // Optional richer Tec-Tac backend contract. The shell first proves that the
  // Tactical token is valid. Only then may a missing context endpoint fall back
  // to the local module manifest for compatibility with Tec-Tac backend 1.0.1.
  try {
    const context = await apiFetch('/api/tfd/ui/context/')
    state.context = {
      user: { ...browserUser, ...(context.user || {}) },
      permissions: Array.isArray(context.permissions) ? context.permissions : [],
      modules: Array.isArray(context.modules) ? context.modules : [],
    }
    state.contextSource = 'backend'
    state.status = 'ready'
    return state.context
  } catch (error) {
    if (error.status === 401) {
      markUnauthenticated(error)
      return state.context
    }

    // 404 means the optional Tec-Tac context API is not installed yet.
    // Any other response is treated as an actual backend/context failure.
    if (error.status !== 404) {
      state.error = error
      state.status = 'failed'
      state.contextSource = 'backend'
      return state.context
    }
  }

  try {
    const modules = normalizeStaticModules(await loadStaticModuleManifest())
    state.context = {
      user: browserUser,
      permissions: [],
      modules,
    }
    state.contextSource = 'local-manifest'
    state.status = 'ready'
  } catch (error) {
    state.error = error
    state.context = {
      user: browserUser,
      permissions: [],
      modules: [],
    }
    state.contextSource = 'local-manifest'
    state.status = 'failed'
  }

  return state.context
}
