import { reactive } from 'vue'
import {
  apiFetch,
  loadStaticModuleManifest,
  tacticalIdentityFromStorage,
  tacticalToken,
} from './api'

export const state = reactive({
  status: 'loading',
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

export async function loadContext() {
  if (!tacticalToken()) {
    state.status = 'unauthenticated'
    state.contextSource = 'browser'
    return state.context
  }

  state.status = 'loading'
  state.error = null
  const browserUser = tacticalIdentityFromStorage()

  // Optional richer Tec-Tac backend contract. 0.1.0 does not require it.
  // If /api/tfd/ui/context/ exists, it may supply role, effective permissions,
  // and per-user module authorization. If not, the UI remains usable against
  // the unmodified Tec-Tac 1.0.1 backend and loads the local module manifest.
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
      state.error = error
      state.status = 'unauthenticated'
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
    state.contextSource = 'browser'
    state.status = 'ready'
  }

  return state.context
}
