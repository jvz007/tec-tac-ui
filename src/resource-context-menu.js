// Right-click menu on Clients and Sites (0.12.99, CO23, CK10). The pure parts live here so they can be tested without a browser:
// what is in the menu, where it sits, which keys move it, and when a right-click is left to the browser.

const MENU_MARGIN = 8
const TEXT_TARGET = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]'

// A right-click on a text field keeps the browser's own menu (copy, paste, spell check).
export function menuTargetIsTextField(target) {
  return !!(target && typeof target.closest === 'function' && target.closest(TEXT_TARGET))
}

// Where the menu opens. A mouse gives clientX and clientY. Shift+F10 and the menu key give none (0, 0 or missing), so the
// menu opens under the row that has focus.
export function menuAnchor(event, element = null) {
  const x = Number(event?.clientX)
  const y = Number(event?.clientY)
  const fromKeyboard = !Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)
  if (fromKeyboard && element && typeof element.getBoundingClientRect === 'function') {
    const box = element.getBoundingClientRect()
    return { x: box.left + 16, y: box.bottom }
  }
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
}

// Keeps the whole menu inside the viewport. A menu larger than the viewport sits at the margin.
export function clampMenuPosition({ x, y }, { width, height }, viewport, margin = MENU_MARGIN) {
  const maxX = viewport.width - width - margin
  const maxY = viewport.height - height - margin
  return {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(y, maxY)),
  }
}

// Arrow keys, Home and End move between the enabled and disabled items alike (a disabled item still shows its reason).
export function nextMenuIndex(current, key, count) {
  if (!count) return -1
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % count
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1
  return current
}

// The menu's items. Built-in entries follow the same permission checks as the row buttons and are left out when denied
// (AD-12: denied means hidden). Contributed actions come after a divider and keep the Extensions button's rules: a disabled
// one stays with its reason, and Core's permission rule already hides a denied one. `handlers` are the page's own
// functions (add a site, edit, edit fields, delete); `moduleActions` is what `contextActions.list` returned.
export function resourceMenuEntries({ resourceType, row, can = {}, handlers = {}, moduleActions = [] }) {
  const entries = []
  const builtin = (id, label, allowed, run, extra = {}) => {
    if (allowed && typeof run === 'function') entries.push({ id, label, kind: 'builtin', run: () => run(row), ...extra })
  }
  if (resourceType === 'client') {
    builtin('client.add-site', 'Add site', can.manageSites, handlers.addSite)
    builtin('client.edit', 'Edit client', can.manageClients, handlers.edit)
    builtin('client.fields', 'Edit fields', can.manageClients, handlers.fields)
    builtin('client.delete', 'Delete client', can.manageClients, handlers.remove, { danger: true })
  } else if (resourceType === 'site') {
    builtin('site.edit', 'Edit site', can.manageSites, handlers.edit)
    builtin('site.fields', 'Edit fields', can.manageSites, handlers.fields)
    builtin('site.delete', 'Delete site', can.manageSites, handlers.remove, { danger: true })
  }
  const contributed = (Array.isArray(moduleActions) ? moduleActions : []).map((action) => ({
    id: action.id,
    label: action.label,
    kind: 'module',
    danger: action.dangerous === true,
    disabled: action.state?.enabled === false,
    reason: action.state?.enabled === false ? (action.state?.reason || 'Unavailable for this selection.') : '',
    action,
  }))
  if (entries.length && contributed.length) entries.push({ id: 'divider', divider: true })
  return [...entries, ...contributed]
}
