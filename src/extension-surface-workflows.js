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
export function navItemPermitted(item, context = {}) {
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
