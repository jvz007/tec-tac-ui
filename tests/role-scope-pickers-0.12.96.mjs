// 0.12.96: Clients & sites tab on the role form (Tactical can_view_clients and can_view_sites).
// Unknown ids are kept and sent back sorted and unique. One directory read, chosen by the editor's flags,
// and never a second read after a refusal.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  SCOPE_EMPTY_NOTE, SCOPE_SITE_MODE_NOTE, applyScopePayload, becomesLimited, buildScopeDirectory, chipRows,
  normalizeIdList, readScopeDirectory, scopeMode, scopeNotes, scopeSummary, toggleId,
} from '../src/role-scope.js'
import { groupSitesByClient } from '../src/resource-directory-read.js'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')

// Ids: de-duplicated integers, sorted, anything else dropped.
assert.deepEqual(normalizeIdList([5, 3, 5, '7', 'x', 0, -1, 2.5, null, 3]), [3, 5, 7])
assert.deepEqual(normalizeIdList(undefined), [])
assert.deepEqual(toggleId([1, 3], 2), [1, 2, 3])
assert.deepEqual(toggleId([1, 2, 3], 2), [1, 3])

// Mode and notes.
assert.equal(scopeMode([], []), 'unrestricted')
assert.equal(scopeMode([], [4]), 'sites')
assert.equal(scopeMode([1], []), 'clients')
assert.equal(scopeMode([1], [4]), 'mixed')
assert.deepEqual(scopeNotes([], []), [SCOPE_EMPTY_NOTE])
assert.equal(SCOPE_EMPTY_NOTE, 'Nothing ticked means this role sees every client and site.')
assert.deepEqual(scopeNotes([], [4]), [SCOPE_EMPTY_NOTE, SCOPE_SITE_MODE_NOTE])
assert.equal(SCOPE_SITE_MODE_NOTE, 'Site mode: this role sees only the ticked sites.')
assert.deepEqual(scopeNotes([1], [4]), [SCOPE_EMPTY_NOTE])
assert.equal(scopeSummary([], []), 'Unrestricted')
assert.equal(scopeSummary([1, 2], [9]), '2 clients, 1 site')
assert.equal(scopeSummary([1], [9, 10]), '1 client, 2 sites')

// Unknown ids stay as chips and go back on save.
const directory = buildScopeDirectory([{ id: 1, name: 'Acme', sites: [{ id: 10, name: 'HQ', client_id: 1 }] }])
const chips = chipRows([12, 1], directory, 'client')
assert.deepEqual(chips.map((c) => c.label), ['Acme', 'Client #12 (not visible to you)'])
assert.equal(chips[1].known, false)
assert.deepEqual(chipRows([40, 10], directory, 'site').map((c) => c.label), ['HQ', 'Site #40 (not visible to you)'])
const role = { id: 3, name: 'Tech', is_superuser: false, can_view_clients: [12, 1, 1], can_view_sites: [40, 10], user_count: 2, can_list_agents: true }
const payload = applyScopePayload(role, [12, 1, 1], [40, 10])
assert.deepEqual(payload.can_view_clients, [1, 12])
assert.deepEqual(payload.can_view_sites, [10, 40])
assert.equal(payload.can_list_agents, true, 'every other key Tactical returned is kept')
assert.equal(payload.name, 'Tech')

// An empty pair that becomes limited shows the reminder.
assert.equal(becomesLimited([], [], [1], []), true)
assert.equal(becomesLimited([], [], [], []), false)
assert.equal(becomesLimited([1], [], [1, 2], []), false)

// Directory read: clients only with can_list_clients, sites only when only can_list_sites, none otherwise.
function stub({ clientsStatus = 200 } = {}) {
  const calls = []
  const refused = Object.assign(new Error('Permission denied'), { status: 403 })
  return {
    calls,
    listClients: async (args) => {
      calls.push(['clients', args])
      if (clientsStatus === 403) throw refused
      return { items: [{ id: 1, name: 'Acme', sites: [{ id: 10, name: 'HQ' }] }], pages: 1 }
    },
    listSites: async (args) => {
      calls.push(['sites', args])
      return { items: [{ id: 10, name: 'HQ', client_id: 1, client_name: 'Acme' }, { id: 20, name: 'Depot', client_id: 2, client_name: 'Bolt' }], pages: 1 }
    },
  }
}

