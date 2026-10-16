import { reactive } from 'vue'

// 0.12.112: the shell-owned dialog host for modules (Johan, 16 October 2026). A module opens one dialog at a time, in the same
// layer as Quick Actions. The shell draws the backdrop, the panel, the title, the close button, the focus trap and Escape. The
// module renders its own content into the element it is given.
//
// createModuleDialogService() is shared. forModule(moduleId, { isAbandoned }) binds one copy to one module: its own id, so a
// module can open only its own dialogs, and it is refused after a failed or timed-out register() and after it is unloaded.
// The loader does the binding and calls clear() on cleanup. The host component (components/ModuleDialogHost.vue) calls
// mountCurrent() once the panel is drawn, and requestClose() for Escape, the close button and a backdrop click.
//
// Import-free apart from vue: older tests load this file as a data: URL with only the vue import replaced.

const LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const MODULE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const MAX_TITLE = 200
const DEFAULT_TIMEOUT_SECONDS = 30
const MIN_TIMEOUT_SECONDS = 5
const MAX_TIMEOUT_SECONDS = 300

function refuse(message) {
  return Object.assign(new Error(message), { status: 0, payload: null, code: null })
}

// Control, zero-width and line-separator characters, by code point. Checked by number, not by a regex literal, because a regex
// literal cannot hold U+2028 or U+2029.
export function isJunkCode(code) {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || (code >= 0x200b && code <= 0x200f)
    || code === 0x2028 || code === 0x2029 || code === 0xfeff
}

