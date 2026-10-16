import { markRaw, reactive } from 'vue'
import { isJunkCode } from './module-dialogs.js'
import { menuAnchor, menuTargetIsTextField } from './resource-context-menu.js'

// 0.12.112: the shell row menu for module tables (checks 0.16.0 request, UI Q71). A module calls
// context.rowMenu.open({ event, element, label, items }) on a right-click, the Menu key or Shift+F10. The shell places the menu at
// the pointer, or under the focused row for the keys, with the look and the keys of the Clients and Sites menu
// (components/ResourceContextMenu.vue). It sits in layer 1150: above a module dialog (1100), under toasts (1200), the unsaved
// changes dialog (1300) and the Yes or No confirm (1400).
//
// createRowMenuService() is shared. forModule(moduleId, { isAbandoned }) binds one copy to one module: its own items only, one
// menu open at a time, refused in a popup window, while signed out and outside a backend context, and refused after the module
// failed or is unloaded. The loader does the binding and calls clear() on cleanup. The host component (components/RowMenuHost.vue)
// draws the menu and reports a close or a choice. Every label, hint and reason is plain text.

export const ROW_MENU_LIMITS = Object.freeze({
  maxItems: 40,
  maxLabel: 80,
  maxHint: 120,
  maxReason: 120,
  maxMenuLabel: 80,
})

const MODULE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/
const DEFAULT_REASON = 'Unavailable for this selection.'
const DEFAULT_MENU_LABEL = 'Actions'

function refuse(message) {
  return Object.assign(new Error(message), { status: 0, payload: null, code: null })
}

// Plain text only: control, zero-width and line-separator characters become a space, runs of spaces collapse, and the text is cut.
export function cleanMenuText(value, max) {
  if (typeof value !== 'string') return ''
  const spaced = [...value].map((ch) => (isJunkCode(ch.codePointAt(0)) ? ' ' : ch)).join('')
  const text = spaced.replace(/ {2,}/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

// Checks and copies the items. Throws a TypeError for anything that cannot be a menu: no items, more than 40, an item that is not
// an object, a missing or repeated id, a missing label, or an enabled item without run(). The copies are frozen; run() stays with
// the service and never reaches the host.
export function normalizeRowMenuItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new TypeError('a row menu needs a list of items')
  if (items.length > ROW_MENU_LIMITS.maxItems) throw new TypeError(`a row menu holds at most ${ROW_MENU_LIMITS.maxItems} items`)
  const seen = new Set()
  return items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError(`row menu item ${index + 1} must be an object`)
    const id = typeof item.id === 'string' ? item.id : ''
    if (!ITEM_ID.test(id)) throw new TypeError(`row menu item ${index + 1} needs an id of letters, digits and "_", "-", ".", ":" (at most 64 characters)`)
    if (seen.has(id)) throw new TypeError(`row menu item id ${id} is used twice`)
    seen.add(id)
    const label = cleanMenuText(item.label, ROW_MENU_LIMITS.maxLabel)
    if (!label) throw new TypeError(`row menu item ${id} needs a label`)
    const disabled = item.disabled === true
    if (!disabled && typeof item.run !== 'function') throw new TypeError(`row menu item ${id} needs a run() function`)
    return {
      id,
      label,
      hint: cleanMenuText(item.hint, ROW_MENU_LIMITS.maxHint),
      danger: item.danger === true,
      disabled,
      reason: disabled ? (cleanMenuText(item.reason, ROW_MENU_LIMITS.maxReason) || DEFAULT_REASON) : '',
      run: disabled ? null : item.run,
    }
  })
}

// The entries the host draws: everything but run(). Same shape as the Clients and Sites menu entries, plus hint.
export function menuEntriesOf(items) {
  return items.map((item) => Object.freeze({ id: item.id, label: item.label, hint: item.hint, danger: item.danger, disabled: item.disabled, reason: item.reason }))
}

