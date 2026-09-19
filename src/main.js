import { reactive } from 'vue'
import { createApp } from 'vue'
import App from './App.vue'
import { apiBlob, apiFetch, apiRaw, apiText, loadStaticModuleManifest, publicApiFetch } from './api'
import { router } from './router'
import { state, loadContext } from './state'
import { loadPublicUiModules, loadUiModules } from './module-loader'
import { createContextActionRegistry } from './context-actions'
import { createContextInteractionRegistry } from './context-interactions'
import { initializeUserPreferences } from './preferences'
import './styles.css'

async function bootstrap() {
  const app = createApp(App)
  const navigation = reactive([])

  function addNavigation(item) {
    if (!item?.to || !item?.label) return
    if (navigation.some((existing) => existing.to === item.to)) return
    navigation.push(item)
  }

  const hasPermission = (code) => (
    state.context.user?.superuser || state.context.permissions.includes(code)
  )
  const contextActions = createContextActionRegistry({ hasPermission })
  const contextInteractions = createContextInteractionRegistry({ hasPermission })

  app.provide('tecTacState', state)
  app.provide('tecTacNavigation', navigation)
  app.provide('tecTacContextActions', contextActions)
  app.provide('tecTacContextInteractions', contextInteractions)
  app.use(router)
  const initialHashTarget = window.location.hash.startsWith('#/')
    ? window.location.hash.slice(1)
    : null

  // Public module routes must be registered before authentication is required.
  // This lets anonymous visitors open /public/<extension-id>/... directly.
  let staticModules = []
  try {
    staticModules = await loadStaticModuleManifest()
    state.publicModules = staticModules.filter((item) => item?.public?.entry)
    state.publicModuleLoad = await loadPublicUiModules(
      { app, router, publicApi: publicApiFetch },
      state.publicModules,
    )
  } catch (error) {
    state.publicModuleLoad = { loaded: [], failed: [{ id: 'manifest', message: error?.message || String(error) }] }
  }

  app.mount('#app')
  await router.isReady()
  if (initialHashTarget?.startsWith('/public/')) await router.replace(initialHashTarget)

  // Authenticated context still loads normally. Public routes render regardless
  // of whether this resolves to ready, unauthenticated, or an auth error.
  await loadContext()

  if (state.status === 'ready') {
    await initializeUserPreferences(state.context)
    state.moduleLoad = await loadUiModules(
      {
        app,
        router,
        state,
        addNavigation,
        api: apiFetch,
        apiRaw,
        apiBlob,
        apiText,
        hasPermission,
        contextActions,
        contextInteractions,
      },
      state.context.modules || staticModules,
    )

    // A fresh tab may target a dynamically registered authenticated route.
    // The core catch-all can resolve before modules are loaded, so replay the
    // original hash after module registration to restore the intended route.
    if (initialHashTarget && !initialHashTarget.startsWith('/public/')) {
      await router.replace(initialHashTarget)
    }
  }
}

bootstrap().catch((error) => {
  console.error('[TEC-TAC-UI] Bootstrap failed.', error)
  state.error = error
  state.authStatus = state.authStatus === 'verified' ? 'verified' : 'error'
  state.status = 'failed'
})