// Plain text only: control, zero-width and line-separator characters become a space, runs of spaces collapse, and the text is cut.
export function cleanDialogTitle(value) {
  if (typeof value !== 'string') return ''
  const spaced = [...value].map((ch) => (isJunkCode(ch.codePointAt(0)) ? ' ' : ch)).join('')
  const text = spaced.replace(/ {2,}/g, ' ').trim()
  return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1).trimEnd()}…` : text
}

// The same rule as the register() time limit: a whole number from 5 to 300 seconds, otherwise 30.
export function dialogTimeoutMs(seconds) {
  const valid = Number.isInteger(seconds) && seconds >= MIN_TIMEOUT_SECONDS && seconds <= MAX_TIMEOUT_SECONDS
  return (valid ? seconds : DEFAULT_TIMEOUT_SECONDS) * 1000
}

// Checks and copies a descriptor. Throws a TypeError for anything that cannot be a dialog. The id is module-local.
function normalizeDescriptor(descriptor, moduleId) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    throw new TypeError('a dialog needs a descriptor with an id and a mount(element, { close }) function')
  }
  const localId = typeof descriptor.id === 'string' ? descriptor.id : ''
  if (!LOCAL_ID.test(localId)) {
    throw new TypeError('a dialog id uses letters, digits, "_" and "-" only, at most 64 characters, and no dot')
  }
  if (typeof descriptor.mount !== 'function') throw new TypeError(`dialog ${localId} needs a mount(element, { close }) function`)
  if (descriptor.beforeClose !== undefined && typeof descriptor.beforeClose !== 'function') {
    throw new TypeError(`dialog ${localId} beforeClose must be a function when it is given`)
  }
  return Object.freeze({
    moduleId,
    localId,
    fullId: `${moduleId}.${localId}`,
    title: cleanDialogTitle(descriptor.title),
    size: descriptor.size === 'wide' ? 'wide' : 'default',
    mount: descriptor.mount,
    beforeClose: typeof descriptor.beforeClose === 'function' ? descriptor.beforeClose : null,
  })
}

// A cleanup is a function, or an object with unmount(). Anything else means there is nothing to clean up.
function cleanupOf(result) {
  if (typeof result === 'function') return result
  if (result && typeof result === 'object' && typeof result.unmount === 'function') return () => result.unmount()
  return null
}

function clearElement(element) {
  if (!element) return
  try {
    if (typeof element.replaceChildren === 'function') element.replaceChildren()
    else element.textContent = ''
  } catch {
    // An element that cannot be cleared is left as it is; the panel is gone either way.
  }
}

function activeElementNow() {
  try {
    const doc = globalThis.document
    return doc ? doc.activeElement : null
  } catch {
    return null
  }
}

export function createModuleDialogService({
  isPopup = () => false,
  isSignedOut = () => false,
  isTrustedContext = () => true,
  timeoutSeconds = () => undefined,
  warn = (...args) => console.warn(...args),
} = {}) {
  // What the host draws. Mutated only through this object, so Vue sees every change.
  const state = reactive({ current: null })
  // fullId -> { moduleId, descriptor }. A registration lives only while its module is loaded.
  const registry = new Map()
  // The one open dialog, as the service keeps it (functions included, so not in state).
  let session = null
  let tokenCounter = 0

  const budget = () => dialogTimeoutMs(Number(timeoutSeconds()))
  const safeWarn = (...args) => { try { warn(...args) } catch { /* a broken logger never breaks a dialog */ } }

  function closeSession(current) {
    if (!current || current.closed) return
    current.closed = true
    if (session === current) {
      session = null
      state.current = null
    }
    const cleanup = current.cleanup
    current.cleanup = null
    if (cleanup) {
      try { cleanup() } catch (error) { safeWarn(`[TEC-TAC-UI] module ${current.moduleId} dialog cleanup failed.`, error?.message || error) }
    }
    clearElement(current.element)
    const opener = current.returnFocus
    if (opener && typeof opener.focus === 'function') {
      try { opener.focus() } catch { /* the opener left the page */ }
    }
    current.resolveClosed?.()
  }

  // Refuses a second dialog, a popup window, a signed-out or untrusted page. Returns a promise that resolves when the dialog closes.
  function openSession(descriptor) {
    if (isPopup()) throw refuse('Module dialogs do not open in a popup window.')
    if (isSignedOut()) throw refuse('Module dialogs do not open while you are signed out.')
    if (!isTrustedContext()) throw refuse('Module dialogs open only in a signed-in Tec-Tac session.')
    if (session) throw refuse('Another module dialog is already open. Close it first.')
    tokenCounter += 1
    state.current = {
      id: descriptor.fullId,
      moduleId: descriptor.moduleId,
      token: tokenCounter,
      title: descriptor.title || 'Dialog',
      size: descriptor.size,
      status: 'mounting',
      error: '',
    }
    const current = {
      moduleId: descriptor.moduleId,
      localId: descriptor.localId,
      view: state.current,
      mount: descriptor.mount,
      beforeClose: descriptor.beforeClose,
      element: null,
      cleanup: null,
      mounted: false,
      closed: false,
      timedOut: false,
      checking: false,
      returnFocus: activeElementNow(),
      resolveClosed: null,
    }
    session = current
    return new Promise((resolve) => { current.resolveClosed = () => resolve(undefined) })
  }

  // Called by the host once the panel is drawn. The mount runs once, under the register() time limit.
  function mountCurrent(element) {
    const current = session
    if (!current || current.mounted || current.closed || !element) return false
    current.mounted = true
    current.element = element
    const view = current.view
    const close = () => closeSession(current)
    let work
    try {
      work = Promise.resolve(current.mount(element, { close }))
    } catch (error) {
      work = Promise.reject(error)
    }
    const seconds = Math.round(budget() / 1000)
    const timer = setTimeout(() => {
      if (current.closed || view.status !== 'mounting') return
      current.timedOut = true
      clearElement(element)
      view.status = 'failed'
      view.error = `This dialog did not open within ${seconds} seconds.`
      safeWarn(`[TEC-TAC-UI] module ${current.moduleId} dialog ${current.localId} did not open within ${seconds} seconds.`)
    }, budget())
    work.then((result) => {
      clearTimeout(timer)
      if (current.closed || current.timedOut) {
        // A late result after close or timeout is cleaned up at once.
        const late = cleanupOf(result)
        if (late) { try { late() } catch { /* nothing more to do */ } }
        return
      }
      current.cleanup = cleanupOf(result)
      view.status = 'open'
    }, (error) => {
      clearTimeout(timer)
      if (current.closed || current.timedOut) return
      clearElement(element)
      view.status = 'failed'
      view.error = 'This dialog could not be shown.'
      safeWarn(`[TEC-TAC-UI] module ${current.moduleId} dialog ${current.localId} failed to open.`, error?.message || error)
    })
    return true
  }

  // Escape, the close button and a backdrop click. A failed dialog has nothing to lose and closes at once; otherwise the
  // module's beforeClose() decides. It keeps the dialog open by returning false (or a Promise of false), or by throwing.
  async function requestClose() {
    const current = session
    if (!current || current.closed || current.checking) return false
    if (current.view.status === 'failed' || !current.beforeClose) {
      closeSession(current)
      return true
    }
    current.checking = true
    let keepOpen = false
    try {
      const answer = await current.beforeClose()
      keepOpen = answer === false
    } catch (error) {
      keepOpen = true
      safeWarn(`[TEC-TAC-UI] module ${current.moduleId} dialog ${current.localId} beforeClose() failed; the dialog stays open.`, error?.message || error)
    } finally {
      current.checking = false
    }
    if (keepOpen || current.closed) return false
    closeSession(current)
    return true
  }

  // Sign-out, an invalid session and leaving the page: close at once, without asking beforeClose().
  function closeAll() {
    if (session) closeSession(session)
  }

  function isOpen() {
    return session !== null
  }

  function isRegistered(fullId) {
    return registry.has(String(fullId || ''))
  }

  // Used by the sign-in landing check for a { dialog } result. Only a registered dialog of a loaded module opens.
  function openRegistered(fullId) {
    const entry = registry.get(String(fullId || ''))
    if (!entry) throw refuse(`Dialog ${String(fullId || '')} is not registered.`)
    return openSession(entry.descriptor)
  }

  // Closes the module's open dialog and drops its registrations. The loader calls this when the module is unloaded.
  function removeProvider(moduleId) {
    const owner = String(moduleId || '')
    for (const [key, entry] of [...registry]) {
      if (entry.moduleId === owner) registry.delete(key)
    }
    if (session && session.moduleId === owner) closeSession(session)
  }

  function forModule(moduleId, { isAbandoned } = {}) {
    const provider = String(moduleId || '')
    if (!MODULE_ID.test(provider)) throw new Error('module ID is required for dialogs')
    const own = new Set()
    let shut = false
    const blocked = () => shut || (typeof isAbandoned === 'function' && isAbandoned() === true)
    const refusedMessage = (what) => `module ${provider} was abandoned or unloaded; ${what} is refused`

    return Object.freeze({
      // Registers a dialog that the sign-in landing check may name as { dialog: '<module id>.<dialog id>' }.
      register(descriptor) {
        if (blocked()) throw refuse(refusedMessage('dialogs.register()'))
        const normalized = normalizeDescriptor(descriptor, provider)
        registry.set(normalized.fullId, { moduleId: provider, descriptor: normalized })
        own.add(normalized.fullId)
      },
      // Opens a registered dialog by its module-local id, or a descriptor given here. Resolves when the dialog closes; a refusal
      // rejects with a plain error (status 0, no code).
      open(input) {
        try {
          if (blocked()) throw refuse(refusedMessage('dialogs.open()'))
          if (typeof input === 'string') {
            const fullId = `${provider}.${input}`
            const entry = LOCAL_ID.test(input) ? registry.get(fullId) : null
            if (!entry) throw refuse(`Dialog ${input} is not registered by ${provider}.`)
            return openSession(entry.descriptor)
          }
          return openSession(normalizeDescriptor(input, provider))
        } catch (error) {
          return Promise.reject(error)
        }
      },
      // Called by the loader on cleanup: refuses later calls, closes this module's open dialog and drops its registrations.
      clear() {
        shut = true
        for (const fullId of own) {
          const entry = registry.get(fullId)
          if (entry && entry.moduleId === provider) registry.delete(fullId)
        }
        own.clear()
        if (session && session.moduleId === provider) closeSession(session)
      },
    })
  }

  return Object.freeze({
    state,
    forModule,
    mountCurrent,
    requestClose,
    closeAll,
    isOpen,
    isRegistered,
    openRegistered,
    removeProvider,
  })
}
