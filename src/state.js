import { reactive } from 'vue'
import {
  apiFetch,
  loadStaticModuleManifest,
  tacticalIdentityFromStorage,
  tacticalToken,
  validateTacticalSession,
} from './api'

export const state = reactive({
  status: 'loading',
  authStatus: 'verifying',
  authDetail: null,
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

function setUnauthenticated(error = null) {
  state.error = error
  state.status = 'unauthenticated'
  state.authStatus = 'required'
  state.contextSource = 'browser'
  state.context = {
    user: tacticalIdentityFromStorage(),
    permissions: [],
    modules: [],
  }
}

export async function loadContext() {
  state.status = 'loading'
  state.authStatus = 'verifying'
  state.authDetail = null
  state.error = null
  state.contextSource = 'none'

  const browserUser = tacticalIdentityFromStorage()
  state.context.user = browserUser

  if (!tacticalToken()) {
    setUnauthenticated()
    return state.context
  }

  try {
    const verification = await validateTacticalSession()
    state.authDetail = verification.reason

    if (!verification.authenticated) {
      setUnauthenticated()
      return state.context
    }

    state.authStatus = 'verified'
  } catch (error) {
    state.error = error
    state.status = 'failed'
    state.authStatus = 'error'
    return state.context
  }

  // Optional richer Tec-Tac backend contract. A 404 means the current
  // backend does not implement it yet; only then do we enter compatibility
  // mode. Authentication has already been independently verified above.
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
      setUnauthenticated(error)
      return state.context
    }

    if (error.status === 403) {
      state.error = error
      state.status = 'denied'
      state.contextSource = 'backend'
      return state.context
    }

    if (error.status !== 404) {
      state.error = error
      state.status = 'failed'
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
    state.status = 'failed'
    state.contextSource = 'local-manifest'
  }

  return state.context
}
