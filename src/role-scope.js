// Pure helpers for the Clients & sites tab of the role form (Tactical's can_view_clients and
// can_view_sites). Empty lists mean no limit. PUT replaces both lists, so every id the role
// already holds is kept, including ids the editor cannot see.
import { readClientDirectory, resourceReadFlags } from './resource-directory-read.js'

export function normalizeIdList(value) {
  const seen = new Set()
  for (const item of Array.isArray(value) ? value : []) {
    const number = typeof item === 'string' && /^\d+$/.test(item.trim()) ? Number(item) : item
    if (Number.isInteger(number) && number > 0) seen.add(number)
  }
  return [...seen].sort((a, b) => a - b)
}

export function toggleId(list, id) {
  const current = normalizeIdList(list)
  return current.includes(id) ? current.filter((x) => x !== id) : normalizeIdList([...current, id])
}

// Build the tree the pickers show from the rows of readClientDirectory.
export function buildScopeDirectory(clients) {
  const rows = (Array.isArray(clients) ? clients : []).filter((c) => Number.isInteger(c?.id))
  const siteIndex = new Map()
  const clientIndex = new Map()
  for (const client of rows) {
    clientIndex.set(client.id, client)
    for (const site of client.sites || []) siteIndex.set(site.id, { ...site, client_id: site.client_id ?? client.id, client_name: client.name })
  }
  return { clients: rows, clientIndex, siteIndex }
}

// One chip per held id. An id the directory does not show is kept and labelled so.
export function chipRows(ids, directory, kind) {
  const index = kind === 'site' ? directory?.siteIndex : directory?.clientIndex
  const noun = kind === 'site' ? 'Site' : 'Client'
  return normalizeIdList(ids).map((id) => {
    const known = index?.get(id)
    return known
      ? { id, known: true, label: known.name }
      : { id, known: false, label: noun + ' #' + id + ' (not visible to you)' }
  })
}

export function scopeMode(clientIds, siteIds) {
  const clients = normalizeIdList(clientIds).length
  const sites = normalizeIdList(siteIds).length
  if (!clients && !sites) return 'unrestricted'
  if (!clients) return 'sites'
  return sites ? 'mixed' : 'clients'
}

export const SCOPE_EMPTY_NOTE = 'Nothing ticked means this role sees every client and site.'
export const SCOPE_SITE_MODE_NOTE = 'Site mode: this role sees only the ticked sites.'
export const SCOPE_CLIENT_NOTE = 'Ticking a client gives the role that whole client, including sites added later.'
export const SCOPE_HIDDEN_REASON = 'Showing names needs List clients or List sites'
export const SCOPE_LIMIT_REMINDER = 'This role sees every client and site now. After you save, it sees only the ticked ones. Core records the change in the audit log.'
export const SCOPE_SUPERUSER_NOTE = 'This is a superuser role. Its client and site lists are informational.'

export function scopeSummary(clientIds, siteIds) {
  const clients = normalizeIdList(clientIds).length
  const sites = normalizeIdList(siteIds).length
  if (!clients && !sites) return 'Unrestricted'
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's')
  return plural(clients, 'client') + ', ' + plural(sites, 'site')
}

export function scopeNotes(clientIds, siteIds) {
  const notes = [SCOPE_EMPTY_NOTE]
  if (scopeMode(clientIds, siteIds) === 'sites') notes.push(SCOPE_SITE_MODE_NOTE)
  return notes
}

// True when a save would change the pair from empty to limited.
export function becomesLimited(savedClientIds, savedSiteIds, clientIds, siteIds) {
  return scopeMode(savedClientIds, savedSiteIds) === 'unrestricted' && scopeMode(clientIds, siteIds) !== 'unrestricted'
}

// Only the two lists change; every other key stays as Tactical returned it.
export function applyScopePayload(payload, clientIds, siteIds) {
  return { ...payload, can_view_clients: normalizeIdList(clientIds), can_view_sites: normalizeIdList(siteIds) }
}

// Directory read for the pickers: one route, chosen by the editor's flags (readClientDirectory).
// Result: { mode: 'clients'|'sites'|'none', directory, truncated, error }. An error from the read
// is returned as text and nothing else is read.
export async function readScopeDirectory({ context, listClients, listSites }) {
  const flags = resourceReadFlags(context)
  if (!flags.clients && !flags.sites) return { mode: 'none', directory: buildScopeDirectory([]), truncated: false, error: '' }
  try {
    const result = await readClientDirectory({ context, listClients, listSites })
    return { mode: result.mode, directory: buildScopeDirectory(result.clients), truncated: result.truncated, error: '' }
  } catch (err) {
    return { mode: flags.clients ? 'clients' : 'sites', directory: buildScopeDirectory([]), truncated: false, error: err?.message || 'Unable to read clients and sites.' }
  }
}
