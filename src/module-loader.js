import * as Vue from 'vue'

// This file is loaded by older tests as a data: URL with only the vue import
// replaced, so it must not gain relative imports.

const DEFAULT_REGISTER_TIMEOUT_MS = 30000
const MIN_REGISTER_TIMEOUT_SECONDS = 5
const MAX_REGISTER_TIMEOUT_SECONDS = 300

// Same rule as normalizeRegisterTimeoutSeconds in runtime-context.js: a whole
// number from 5 to 300, otherwise the 30 second default.
function registerBudgetMs(runtime, options = {}) {
  const override = Number(options?.timeoutMs)
  if (Number.isFinite(override) && override > 0) return override
  const seconds = runtime?.state?.context?.module_register_timeout_seconds
  const valid = Number.isInteger(seconds) && seconds >= MIN_REGISTER_TIMEOUT_SECONDS && seconds <= MAX_REGISTER_TIMEOUT_SECONDS
  return (valid ? seconds : DEFAULT_REGISTER_TIMEOUT_MS / 1000) * 1000
}

function timeoutMessage(ms) {
  const seconds = ms / 1000
  return `register() did not finish within ${Number.isInteger(seconds) ? seconds : seconds.toFixed(2)} seconds`
}

// Races `work` against a time budget. A hung promise cannot be cancelled in
// JavaScript, so the caller marks the module abandoned when this rejects.
function raceBudget(work, ms) {
  let timer = null
  const budget = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(timeoutMessage(ms))
      error.timedOut = true
      reject(error)
    }, ms)
  })
  return Promise.race([work, budget]).finally(() => clearTimeout(timer))
}

// Registry methods that only release what a module already owns stay callable
// after a module is abandoned. Everything else throws.
const RELEASE_METHOD = /^(clear|unregister|dispose|remove)/

function guardAbandoned(scoped, isAbandoned, moduleId) {
  if (!scoped || typeof scoped !== 'object') return scoped
  const guarded = {}
  for (const key of Object.keys(scoped)) {
    if (typeof scoped[key] === 'function' && !RELEASE_METHOD.test(key)) {
      guarded[key] = (...args) => {
        if (isAbandoned()) throw new Error(`module ${moduleId} was abandoned after a failed or timed-out register(); ${key}() is refused`)
        return scoped[key](...args)
      }
    } else {
      Object.defineProperty(guarded, key, { enumerable: true, get: () => scoped[key] })
    }
  }
  return Object.freeze(guarded)
}

function guardedModuleRouter(router, descriptor, routeOwners, hooks = {}) {
  return new Proxy(router, {
    get(target, prop, receiver) {
      if (prop !== 'addRoute') return Reflect.get(target, prop, receiver)
      return (parentOrRoute, maybeRoute) => {
        if (hooks.isAbandoned?.()) throw new Error(`module ${descriptor.id} was abandoned after a failed or timed-out register(); router.addRoute is refused`)
        const route = maybeRoute === undefined ? parentOrRoute : maybeRoute
        if (!route || typeof route !== 'object') throw new Error('router.addRoute requires a route object')
        const path = String(route.path || '').trim()
        const name = route.name == null ? '' : String(route.name)
        if (!path) throw new Error(`module ${descriptor.id} attempted to register a route without a path`)

        const existing = target.getRoutes()
        const pathMatch = existing.find((item) => item.path === path)
        const nameMatch = name ? existing.find((item) => String(item.name || '') === name) : null
        const conflict = pathMatch || nameMatch
        if (conflict) {
          const key = pathMatch ? `path ${path}` : `name ${name}`
          const owner = routeOwners.get(conflict.path) || conflict.meta?.dynamicModule || 'core shell / previously registered route'
          throw new Error(`module ${descriptor.id} cannot claim ${key}; it is already owned by ${owner}`)
        }

        const decorated = {
          ...route,
          meta: { ...(route.meta || {}), dynamicModule: descriptor.id },
        }
        const result = maybeRoute === undefined
          ? target.addRoute(decorated)
          : target.addRoute(parentOrRoute, decorated)
        routeOwners.set(path, descriptor.id)
        hooks.onRouteAdded?.(path, result)
        return result
      }
    },
  })
}

