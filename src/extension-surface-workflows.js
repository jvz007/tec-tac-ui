export function loginSsoEntries(ssoProviders, context = {}) {
  return ssoProviders?.list?.(context) || []
}
export async function beginLoginSso(ssoProviders, entry, context = {}) {
  if (!entry?.id || !ssoProviders?.begin) throw new Error('SSO provider is unavailable.')
  return ssoProviders.begin(entry.id, context)
}
export function appHeaderItems(header, context = {}) {
  return header?.list?.(context) || []
}
export function resourceActionContext(resourceType, row) {
  return { resource_type: resourceType, resource: row, [resourceType]: row, selection: [row] }
}
export function resourceContextMenuActions(contextActions, resourceType, row) {
  if (!contextActions?.list) return []
  return contextActions.list({ resource: resourceType, placement: `${resourceType}.context-menu`, context: resourceActionContext(resourceType, row) })
}
export async function executeResourceContextMenuAction(contextActions, action, resourceType, row) {
  if (!action || action.state?.enabled === false || !contextActions?.execute) return undefined
  return contextActions.execute(action.id, resourceActionContext(resourceType, row))
}
