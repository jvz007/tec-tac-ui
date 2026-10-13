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

// Same id rule as src/tactical-operations.js. Repeated here because this file
// is loaded by older tests as a data: URL and must not gain relative imports.
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

function refuseOperation(message) {
  return Object.assign(new Error(message), { status: 0, payload: null, code: null })
}

// The id a module replaces under AD-20: descriptor.replaces, else the
// `replaces` of its module_status row. Anything but a non-empty string means
// the module replaces nothing. loadUiModules reads this once for every module
// before any register() runs, so a module cannot change it afterwards.
function replacedModuleId(descriptor, runtime) {
  const direct = descriptor?.replaces
  if (typeof direct === 'string' && direct) return direct
  const rows = runtime?.state?.context?.module_status
  if (Array.isArray(rows)) {
    const row = rows.find((item) => item && item.id === descriptor?.id)
    if (row && typeof row.replaces === 'string' && row.replaces) return row.replaces
  }
  return ''
}

// Decodes %XX sequences until nothing changes (bounded). Never throws, so a
// malformed sequence cannot hide a segment. Returns null when the bound is hit.
function decodeToFixedPoint(text) {
  let current = text
  for (let i = 0; i < 8; i += 1) {
    const next = current.replace(/%([0-9a-f]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    if (next === current) return current
    current = next
  }
  return null
}

// One definition of junk: C0 controls, DEL, C1 controls, zero-width and
// line-separator characters. Wider than what the URL parser drops (tab, CR, LF),
// so no hidden character can matter.
const JUNK_PATTERN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g
function stripJunk(text) { return text.replace(JUNK_PATTERN, '') }

// The module ids named by a tactical-operations path, or null when the path
// cannot be read safely (callers treat null as a refusal).
function operationTargets(text) {
  const decoded = decodeToFixedPoint(stripJunk(text))
  if (decoded === null) return null
  const found = []
  const candidates = [decoded, decoded.split(/[?#]/)[0]]
  for (const candidate of candidates) {
    const out = []
    for (const part of candidate.replace(/[\\]/g, '/').split('/')) {
      if (part === '.' || part === '') continue
      if (part === '..') { out.pop(); continue }
      out.push(part.toLowerCase())
    }
    for (let i = 0; i + 2 < out.length; i += 1) {
      if (out[i] === 'tfd' && out[i + 1] === 'tactical-operations') found.push(out[i + 2].split(';')[0])
    }
  }
  return found
}

// Refuses a path that reaches /api/tfd/tactical-operations/<id>/... for an id
// other than the module's own or the one it replaces. Fails closed.
export function guardTacticalOperationPath(path, moduleId, replacedId) {
  if (path === undefined || path === null) return
  let text
  try { text = typeof path === 'string' ? path : String(path) } catch { text = '' }
  const cleaned = stripJunk(text)
  const raw = cleaned.toLowerCase()
  const mentions = cleaned.length !== text.length || raw.includes('tfd') || raw.includes('tactical') || raw.includes('%') || raw.includes('\\')
  if (!mentions) return
  const own = String(moduleId).toLowerCase()
  const replaced = typeof replacedId === 'string' ? replacedId.toLowerCase() : ''
  const targets = operationTargets(cleaned)
  if (targets === null) {
    throw refuseOperation(`Module "${moduleId}" used a path the shell cannot read safely. The call is refused.`)
  }
  for (const id of [...targets, ...(operationTargets(cleaned.split(/[?#]/)[0]) || [])]) {
    if (id !== own && id !== replaced) {
      const allowed = replacedId ? `"${moduleId}" or "${replacedId}"` : `"${moduleId}"`
      throw refuseOperation(`Module "${moduleId}" cannot run Tactical operations for "${id}". It may use only ${allowed}.`)
    }
  }
}

function guardTransport(runtime, moduleId, replacedId) {
  const out = {}
  for (const key of ['api', 'apiRaw', 'apiBlob', 'apiText']) {
    const fn = runtime[key]
    if (typeof fn !== 'function') continue
    out[key] = function guardedTransport(path, ...rest) {
      try { guardTacticalOperationPath(path, moduleId, replacedId) } catch (error) { return Promise.reject(error) }
      return fn(path, ...rest)
    }
  }
  return out
}

// Binds context.tacticalOperation to the module that receives it. Core checks
// the module id in the URL, not which module's code made the call, so the shell
// enforces it here: a module may use its own id, plus the one core module it
// replaces. Order: id syntax, then scope, then params and body, then request.
export function bindTacticalOperation(operation, { moduleId, replaces, isAbandoned } = {}) {
  return async function tacticalOperation(targetModuleId, operationId, options) {
    if (typeof isAbandoned === 'function' && isAbandoned()) {
      throw new Error(`module ${moduleId} was abandoned after a failed or timed-out register(); tacticalOperation() is refused`)
    }
    const syntaxOk = typeof targetModuleId === 'string' && OPERATION_ID_PATTERN.test(targetModuleId)
      && typeof operationId === 'string' && OPERATION_ID_PATTERN.test(operationId)
    if (syntaxOk) {
      const replacedId = typeof replaces === 'function' ? replaces() : replaces
      const replaced = typeof replacedId === 'string' && replacedId ? replacedId : ''
      if (targetModuleId !== moduleId && targetModuleId !== replaced) {
        const allowed = replaced ? `"${moduleId}" or "${replaced}"` : `"${moduleId}"`
        throw refuseOperation(`Module "${moduleId}" cannot run Tactical operations for "${targetModuleId}". It may use only ${allowed}.`)
      }
    }
    return operation(targetModuleId, operationId, options)
  }
}

// Popup mode (0.12.95). A route with meta.popup === true is also reachable at /popup/<id><path> for the owning module, so
// its component reads useRoute().params unchanged. Its permission is checked before it renders (AD-12). The alias rule is
// the one in popupAliasPath (src/popup-mode.js), repeated here because this file must not gain relative imports.
const POPUP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
// One rule for a route path, the same as popupRoutePathProblem in popup-mode.js: the router's parameter syntax
// (':name', an optional group, a modifier '?', '*' or '+') is fine; any other '?', '#', whitespace, '..', a backslash and
// control or zero-width characters are not (0.12.97).
const POPUP_JUNK_PATTERN = new RegExp('[\x00-\x1f\x7f-\x9f' + String.fromCharCode(0x200b) + '-' + String.fromCharCode(0x200f, 0x2028, 0x2029, 0xfeff) + ']')
function popupRoutePathProblem(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return 'the route path does not start with /'
  if (path.includes('..')) return "the route path contains '..'"
  if (/[\\#\s]/.test(path) || POPUP_JUNK_PATTERN.test(path)) return 'the route path contains a backslash, #, whitespace or a control character'
  if (path.replace(/:[A-Za-z0-9_]+(\([^()]*\))?[?*+]?/g, '').includes('?')) return "the route path contains a '?' that is not an optional-parameter marker"
  return ''
}
function withPopupRoute(route, popup) {
  if (route.meta?.popup !== true) return route
  const problem = !POPUP_ID_PATTERN.test(String(popup.moduleId)) ? 'the module id is not valid' : popupRoutePathProblem(route.path)
  if (problem) {
    // Never silent: a route that asks for a popup and cannot get one is named, so the window's refusal can be traced.
    console.warn(`[TEC-TAC-UI] module ${popup.moduleId} route ${String(route.path)} has meta.popup but got no popup alias: ${problem}.`)
    return route
  }
  const alias = `/popup/${popup.moduleId}${route.path}`
  const existing = route.alias === undefined ? [] : [].concat(route.alias)
  const previousGuard = route.beforeEnter
  return {
    ...route,
    alias: [...existing, alias],
    beforeEnter(to, from) {
      if (!popup.permitted(route.meta || {})) {
        popup.refuse?.(popup.deniedMessage)
        return '/popup/refused'
      }
      return typeof previousGuard === 'function' ? previousGuard.call(this, to, from) : true
    },
  }
}

// Binds context.popupHref to the module that receives it. The shared helper names the module it is given, and the bound
// helper always passes this module's own id. It is refused after a failed or timed-out register().
export function bindPopupHref(href, { moduleId, isAbandoned } = {}) {
  return function popupHref(path) {
    if (typeof isAbandoned === 'function' && isAbandoned()) {
      throw new Error(`module ${moduleId} was abandoned after a failed or timed-out register(); popupHref() is refused`)
    }
    const built = href(moduleId, path)
    return typeof built === 'string' ? built : ''
  }
}

// Binds register(context).confirm to the module that receives it. The shell adds the "Asked by <module id>" line
// itself, so a module cannot name another asker. It is refused after a failed or timed-out register().
export function bindConfirm(confirm, { moduleId, isAbandoned } = {}) {
  return function confirmForModule(options) {
    if (typeof isAbandoned === 'function' && isAbandoned()) {
      return Promise.reject(new Error(`module ${moduleId} was abandoned after a failed or timed-out register(); confirm() is refused`))
    }
    return confirm(options, moduleId)
  }
}

// The /popup/ prefix is the shell's (0.12.96). Only withPopupRoute adds a path under it, for the owning module's own
// route. A module's own path or alias there is refused, so no module can shadow another module's popup address.
// Matching in vue-router ignores case and repeated slashes, so the check does too.
const POPUP_PREFIX_PATTERN = /^\/popup(\/|$)/i
function underPopupPrefix(path) { return POPUP_PREFIX_PATTERN.test(String(path).trim().replace(/\/{2,}/g, '/')) }

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

        const ownAliases = route.alias === undefined || route.alias === null ? [] : [].concat(route.alias).map((item) => String(item).trim())
        if (underPopupPrefix(path) || ownAliases.some(underPopupPrefix)) {
          throw new Error(`module ${descriptor.id} cannot register a route or alias under /popup/; that prefix belongs to the shell`)
        }

        const existing = target.getRoutes()
        const pathMatch = existing.find((item) => item.path === path)
        const nameMatch = name ? existing.find((item) => String(item.name || '') === name) : null
        const conflict = pathMatch || nameMatch
        if (conflict) {
          const key = pathMatch ? `path ${path}` : `name ${name}`
          const owner = routeOwners.get(conflict.path) || conflict.meta?.dynamicModule || 'core shell / previously registered route'
          throw new Error(`module ${descriptor.id} cannot claim ${key}; it is already owned by ${owner}`)
        }

        let decorated = {
          ...route,
          meta: { ...(route.meta || {}), dynamicModule: descriptor.id },
        }
        if (hooks.popup) decorated = withPopupRoute(decorated, hooks.popup)
        // Every alias, the module's own and the popup one, is checked against the paths and aliases already registered.
        const decoratedAliases = decorated.alias === undefined || decorated.alias === null ? [] : [].concat(decorated.alias).map((item) => String(item))
        for (const alias of decoratedAliases) {
          const taken = existing.find((item) => item.path === alias)
          if (taken) {
            const owner = routeOwners.get(taken.path) || taken.meta?.dynamicModule || 'core shell / previously registered route'
            throw new Error(`module ${descriptor.id} cannot claim alias ${alias}; it is already owned by ${owner}`)
          }
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

export function moduleIsAllowed(descriptor, context) {
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
  // Taken before any register() runs: an earlier module can edit a later
  // module's descriptor or its module_status row, so nothing reads them again.
  const replacedSnapshot = new Map()
  for (const item of modules) replacedSnapshot.set(item?.id, replacedModuleId(item, runtime))
  Object.freeze(replacedSnapshot)

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
      // Popup mode is on only for the module the popup window opens; every other module gets no alias (0.12.95).
      const popupForModule = runtime.popupMode && runtime.popupMode.moduleId === descriptor.id ? runtime.popupMode : null
      const moduleRouter = guardedModuleRouter(runtime.router, descriptor, routeOwners, {
        isAbandoned,
        popup: popupForModule,
        onRouteAdded(path, remove) {
          routePaths.push(path)
          if (typeof remove === 'function') routeRemovers.push(remove)
        },
      })
      moduleContextActions = guardAbandoned(runtime.contextActions?.forModule(descriptor.id, { isAbandoned }) || null, isAbandoned, descriptor.id)
      moduleContextInteractions = guardAbandoned(runtime.contextInteractions?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleResourceViews = guardAbandoned(runtime.resourceViews?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleCodeEditor = guardAbandoned(runtime.codeEditor?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleDashboardWidgets = guardAbandoned(runtime.dashboardWidgets?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleQuickActions = guardAbandoned(runtime.quickActions?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleNotifications = guardAbandoned(runtime.notifications?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleAudit = guardAbandoned(runtime.audit?.forModule(descriptor.id) || null, isAbandoned, descriptor.id)
      moduleHelp = guardAbandoned(runtime.help?.forModule(descriptor.id, descriptor) || null, isAbandoned, descriptor.id)
      moduleHeader = guardAbandoned(runtime.header?.forModule(descriptor.id, { permissions: descriptor.permissions || [] }) || null, isAbandoned, descriptor.id)
      // removeNavigation is Core's: the loader calls it when a module fails. A
      // module can add navigation but never remove another module's items.
      const { removeNavigation: _coreOnly, tacticalOperation: sharedTacticalOperation, popupMode: _popupOnly, popupHref: sharedPopupHref, confirm: sharedConfirm, ...moduleRuntime } = runtime
      // Bound to this module: another module's id is refused, and so is any
      // call after a failed or timed-out register().
      const boundTacticalOperation = typeof sharedTacticalOperation === 'function'
        ? { tacticalOperation: bindTacticalOperation(sharedTacticalOperation, {
          moduleId: descriptor.id,
          replaces: replacedSnapshot.get(descriptor.id) || '',
          isAbandoned,
        }) }
        : {}
      // popupHref names this module's own popup window only (0.12.95).
      const boundPopupHref = typeof sharedPopupHref === 'function'
        ? { popupHref: bindPopupHref(sharedPopupHref, { moduleId: descriptor.id, isAbandoned }) }
        : {}
      // confirm is the shell's Yes or No dialog, bound to this module (0.12.96).
      const boundConfirm = typeof sharedConfirm === 'function'
        ? { confirm: bindConfirm(sharedConfirm, { moduleId: descriptor.id, isAbandoned }) }
        : {}
      await plugin.register({
        ...moduleRuntime,
        ...guardTransport(runtime, descriptor.id, replacedSnapshot.get(descriptor.id) || ''),
        ...boundTacticalOperation,
        ...boundPopupHref,
        ...boundConfirm,
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
