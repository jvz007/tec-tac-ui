// 0.12.96: the Clients & Sites menu and page follow Core 1.17.22. The menu shows with List clients, List sites or
// a superuser. The page reads clients, or else sites, or nothing. A refused read never triggers the other read.
// A first-login setup session that ended gets its own sentence.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { coreNavigation } from '../src/core-navigation.js'
import { groupSitesByClient, readClientDirectory, resourceReadMode } from '../src/resource-directory-read.js'
import { SETUP_SESSION_ENDED_MESSAGE, enrollmentSetupErrorMessage } from '../src/mfa-enrollment.js'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const visible = (ctx) => coreNavigation(ctx).find((entry) => entry.to === '/resources').visible

// Menu table.
assert.equal(visible({ capabilities: {}, tactical_permissions: {}, user: { superuser: false } }), false)
assert.equal(visible({ capabilities: { list_clients: true }, user: { superuser: false } }), true)
assert.equal(visible({ capabilities: {}, tactical_permissions: { can_list_sites: true }, user: { superuser: false } }), true)
assert.equal(visible({ capabilities: {}, tactical_permissions: { can_list_sites: false }, user: {} }), false)
assert.equal(visible({ capabilities: {}, user: { superuser: true } }), true)
assert.equal(visible({ capabilities: {} }), false, 'tactical_permissions missing')
assert.equal(visible({}), false)

// Read mode table.
assert.equal(resourceReadMode({ capabilities: { list_clients: true } }), 'clients')
assert.equal(resourceReadMode({ capabilities: { list_clients: true }, tactical_permissions: { can_list_sites: true } }), 'clients')
assert.equal(resourceReadMode({ capabilities: {}, tactical_permissions: { can_list_sites: true } }), 'sites')
assert.equal(resourceReadMode({ capabilities: {}, user: { superuser: true } }), 'clients')
assert.equal(resourceReadMode({ capabilities: {}, tactical_permissions: {} }), 'none')
assert.equal(resourceReadMode({}), 'none')

// Grouping: by client_id, clients by name then id, sites keep their order.
const grouped = groupSitesByClient([
  { id: 5, name: 'Z site', client_id: 2, client_name: 'bolt' },
  { id: 3, name: 'B site', client_id: 1, client_name: 'Acme' },
  { id: 4, name: 'A site', client_id: 1, client_name: 'Acme' },
  { id: 6, name: 'Twin', client_id: 9, client_name: 'Acme' },
])
assert.deepEqual(grouped.map((c) => [c.id, c.name]), [[1, 'Acme'], [9, 'Acme'], [2, 'bolt']])
assert.deepEqual(grouped[0].sites.map((s) => s.id), [3, 4], 'site order is kept')

// A 403 on the clients read: nothing else is read.
const calls = []
await assert.rejects(
  () => readClientDirectory({
    context: { capabilities: { list_clients: true }, tactical_permissions: { can_list_sites: true } },
    listClients: async () => { calls.push('clients'); throw Object.assign(new Error('Permission denied'), { status: 403 }) },
    listSites: async () => { calls.push('sites'); return { items: [], pages: 1 } },
  }),
  /Permission denied/,
)
assert.deepEqual(calls, ['clients'])
// Mode none: no request at all.
calls.length = 0
const none = await readClientDirectory({ context: {}, listClients: async () => calls.push('clients'), listSites: async () => calls.push('sites') })
assert.deepEqual(calls, [])
assert.equal(none.mode, 'none')

// Setup session code.
assert.equal(enrollmentSetupErrorMessage({ status: 403, code: 'setup_session_required', message: 'x' }, () => 'not accepted'), 'Your setup session ended. Sign in again.')
assert.equal(SETUP_SESSION_ENDED_MESSAGE, 'Your setup session ended. Sign in again.')
assert.equal(enrollmentSetupErrorMessage({ status: 403, message: 'x' }, () => 'not accepted'), 'not accepted')
assert.match(enrollmentSetupErrorMessage({ status: 502, message: 'lost' }, (e) => e.message), /administrator to reset 2FA/)

// The view and the sign-in panel.
const view = read('../src/views/ResourcesView.vue')
assert.match(view, /Your role cannot list clients or sites\./)
assert.match(view, /readMode\.value === 'none'/)
assert.match(view, /resourceReadMode\(state\.context\)/)
const login = read('../src/components/LoginPanel.vue')
assert.match(login, /SETUP_SESSION_REQUIRED_CODE/)
assert.match(login, /backToCredentials\(\)/)

console.log('resources-menu-rule-0.12.96: PASS')