export function createRowMenuService({
  isPopup = () => false,
  isSignedOut = () => false,
  isTrustedContext = () => true,
  warn = (...args) => console.warn(...args),
} = {}) {
  // What the host draws. Mutated only through this object, so Vue sees every change.
  const state = reactive({ current: null })
  // The one open menu, as the service keeps it (run() functions included, so not in state).
  let session = null
  let tokenCounter = 0

  const safeWarn = (...args) => { try { warn(...args) } catch { /* a broken logger never breaks a menu */ } }

  function closeSession(current) {
    if (!current || current.closed) return false
    current.closed = true
    if (session === current) {
      session = null
      state.current = null
    }
    return true
  }

  function openSession(moduleId, { event, element, label, items }) {
    if (isPopup()) throw refuse('Row menus do not open in a popup window.')
    if (isSignedOut()) throw refuse('Row menus do not open while you are signed out.')
    if (!isTrustedContext()) throw refuse('Row menus open only in a signed-in Tec-Tac session.')
    const normalized = normalizeRowMenuItems(items)
    const anchor = menuAnchor(event, element)
    // One menu at a time: a second open replaces the first, as a right-click on another row does.
    if (session) closeSession(session)
    tokenCounter += 1
    const opener = element && typeof element.focus === 'function'
      ? element
      : (globalThis.document?.activeElement || null)
    const current = { moduleId, token: tokenCounter, items: normalized, closed: false }
    session = current
    state.current = {
      token: current.token,
      moduleId,
      x: anchor.x,
      y: anchor.y,
      label: cleanMenuText(label, ROW_MENU_LIMITS.maxMenuLabel) || DEFAULT_MENU_LABEL,
      entries: menuEntriesOf(normalized),
      opener: opener ? markRaw(opener) : null,
    }
    return true
  }

  // The host reports a close (Escape, Tab, outside press, scroll, resize, blur, route change). A stale token does nothing.
  function close(token) {
    if (session && (token === undefined || session.token === token)) closeSession(session)
  }

  // The host reports a choice. The menu closes first, then run() is called once. A disabled item does nothing. An error in
  // run() is contained and warned; it never reaches the shell.
  function choose(token, itemId) {
    const current = session
    if (!current || current.closed || current.token !== token) return false
    const item = current.items.find((entry) => entry.id === itemId)
    if (!item || item.disabled || typeof item.run !== 'function') return false
    closeSession(current)
    try {
      const result = item.run()
      if (result && typeof result.then === 'function') {
        result.then(undefined, (error) => safeWarn(`[TEC-TAC-UI] module ${current.moduleId} row menu item ${item.id} failed.`, error?.message || error))
      }
    } catch (error) {
      safeWarn(`[TEC-TAC-UI] module ${current.moduleId} row menu item ${item.id} failed.`, error?.message || error)
    }
    return true
  }

  // Sign-out, an invalid session and leaving the page: close at once.
  function closeAll() {
    if (session) closeSession(session)
  }

  function isOpen() {
    return session !== null
  }

  // Closes the module's open menu. The loader calls this when the module is unloaded.
  function removeProvider(moduleId) {
    if (session && session.moduleId === String(moduleId || '')) closeSession(session)
  }

  function forModule(moduleId, { isAbandoned } = {}) {
    const provider = String(moduleId || '')
    if (!MODULE_ID.test(provider)) throw new Error('module ID is required for row menus')
    let shut = false
    const blocked = () => shut || (typeof isAbandoned === 'function' && isAbandoned() === true)

    return Object.freeze({
      // Opens the menu. Returns true when it is shown. A refusal (popup, signed out, not a backend context, module unloaded)
      // throws a plain error with status 0 and no code; a malformed menu throws a TypeError.
      open(options) {
        if (blocked()) throw refuse(`module ${provider} was abandoned or unloaded; rowMenu.open() is refused`)
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('rowMenu.open needs { event, element, label, items }')
        return openSession(provider, options)
      },
      // true when the shell will handle this event; false for a right-click on a text field, which the browser keeps.
      shouldHandle(event) {
        return !menuTargetIsTextField(event?.target)
      },
      // Called by the loader on cleanup: refuses later calls and closes this module's open menu.
      clear() {
        shut = true
        removeProvider(provider)
      },
    })
  }

  return Object.freeze({ state, forModule, close, choose, closeAll, isOpen, removeProvider })
}