function moduleIsAllowed(descriptor, context) {
  if (descriptor.allowed === false) return false
  if (!descriptor.permissions?.length) return true
  if (context.user?.superuser) return true

  if (descriptor.allowed === true && context.source === 'backend') return true
  if (context.source !== 'backend') return true

  return descriptor.permissions.every((code) => context.permissionSet.has(code))
}

// loadPublicUiModules runs before sign-in, when no runtime context exists, so
// it uses the fixed 30 second default. `options.timeoutMs` is for tests only.
export async function loadPublicUiModules(runtime, modules, options = {}) {
  const loaded = []
  const failed = []
  const budget = registerBudgetMs(null, options)

  for (const descriptor of modules) {
    const publicDescriptor = descriptor.public
    if (!publicDescriptor?.entry || !publicDescriptor?.base_path) continue

    let abandoned = false
    const routeRemovers = []
    let moduleSsoProviders = null
    const cleanup = () => {
      try { moduleSsoProviders?.clear?.() } catch {}
      for (const remove of routeRemovers.splice(0)) {
        try { remove() } catch {}
      }
    }

    const work = (async () => {
      const imported = await import(/* @vite-ignore */ publicDescriptor.entry)
      const plugin = imported.default || imported
      if (!plugin || typeof plugin.registerPublic !== 'function') {
        throw new Error('public module does not export registerPublic(context)')
      }

      const basePath = publicDescriptor.base_path
      const addPublicRoute = (route) => {
        if (abandoned) throw new Error(`module ${descriptor.id} was abandoned after a failed or timed-out registerPublic(); addPublicRoute is refused`)
        if (!route || typeof route !== 'object' || !route.path) {
          throw new Error('addPublicRoute requires a route with a path')
        }
        if (route.path !== basePath && !route.path.startsWith(`${basePath}/`)) {
          throw new Error(`public route must stay within ${basePath}`)
        }
        const remove = runtime.router.addRoute({
          ...route,
          meta: {
            ...(route.meta || {}),
            public: true,
            publicModule: descriptor.id,
          },
        })
        if (typeof remove === 'function') routeRemovers.push(remove)
      }

      moduleSsoProviders = guardAbandoned(runtime.ssoProviders?.forModule(descriptor.id) || null, () => abandoned, descriptor.id)
      await plugin.registerPublic({
        Vue,
        app: runtime.app,
        descriptor,
        addPublicRoute,
        publicApi: runtime.publicApi,
        ssoProviders: moduleSsoProviders,
      })
    })()
    // A promise that settles after the module was abandoned still cleans up.
    work.then(() => { if (abandoned) cleanup() }, () => { if (abandoned) cleanup() })

    try {
      await raceBudget(work, budget)
      loaded.push(descriptor.id)
    } catch (error) {
      abandoned = true
      cleanup()
      const entry = { id: descriptor.id, message: error?.message || String(error) }
      if (error?.timedOut) entry.timedOut = true
      failed.push(entry)
    }
  }

  if (loaded.length && runtime.router.currentRoute.value.path.startsWith('/public/')) {
    await runtime.router.replace(runtime.router.currentRoute.value.fullPath)
  }

  return { loaded, failed }
}

