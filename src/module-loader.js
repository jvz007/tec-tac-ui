import * as Vue from 'vue'

function guardedModuleRouter(router, descriptor, routeOwners) {
  return new Proxy(router, {
    get(target, prop, receiver) {
      if (prop !== 'addRoute') return Reflect.get(target, prop, receiver)
      return (parentOrRoute, maybeRoute) => {
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

  return descriptor.permissions.every((code) => context.permissions.includes(code))
}

export async function loadPublicUiModules(runtime, modules) {
  const loaded = []
  const failed = []

  for (const descriptor of modules) {
    const publicDescriptor = descriptor.public
    if (!publicDescriptor?.entry || !publicDescriptor?.base_path) continue

    try {
      const imported = await import(/* @vite-ignore */ publicDescriptor.entry)
      const plugin = imported.default || imported
      if (!plugin || typeof plugin.registerPublic !== 'function') {
        throw new Error('public module does not export registerPublic(context)')
      }

      const basePath = publicDescriptor.base_path
      const addPublicRoute = (route) => {
        if (!route || typeof route !== 'object' || !route.path) {
          throw new Error('addPublicRoute requires a route with a path')
        }
        if (route.path !== basePath && !route.path.startsWith(`${basePath}/`)) {
          throw new Error(`public route must stay within ${basePath}`)
        }
        runtime.router.addRoute({
          ...route,
          meta: {
            ...(route.meta || {}),
            public: true,
            publicModule: descriptor.id,
          },
        })
      }

      await plugin.registerPublic({
        Vue,
        app: runtime.app,
        descriptor,
        addPublicRoute,
        publicApi: runtime.publicApi,
      })
      loaded.push(descriptor.id)
    } catch (error) {
      failed.push({ id: descriptor.id, message: error?.message || String(error) })
    }
  }

  if (loaded.length && runtime.router.currentRoute.value.path.startsWith('/public/')) {
    await runtime.router.replace(runtime.router.currentRoute.value.fullPath)
  }

  return { loaded, failed }
}

export async function loadUiModules(runtime, modules) {
  const loaded = []
  const failed = []
  const skipped = []
  const routeOwners = new Map()

  for (const descriptor of modules) {
    if (!descriptor.entry) continue
    if (!moduleIsAllowed(descriptor, {
      permissions: runtime.state.context.permissions || [],
      user: runtime.state.context.user || {},
      source: runtime.state.contextSource,
    })) {
      skipped.push({ id: descriptor.id, reason: 'permission-gated' })
      continue
    }

    let moduleContextActions = null
    try {
      const imported = await import(/* @vite-ignore */ descriptor.entry)
      const plugin = imported.default || imported
      if (!plugin || typeof plugin.register !== 'function') {
        throw new Error('module does not export register(context)')
      }
      const addNavigation = (item) => {
        if (descriptor.visible === false) return
        // Package/module navigation may declare a default visibility, but the
        // resolved descriptor is authoritative after installation. Strip any
        // stale module-supplied visibility flag so an operator Show override
        // cannot be hidden again by register().
        runtime.addNavigation({ ...item, visible: true })
      }
      const moduleRouter = guardedModuleRouter(runtime.router, descriptor, routeOwners)
      moduleContextActions = runtime.contextActions?.forModule(descriptor.id) || null
      await plugin.register({
        ...runtime,
        router: moduleRouter,
        addNavigation,
        Vue,
        descriptor,
        contextActions: moduleContextActions,
      })
      loaded.push(descriptor.id)
    } catch (error) {
      try { moduleContextActions?.clear?.() } catch {}
      failed.push({ id: descriptor.id, message: error?.message || String(error) })
    }
  }

  return { loaded, failed, skipped }
}
