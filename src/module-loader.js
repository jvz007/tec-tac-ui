import * as Vue from 'vue'

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

    try {
      const imported = await import(/* @vite-ignore */ descriptor.entry)
      const plugin = imported.default || imported
      if (!plugin || typeof plugin.register !== 'function') {
        throw new Error('module does not export register(context)')
      }
      const addNavigation = (item) => {
        if (descriptor.visible === false) return
        runtime.addNavigation(item)
      }
      await plugin.register({ ...runtime, addNavigation, Vue, descriptor })
      loaded.push(descriptor.id)
    } catch (error) {
      failed.push({ id: descriptor.id, message: error?.message || String(error) })
    }
  }

  return { loaded, failed, skipped }
}
