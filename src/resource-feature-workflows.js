export async function loadRelocationSites({ listResourceSites, clientId = null, excludeSiteId = null, excludeClientId = null, pageSize = 100 }) {
  const rows = []
  let page = 1
  while (true) {
    const payload = await listResourceSites({ clientId, page, pageSize })
    rows.push(...(Array.isArray(payload?.items) ? payload.items : []))
    const pages = Number(payload?.pages || 0)
    if (!pages || page >= pages) break
    page += 1
  }
  return rows.filter((site) => (excludeSiteId == null || site.id !== excludeSiteId) && (excludeClientId == null || site.client_id !== excludeClientId))
}

export async function deleteResourceWorkflow(draft, { deleteResourceClient, deleteResourceSite }) {
  if (!draft?.row?.id || !['client', 'site'].includes(draft.type)) throw new Error('Invalid resource deletion request.')
  const moveToSiteId = draft.destination_site_id ? Number(draft.destination_site_id) : null
  const result = draft.type === 'client'
    ? await deleteResourceClient(draft.row.id, { moveToSiteId })
    : await deleteResourceSite(draft.row.id, { moveToSiteId })
  const moved = Number(result?.moved_agents || 0)
  return {
    moved,
    deletedClientId: draft.type === 'client' ? draft.row.id : null,
    message: `${draft.type === 'client' ? 'Client' : 'Site'} deleted. ${moved} agent${moved === 1 ? '' : 's'} moved.`,
  }
}

export function editableCustomFieldRows(payload) {
  return (payload?.fields || []).map((field) => ({ ...field, value: Array.isArray(field.value) ? [...field.value] : field.value }))
}

export async function saveCustomFieldsWorkflow(draft, { updateResourceCustomFields }) {
  if (!draft?.row?.id || !['client', 'site'].includes(draft.resourceType)) throw new Error('Invalid custom-field request.')
  const values = draft.fields.map((field) => ({ field_id: field.field_id, value: field.value }))
  await updateResourceCustomFields(draft.resourceType, draft.row.id, values)
  return { message: `${draft.resourceType === 'client' ? 'Client' : 'Site'} custom fields updated.`, values }
}

export const FIRST_SITE_REQUIRED = 'Enter the first site name.'
export const SITE_ONLY_SCOPE_NOTE = 'Your role is limited to sites only, so Tactical does not add this client to your access. Ask an administrator to add it.'

// Add client: the first site name is required. Core's own refusal text reaches the caller as it was sent.
export async function createClientWorkflow(draft, { createResourceClient }) {
  const name = String(draft?.name ?? '').trim()
  const siteName = String(draft?.siteName ?? '').trim()
  if (!name) throw new Error('Enter the client name.')
  if (!siteName) throw new Error(FIRST_SITE_REQUIRED)
  const row = await createResourceClient({ name, siteName, customFields: createFieldRows(draft?.fields) })
  return { row, siteName }
}

// Add site: Core's own refusal text reaches the caller as it was sent.
export async function createSiteWorkflow(draft, { createResourceSite }) {
  const name = String(draft?.name ?? '').trim()
  if (!name) throw new Error('Enter the site name.')
  if (!draft?.client_id) throw new Error('Choose the client for the site.')
  return createResourceSite({ clientId: draft.client_id, name, customFields: createFieldRows(draft?.fields) })
}

// What a create dialog sends from its custom-field form: [{ field_id, value }]. A field left empty (no value, an empty
// text or an empty selection) is not sent; a checkbox that is off and a number of 0 are values and are sent. Core checks
// the required ones.
export function createFieldRows(fields) {
  return (Array.isArray(fields) ? fields : [])
    .filter((field) => field && field.value !== null && field.value !== undefined && field.value !== '' && !(Array.isArray(field.value) && !field.value.length))
    .map((field) => ({ field_id: field.field_id, value: Array.isArray(field.value) ? [...field.value] : field.value }))
}

// The definitions a create dialog shows, read before the create, as editable rows with each default as the value.
// A refusal or failure is thrown; the dialog shows one plain line and Retry, and the read never blocks Save (0.12.98).
export async function loadCreateFieldsWorkflow(resourceType, { listResourceCustomFieldDefinitions }) {
  return editableCustomFieldRows(await listResourceCustomFieldDefinitions(resourceType))
}

// The notice after Add client. scopeMode is state.context.tactical_scope.mode (a display hint).
export function clientCreatedNotice(siteName, scopeMode) {
  const base = `Client created with first site ${siteName}.`
  return scopeMode === 'sites' ? `${base} ${SITE_ONLY_SCOPE_NOTE}` : base
}
