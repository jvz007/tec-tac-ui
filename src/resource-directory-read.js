// Which Core resource-directory read a person may use (Core 1.17.22, core.resources 1.5.0).
// Display hints only (AD-12): Core and Tactical still refuse. Core's capabilities map carries
// list_clients only, so the sites flag comes from tactical_permissions (Core 1.17.7 and later).

export const DIRECTORY_PAGE_SIZE = 500
export const DIRECTORY_MAX_PAGES = 40

export function resourceReadFlags(context = {}) {
  const capabilities = context?.capabilities || {}
  const tactical = context?.tactical_permissions || {}
  const superuser = context?.user?.superuser === true
  return {
    clients: superuser || capabilities.list_clients === true || tactical.can_list_clients === true,
    sites: tactical.can_list_sites === true,
  }
}

// 'clients': read the clients (each carries its sites). 'sites': read the sites and group them.
// 'none': read nothing.
export function resourceReadMode(context = {}) {
  const flags = resourceReadFlags(context)
  if (flags.clients) return 'clients'
  if (flags.sites) return 'sites'
  return 'none'
}

export function canSeeResourceDirectory(context = {}) {
  return resourceReadMode(context) !== 'none'
}

const asId = (value) => {
  const number = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value
  return Number.isInteger(number) && number > 0 ? number : null
}

// Group site rows (each with client_id and client_name) into client rows. Clients sort by name
// (case-insensitive) then id. Sites keep the order they came in.
export function groupSitesByClient(rows) {
  const byId = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const clientId = asId(row?.client_id)
    const siteId = asId(row?.id)
    if (clientId == null || siteId == null) continue
    if (!byId.has(clientId)) byId.set(clientId, { id: clientId, name: String(row.client_name || ('Client #' + clientId)), sites: [] })
    byId.get(clientId).sites.push({ ...row, id: siteId, client_id: clientId })
  }
  return [...byId.values()].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id)
}

// Read every page of one list call. An error propagates: the caller never reads another route.
export async function readAllPages(list, { pageSize = DIRECTORY_PAGE_SIZE, maxPages = DIRECTORY_MAX_PAGES } = {}) {
  const items = []
  let truncated = false
  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await list({ page, pageSize })
    items.push(...(Array.isArray(payload?.items) ? payload.items : []))
    const pages = Number(payload?.pages || 0)
    if (!pages || page >= pages) return { items, truncated }
    if (page === maxPages) truncated = true
  }
  return { items, truncated }
}

// Read the directory once with the one route the flags allow. Result: { mode, clients, truncated }
// with clients as [{ id, name, sites: [{ id, name, client_id }] }]. A 403 or any other error is
// thrown as it is, and the other read is never tried.
export async function readClientDirectory({ context, listClients, listSites, pageSize = DIRECTORY_PAGE_SIZE, maxPages = DIRECTORY_MAX_PAGES }) {
  const mode = resourceReadMode(context)
  if (mode === 'none') return { mode, clients: [], truncated: false }
  if (mode === 'clients') {
    const { items, truncated } = await readAllPages(listClients, { pageSize, maxPages })
    const clients = items
      .map((row) => ({
        ...row,
        id: asId(row?.id),
        name: String(row?.name ?? ''),
        sites: (Array.isArray(row?.sites) ? row.sites : [])
          .map((site) => ({ ...site, id: asId(site?.id), client_id: asId(site?.client_id) ?? asId(row?.id) }))
          .filter((site) => site.id != null),
      }))
      .filter((row) => row.id != null)
    return { mode, clients, truncated }
  }
  const { items, truncated } = await readAllPages(listSites, { pageSize, maxPages })
  return { mode, clients: groupSitesByClient(items), truncated }
}
