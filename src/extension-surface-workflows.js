export function loginSsoEntries(ssoProviders, context = {}) {
  return ssoProviders?.list?.(context) || []
}
export async function beginLoginSso(ssoProviders, entry, context = {}) {
  if (!entry?.id || !ssoProviders?.begin) throw new Error('SSO provider is unavailable.')
  return ssoProviders.begin(entry.id, context)
}
function navPermissionList(value) {
  const values = Array.isArray(value) ? value : (value == null || value === '' ? [] : [value])
  return values.map((item) => String(item || '').trim()).filter(Boolean)
}
// AD-12 for module navigation: an item with `permission` / `permissions` is
// hidden when the user lacks them. Superusers always pass; an item with no
// permission field is shown. Outside a backend context there are no
// permissions, so a gated item is hidden. The backend still refuses.
//
// 0.12.99: an item may also carry `tacticalPermission`, a Tactical flag name or a list of them. Every flag must be strictly
// true in `context.tactical_permissions`, the same test as `context.hasTacticalPermission`. A superuser does not bypass it
// (Tactical's flags are Tactical's own), and outside a backend context a gated item is hidden. It combines with
// `permission` / `permissions`: both rules must pass.
function navTacticalPermitted(item, context) {
  const flags = navPermissionList(item?.tacticalPermission)
  if (!flags.length) return true
  if (context.source !== 'backend') return false
  const granted = context.tactical_permissions
  if (!granted || typeof granted !== 'object') return false
  return flags.every((flag) => granted[flag] === true)
}
export function navItemPermitted(item, context = {}) {
  if (!navTacticalPermitted(item, context)) return false
  const required = [...navPermissionList(item?.permission), ...navPermissionList(item?.permissions)]
  if (!required.length) return true
  if (context.user?.superuser) return true
  if (context.source !== 'backend') return false
  const granted = new Set(context.permissions || [])
  return required.every((code) => granted.has(code))
}
export function appHeaderItems(header, context = {}) {
  return header?.list?.(context) || []
}
export function resourceActionContext(resourceType, row, { client = null } = {}) {
  const context = { resource_type: resourceType, resource: row, [resourceType]: row, selection: [row] }
  if (resourceType === 'client') context.client = row
  if (resourceType === 'site' && client) context.client = client
  return context
}
export function resourceContextMenuActions(contextActions, resourceType, row, parent = {}) {
  if (!contextActions?.list) return []
  return contextActions.list({ resource: resourceType, placement: `${resourceType}.context-menu`, context: resourceActionContext(resourceType, row, parent) })
}
export async function executeResourceContextMenuAction(contextActions, action, resourceType, row, parent = {}) {
  if (!action || action.state?.enabled === false || !contextActions?.execute) return undefined
  return contextActions.execute(action.id, resourceActionContext(resourceType, row, parent))
}
