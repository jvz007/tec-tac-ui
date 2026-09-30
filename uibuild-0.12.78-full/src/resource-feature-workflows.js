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
