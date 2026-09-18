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
    extensions: [],
    capabilities: null,
    modules: [],
  },
  moduleLoad: { loaded: [], failed: [] },
})

function normalizeStaticModules(modules, context = state.context) {
  return modules.map((module) => {
    const permissions = Array.isArray(module.permissions) ? module.permissions : []
    const allowed = module.allowed !== false && (
      context.user?.superuser ||
      permissions.length === 0 ||
      permissions.every((code) => context.permissions.includes(code))
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
  state.context = {
    user: tacticalIdentityFromStorage(),
    permissions: [],
    extensions: [],
    capabilities: null,
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
    extensions: [],
    capabilities: null,
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
    const baseContext = richContext ? {
      user: { ...browserUser, ...(richContext.user || {}) },
      permissions: Array.isArray(richContext.permissions) ? richContext.permissions : [],
      extensions: Array.isArray(richContext.extensions) ? richContext.extensions : [],
      capabilities: richContext.capabilities && typeof richContext.capabilities === "object" ? richContext.capabilities : null,
      modules: [],
    } : {
      user: browserUser,
      permissions: [],
      extensions: [],
      capabilities: null,
      modules: [],
    }

    const modules = normalizeStaticModules(await loadStaticModuleManifest(), baseContext)
    state.context = { ...baseContext, modules }
    state.contextSource = richContext ? 'backend' : 'local-manifest'
    state.status = 'ready'
  } catch (error) {
    state.error = error
    state.contextSource = richContext ? 'backend' : 'local-manifest'
    state.status = 'failed'
  }

  return state.context
}