let s = stub()
let result = await readScopeDirectory({ context: { capabilities: { list_clients: true } }, ...s })
assert.deepEqual(s.calls.map((c) => c[0]), ['clients'])
assert.equal(s.calls[0][1].pageSize, 500)
assert.equal(result.mode, 'clients')

s = stub()
result = await readScopeDirectory({ context: { capabilities: {}, tactical_permissions: { can_list_clients: true } }, ...s })
assert.deepEqual(s.calls.map((c) => c[0]), ['clients'])

s = stub()
result = await readScopeDirectory({ context: { capabilities: {}, user: { superuser: true } }, ...s })
assert.deepEqual(s.calls.map((c) => c[0]), ['clients'])

s = stub()
result = await readScopeDirectory({ context: { capabilities: {}, tactical_permissions: { can_list_sites: true } }, ...s })
assert.deepEqual(s.calls.map((c) => c[0]), ['sites'])
assert.equal(result.mode, 'sites')
assert.deepEqual(result.directory.clients.map((c) => c.name), ['Acme', 'Bolt'])

s = stub()
result = await readScopeDirectory({ context: { capabilities: {}, tactical_permissions: {} }, ...s })
assert.deepEqual(s.calls, [])
assert.equal(result.mode, 'none')

// A 403 on the clients read: its message is returned and no second read happens.
s = stub({ clientsStatus: 403 })
result = await readScopeDirectory({ context: { capabilities: { list_clients: true }, tactical_permissions: { can_list_sites: true } }, ...s })
assert.deepEqual(s.calls.map((c) => c[0]), ['clients'])
assert.equal(result.error, 'Permission denied')

// Pages: 40 pages at most.
let pages = 0
result = await readScopeDirectory({
  context: { capabilities: { list_clients: true } },
  listClients: async ({ page }) => { pages += 1; return { items: [{ id: page, name: 'C' + page, sites: [] }], pages: 100 } },
  listSites: async () => { throw new Error('never') },
})
assert.equal(pages, 40)
assert.equal(result.truncated, true)

// Sites grouped by client_name build the same tree as nested sites.
const grouped = groupSitesByClient([
  { id: 20, name: 'Depot', client_id: 2, client_name: 'Bolt' },
  { id: 10, name: 'HQ', client_id: 1, client_name: 'Acme' },
  { id: 11, name: 'Annex', client_id: 1, client_name: 'Acme' },
])
assert.deepEqual(grouped.map((c) => [c.id, c.name, c.sites.map((x) => x.id)]), [[1, 'Acme', [10, 11]], [2, 'Bolt', [20]]])
const nested = buildScopeDirectory([{ id: 1, name: 'Acme', sites: [{ id: 10, name: 'HQ' }, { id: 11, name: 'Annex' }] }, { id: 2, name: 'Bolt', sites: [{ id: 20, name: 'Depot' }] }])
const fromGroups = buildScopeDirectory(grouped)
assert.deepEqual([...fromGroups.siteIndex.keys()].sort(), [...nested.siteIndex.keys()].sort())
assert.equal(fromGroups.siteIndex.get(20).client_name, nested.siteIndex.get(20).client_name)

// The panel source.
const panel = read('../src/components/access/RolesPanel.vue')
assert.match(panel, /id:'scope', label:'Clients & sites'/)
assert.match(panel, /can_view_clients/)
assert.match(panel, /can_view_sites/)
assert.match(panel, /const scope = \{ clients: scopeClients\.value, sites: scopeSites\.value \}/,'the snapshot includes both lists')
assert.match(panel, /applyScopePayload\(\{ \.\.\.selected\.value \}/, 'the payload keeps every key and normalises the two lists')
assert.match(panel, /RoleScopePicker/)
assert.doesNotMatch(panel, /window\.confirm/)
const picker = read('../src/components/access/RoleScopePicker.vue')
assert.doesNotMatch(picker, /window\.(confirm|alert|prompt)/)
assert.doesNotMatch(picker, /v-html/)
assert.match(picker, /not visible to you|chipRows/)

console.log('role-scope-pickers-0.12.96: PASS')
