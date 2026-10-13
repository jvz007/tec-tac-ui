import { reactive } from 'vue'
import { createApp } from 'vue'
import App from './App.vue'
import { apiBase, apiBlob, apiFetch, apiRaw, apiText, beginTacticalSso, loadStaticModuleManifest, publicApiFetch, TACTICAL_SESSION_INVALID_EVENT } from './api'
import { router } from './router'
import { state, loadContext, recordModuleRuntimeError } from './state'
import { loadPublicUiModules, loadUiModules, moduleIsAllowed, unloadUiModule } from './module-loader'
import { createTacticalWebSocket } from './tactical-websocket'
import { parsePopupHash, popupHref as buildPopupHref, popupMissDetails, popupModuleSet, popupPublisherSet, popupPublishersChoice, popupRoutePermitted, POPUP_HASH_PREFIX, POPUP_MESSAGE_NOT_POPUP, POPUP_MESSAGE_UNAVAILABLE } from './popup-mode'
import { createTacticalOperation } from './tactical-operations'
import { normalizeTacticalScope } from './runtime-context'
import { createContextActionRegistry } from './context-actions'
import { createConfirmService } from './confirm-dialog'
import { createContextInteractionRegistry } from './context-interactions'
import { createResourceViewRegistry } from './resource-views'
import { createCodeEditorService } from './code-editor'
import { createDashboardWidgetRegistry } from './dashboard-widgets'
import { createQuickActionRegistry } from './quick-actions'
import { createNotificationService } from './notifications'
import { createModuleServiceRegistry } from './module-services'
import { createModuleStatusService } from './module-status'
import { createAuditService } from './audit'
import { createHelpService } from './help'
import { createSsoProviderRegistry } from './sso-providers'
import { createHeaderContributionRegistry } from './header-contributions'
import { registerCoreHelpArticles } from './help/core-articles'
import { registerCoreDashboardWidgets } from './dashboard-core-widgets'
import { initializeUserPreferences } from './preferences'
import { installCspViolationRecorder } from './csp-violations'
import './styles.css'

// Installed before anything mounts so an early violation is not missed.
installCspViolationRecorder()