// `options.timeoutMs` is for tests only. In production the budget is
// context.module_register_timeout_seconds (5 to 300, default 30) and covers
// import(entry) plus register(context) together.
export async function loadUiModules(runtime, modules, options = {}) {
  const loaded = []
  const failed = []
  const skipped = []
  const routeOwners = new Map()
  const permissionSet = new Set(runtime.state.context.permissions || [])
  const budget = registerBudgetMs(runtime, options)

  for (const descriptor of modules) {
    if (!descriptor.entry) continue
    if (!moduleIsAllowed(descriptor, {
      permissions: runtime.state.context.permissions || [],
      permissionSet,
      user: runtime.state.context.user || {},
      source: runtime.state.contextSource,
    })) {
      skipped.push({ id: descriptor.id, reason: 'permission-gated' })
      continue
    }

    let abandoned = false
    const isAbandoned = () => abandoned
    const routeRemovers = []
    const routePaths = []
    let moduleContextActions = null
    let moduleContextInteractions = null
    let moduleResourceViews = null
    let moduleCodeEditor = null
    let moduleDashboardWidgets = null
    let moduleQuickActions = null
    let moduleNotifications = null
    let moduleAudit = null
    let moduleHelp = null
    let moduleHeader = null

    // Removes everything this module contributed: registry entries, navigation
    // items and routes. Safe to run more than once.
    const cleanup = () => {
      try { moduleContextActions?.clear?.() } catch {}
      try { moduleContextInteractions?.clear?.() } catch {}
      try { moduleResourceViews?.clear?.() } catch {}
      try { moduleCodeEditor?.clear?.() } catch {}
      try { moduleDashboardWidgets?.clear?.() } catch {}
      try { moduleQuickActions?.clear?.() } catch {}
      try { moduleNotifications?.clear?.() } catch {}
      try { moduleAudit?.clear?.() } catch {}
      try { moduleHelp?.clear?.() } catch {}
      try { moduleHeader?.clear?.() } catch {}
      try { runtime.removeNavigation?.(descriptor.id) } catch {}
      for (const remove of routeRemovers.splice(0)) {
        try { remove() } catch {}
      }
      for (const path of routePaths.splice(0)) {
        if (routeOwners.get(path) === descriptor.id) routeOwners.delete(path)
      }
    }

    const work = (async () => {
      const imported = await import(/* @vite-ignore */ descriptor.entry)
      const plugin = imported.default || imported
      if (!plugin || typeof plugin.register !== 'function') {
        throw new Error('module does not export register(context)')
      }
      const addNavigation = (item) => {
        if (abandoned) throw new Error(`module ${descriptor.id} was abandoned after a failed or timed-out register(); addNavigation is refused`)
        // Keep the contribution registered even when globally hidden so Core
        // surfaces such as Module Manager can still deep-link to an enabled
        // module. The shell remains authoritative for whether it is shown in
        // the left navigation. Optional `permission` / `permissions` fields on
        // the item pass through; the shell hides an item the user lacks.
        runtime.addNavigation({
          ...item,
          visible: descriptor.visible !== false && item?.visible !== false,
          moduleId: descriptor.id,
          owner: descriptor.id,
        })
      }
      const moduleRouter = guardedModuleRouter(runtime.router, descriptor, routeOwners, {
        isAbandoned,
        onRouteAdded(path, remove) {
          routePaths.push(path)
          if (typeof remove === 'function') routeRemovers.push(remove)
        },
      })
      moduleContextActions = guardAbandoned(runtime.contextActions?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleContextInteractions = guardAbandoned(runtime.contextInteractions?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleResourceViews = guardAbandoned(runtime.resourceViews?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleCodeEditor = guardAbandoned(runtime.codeEditor?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleDashboardWidgets = guardAbandoned(runtime.dashboardWidgets?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleQuickActions = guardAbandoned(runtime.quickActions?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleNotifications = guardAbandoned(runtime.notifications?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleAudit = guardAbandoned(runtime.audit?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleHelp = guardAbandoned(runtime.help?.forModule(descriptor.id, descriptor) || null, isAbandoned, descriptor.id)
      moduleHeader = guardAbandoned(runtime.header?.forModule(descriptor.id, { permissions: descriptor.permissions || [] }) || null, isAbandoned, descriptor.id)
      await plugin.register({
        ...runtime,
        context: runtime.state.context,
        router: moduleRouter,
        addNavigation,
        Vue,
        descriptor,
        contextActions: moduleContextActions,
        contextInteractions: moduleContextInteractions,
        resourceViews: moduleResourceViews,
        codeEditor: moduleCodeEditor,
        dashboardWidgets: moduleDashboardWidgets,
        quickActions: moduleQuickActions,
        notifications: moduleNotifications,
        audit: moduleAudit,
        help: moduleHelp,
        header: moduleHeader,
      })
    })()
    // A register() that settles after the budget ran out is already marked
    // abandoned: whatever it added in the meantime is removed again.
    work.then(() => { if (abandoned) cleanup() }, () => { if (abandoned) cleanup() })

    try {
      await raceBudget(work, budget)
      loaded.push(descriptor.id)
    } catch (error) {
      abandoned = true
      cleanup()
      const entry = { id: descriptor.id, message: error?.message || String(error) }
      if (error?.timedOut) entry.timedOut = true
      failed.push(entry)
    }
  }

  return { loaded, failed, skipped }
}
