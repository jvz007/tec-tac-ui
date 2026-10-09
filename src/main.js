import { reactive } from 'vue'
import { createApp } from 'vue'
import App from './App.vue'
import { apiBlob, apiFetch, apiRaw, apiText, beginTacticalSso, loadStaticModuleManifest, publicApiFetch } from './api'
import { router } from './router'
import { state, loadContext, recordModuleRuntimeError } from './state'
import { loadPublicUiModules, loadUiModules } from './module-loader'
import { createTacticalOperation } from './tactical-operations'
import { createContextActionRegistry } from './context-actions'
import { createContextInteractionRegistry } from './context-interactions'
import { createResourceViewRegistry } from './resource-views'
import { createCodeEditorService } from './code-editor'
import { createDashboardWidgetRegistry } from './dashboard-widgets'
import { createQuickActionRegistry } from './quick-actions'
import { createNotificationService } from './notifications'
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
  const tacticalOperation = createTacticalOperation({ apiRaw })
  const contextActions = createContextActionRegistry({ hasPermission })
  const contextInteractions = createContextInteractionRegistry({ hasPermission })
  const resourceViews = createResourceViewRegistry({ hasPermission })
  const codeEditor = createCodeEditorService()
  const dashboardWidgets = createDashboardWidgetRegistry({ hasPermission })
  const quickActions = createQuickActionRegistry({ hasPermission })
  const notifications = createNotificationService({ api: apiFetch, router })
  const audit = createAuditService(apiFetch)
  const help = createHelpService()
  const ssoProviders = createSsoProviderRegistry({
    beginProvider: (entry) => beginTacticalSso(entry.provider_id),
  })
  const header = createHeaderContributionRegistry({ hasPermission, isTrustedContext: () => state.contextSource === 'backend' })
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
    state.moduleLoad = await loadUiModules(
      {
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
        tacticalOperation,
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
        modules,
      },
      state.context.modules || staticModules,
    )

    // A fresh tab may target a dynamically registered authenticated route.
    // The core catch-all can resolve before modules are loaded, so replay the
    // original hash after module registration to restore the intended route.
    if (initialHashTarget && !initialHashTarget.startsWith('/public/') && initialHashTarget !== '/sso/callback') {
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