async function bootstrap() {
  const app = createApp(App)
  const navigation = reactive([])
  let permissionSet = new Set()

  function addNavigation(item) {
    if (!item?.to || !item?.label) return
    if (navigation.some((existing) => existing.to === item.to)) return
    navigation.push(item)
  }

  // Removes every navigation item a module contributed. Used when a module's
  // register() fails or times out after it already added entries.
  function removeNavigation(moduleId) {
    for (let index = navigation.length - 1; index >= 0; index -= 1) {
      if (navigation[index]?.moduleId === moduleId) navigation.splice(index, 1)
    }
  }

  // Last resort for an error no error boundary caught. Failure containment
  // normally happens in module-error-boundary.js.
  app.config.errorHandler = (error, instance, info) => {
    console.error('[TEC-TAC-UI] Unhandled component error.', error, info)
    const meta = router.currentRoute?.value?.meta || {}
    recordModuleRuntimeError({
      provider: meta.dynamicModule || meta.publicModule || 'Core',
      variant: 'app',
      error,
      info,
    })
  }

  const hasPermission = (code) => (
    state.context.user?.superuser || permissionSet.has(code)
  )
  // Display hint only: Tactical decides every call (AD-12). True only for a flag
  // that is exactly true in the map Core sent.
  const hasTacticalPermission = (flag) => (
    typeof flag === 'string' && state.context?.tactical_permissions?.[flag] === true
  )
  // Display hint only (AD-12): the role's client and site scope as counts. A fresh
  // copy each call, normalized again so a module cannot change the shared state.
  const tacticalScope = () => ({ ...normalizeTacticalScope(state.context?.tactical_scope) })
  const tacticalOperation = createTacticalOperation({ apiRaw })
  // The shell's own Yes or No dialog (0.12.96). A module gets it bound to its own id.
  const confirmService = createConfirmService()
  const contextActions = createContextActionRegistry({ hasPermission, confirm: confirmService.confirm })
  const contextInteractions = createContextInteractionRegistry({ hasPermission })
  const resourceViews = createResourceViewRegistry({ hasPermission, timeoutSeconds: () => state.context?.module_register_timeout_seconds })
  const codeEditor = createCodeEditorService()
  const dashboardWidgets = createDashboardWidgetRegistry({ hasPermission })
  const quickActions = createQuickActionRegistry({ hasPermission })
  // The person key scopes the notices this browser has toasted (0.12.101). Core's user id is Tactical's own id.
  const notifications = createNotificationService({ api: apiFetch, router, userKey: () => state.context?.user?.id })
  const audit = createAuditService(apiFetch)
  const help = createHelpService()
  const ssoProviders = createSsoProviderRegistry({
    beginProvider: (entry) => beginTacticalSso(entry.provider_id),
  })
  const header = createHeaderContributionRegistry({ hasPermission, isTrustedContext: () => state.contextSource === 'backend' })
  // Browser services between modules (0.12.101). Permission is checked on every list, has and call. Outside a backend
  // context every service is hidden and refused (0.12.102, AD-12).
  const moduleServices = createModuleServiceRegistry({ hasPermission, hasTacticalPermission, isTrustedContext: () => state.contextSource === 'backend' })
  // Tactical terminal sockets (0.12.102, Core 1.17.31). The shell's one helper; each module gets a copy bound to its own id.
  // Every terminal it opened is closed when the sign-in ends and when the page is left.
  const tacticalWebSocket = createTacticalWebSocket({ api: apiFetch, wsBase: () => apiBase(), WebSocketImpl: window.WebSocket })
  window.addEventListener(TACTICAL_SESSION_INVALID_EVENT, () => tacticalWebSocket.closeAll())
  window.addEventListener('pagehide', () => tacticalWebSocket.closeAll())
  registerCoreDashboardWidgets(dashboardWidgets, state)
  registerCoreHelpArticles(help)

  app.provide('tecTacState', state)
  app.provide('tecTacNavigation', navigation)
  app.provide('tecTacContextActions', contextActions)
  app.provide('tecTacContextInteractions', contextInteractions)
  app.provide('tecTacResourceViews', resourceViews)
  app.provide('tecTacCodeEditor', codeEditor)
  app.provide('tecTacDashboardWidgets', dashboardWidgets)
  app.provide('tecTacQuickActions', quickActions)
  app.provide('tecTacNotifications', notifications)
  app.provide('tecTacAudit', audit)
  app.provide('tecTacHelp', help)
  app.provide('tecTacSsoProviders', ssoProviders)
  app.provide('tecTacHeader', header)
  app.provide('tecTacConfirm', confirmService)
  app.use(router)
  const initialHashTarget = window.location.hash.startsWith('#/')
    ? window.location.hash.slice(1)
    : null

  // Popup window (0.12.95). A /popup/ hash opens one module page with no shell chrome. Only that module loads, plus its
  // hard dependencies. No public modules, no dashboard and no notice polling. A /popup/ hash that does not parse is refused.
  const popupRequested = window.location.hash.startsWith(POPUP_HASH_PREFIX)
  const popupTarget = popupRequested ? parsePopupHash(window.location.hash) : null
  const popupMode = popupRequested
  const refusePopup = (message) => { state.popup = { ...state.popup, active: true, status: 'refused', message } }
  if (popupMode) {
    state.popup = { active: true, status: popupTarget ? 'loading' : 'refused', message: popupTarget ? '' : POPUP_MESSAGE_NOT_POPUP }
  }

  // Public module routes must be registered before authentication is required.
  // This lets anonymous visitors open /public/<extension-id>/... directly.
  let staticModules = []
  try {
    staticModules = await loadStaticModuleManifest()
    state.publicModules = staticModules.filter((item) => item?.public?.entry)
    state.publicModuleLoad = popupMode
      ? { loaded: [], failed: [] }
      : await loadPublicUiModules(
        { app, router, publicApi: publicApiFetch, ssoProviders },
        state.publicModules,
      )
  } catch (error) {
    state.publicModuleLoad = { loaded: [], failed: [{ id: 'manifest', message: error?.message || String(error) }] }
  }

  app.mount('#app')
  await router.isReady()
  if (initialHashTarget?.startsWith('/public/') || initialHashTarget === '/sso/callback') await router.replace(initialHashTarget)

  // Authenticated context still loads normally. Public routes render regardless
  // of whether this resolves to ready, unauthenticated, or an auth error.
  await loadContext(staticModules)

  if (state.status === 'ready') {
    permissionSet = new Set(state.context.permissions || [])
    notifications.setInitialUnreadCount(state.context.notice_unread_count)
    await initializeUserPreferences(state.context)
    const modules = createModuleStatusService(state.context.module_status, state.context.modules || staticModules)
    app.provide('tecTacModules', modules)
    const descriptors = state.context.modules || staticModules
    // A popup loads its module and the hard dependencies only. A module that is not allowed, not installed or not
    // enabled is not in the list, so it is never requested.
    const popupGate = { permissions: state.context.permissions || [], permissionSet: new Set(state.context.permissions || []), user: state.context.user || {}, source: state.contextSource }
    const toLoad = popupMode
      ? (popupTarget ? popupModuleSet(descriptors, popupTarget.moduleId, { allowed: (descriptor) => moduleIsAllowed(descriptor, popupGate) }) : [])
      : descriptors
    const loaderRuntime = {
      app,
      router,
      state,
      addNavigation,
      removeNavigation,
      api: apiFetch,
      apiRaw,
      apiBlob,
      apiText,
      hasPermission,
      hasTacticalPermission,
      tacticalScope,
      tacticalOperation,
      // Popup mode (0.12.95): popupHref is for every module; popupMode is set only in a popup window.
      // confirm is the shell's shared service; the loader binds it to each module (0.12.96).
      confirm: confirmService.confirm,
      popupHref: (moduleId, path) => buildPopupHref(moduleId, path, window.location.origin),
      popupMode: popupTarget
        ? {
          moduleId: popupTarget.moduleId,
          permitted: (meta) => popupRoutePermitted(meta, { permissions: state.context.permissions || [], user: state.context.user || {}, source: state.contextSource }),
          refuse: refusePopup,
          deniedMessage: POPUP_MESSAGE_UNAVAILABLE,
        }
        : null,
      contextActions,
      contextInteractions,
      resourceViews,
      codeEditor,
      dashboardWidgets,
      quickActions,
      notifications,
      audit,
      help,
      header,
      services: moduleServices,
      tacticalWebSocket,
      modules,
    }
    // A module that is switched off while the page is open is unloaded at once (0.12.102). ModulesView calls it.
    app.provide('tecTacModuleUnload', (moduleId) => unloadUiModule(loaderRuntime, moduleId))
    state.moduleLoad = await loadUiModules(loaderRuntime, toLoad)

    // Phase 2 (0.12.97): the owner's popup route may ask for the modules that publish into its placements
    // (meta.popupPublishers: true, or a list of module ids). The shell cannot tell who publishes where before loading, so
    // this is the owner's opt-in. A failure in an extra module never refuses the popup. The replay below runs after both phases.
    if (popupTarget && state.moduleLoad.loaded.includes(popupTarget.moduleId) && initialHashTarget) {
      let choice = null
      try {
        const matched = router.resolve(initialHashTarget).matched
        choice = popupPublishersChoice(matched[matched.length - 1]?.meta)
      } catch (error) {
        console.warn('[TEC-TAC-UI] popup: could not read the route meta for popupPublishers.', error)
      }
      const extra = popupPublisherSet(descriptors, popupTarget.moduleId, state.moduleLoad.loaded, choice, { allowed: (descriptor) => moduleIsAllowed(descriptor, popupGate) })
      if (extra.length) {
        const more = await loadUiModules(loaderRuntime, extra)
        state.moduleLoad = {
          loaded: [...state.moduleLoad.loaded, ...more.loaded],
          failed: [...state.moduleLoad.failed, ...more.failed],
          skipped: [...(state.moduleLoad.skipped || []), ...(more.skipped || [])],
        }
      }
    }

    // A popup whose module did not load (not allowed, not installed, disabled or failed) is refused without a retry.
    if (popupTarget && !state.moduleLoad.loaded.includes(popupTarget.moduleId)) console.warn('[TEC-TAC-UI] popup: the owner module did not load.', popupMissDetails(window.location.hash, popupTarget, router.getRoutes(), state.moduleLoad.loaded), state.moduleLoad.failed)
    if (popupTarget && !state.moduleLoad.loaded.includes(popupTarget.moduleId)) refusePopup(POPUP_MESSAGE_UNAVAILABLE)

    // A fresh tab may target a dynamically registered authenticated route.
    // The core catch-all can resolve before modules are loaded, so replay the
    // original hash after module registration to restore the intended route.
    if (initialHashTarget && !initialHashTarget.startsWith('/public/') && initialHashTarget !== '/sso/callback') {
      await router.replace(initialHashTarget)
    }
    // A popup route that did not register (no such route, or no meta.popup) lands on the popup catch-all.
    if (popupTarget && router.currentRoute.value.name === 'popup-pending' && state.popup.status !== 'refused') {
      console.warn('[TEC-TAC-UI] popup: the popup address did not match a route that opens in a popup window.', popupMissDetails(window.location.hash, popupTarget, router.getRoutes(), state.moduleLoad.loaded))
      refusePopup(POPUP_MESSAGE_NOT_POPUP)
    }
  }
}

bootstrap().catch((error) => {
  console.error('[TEC-TAC-UI] Bootstrap failed.', error)
  state.error = error
  state.authStatus = state.authStatus === 'verified' ? 'verified' : 'error'
  state.status = 'failed'
})
