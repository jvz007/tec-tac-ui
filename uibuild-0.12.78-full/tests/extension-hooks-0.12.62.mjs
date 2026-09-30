import assert from 'node:assert/strict'
import fs from 'node:fs'

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const vueReactiveStub = `const reactive = (value) => value\n`
const vueHeaderStub = `const reactive = (value) => value\nconst markRaw = (value) => value\n`

// F8: unauthenticated/public SSO provider registry.
const { createSsoProviderRegistry } = await dataModule('../src/sso-providers.js', [
  ["import { reactive } from 'vue'", vueReactiveStub],
])
const sso = createSsoProviderRegistry()
const ssoA = sso.forModule('global-settings')
let started = null
ssoA.register({ id: 'global-settings.entra', label: 'Microsoft Entra ID', order: 20 }, async (ctx) => { started = ctx; return 'started' })
ssoA.register({ id: 'global-settings.google', label: 'Google', order: 30, visible: () => false }, async () => {})
assert.deepEqual(sso.list({}).map((row) => row.id), ['global-settings.entra'])
assert.equal(await sso.begin('global-settings.entra', { return_to: 'https://ui/tec-tac/' }), 'started')
assert.equal(started.return_to, 'https://ui/tec-tac/')
assert.throws(() => ssoA.register({ id: 'other.bad', label: 'Bad' }, () => {}), /must begin with global-settings/)
ssoA.clear()
assert.equal(sso.list({}).length, 0)

// F9: authenticated module header slot with permission, ordering and bounded output.
let allowed = new Set(['alerts.view'])
const { createHeaderContributionRegistry } = await dataModule('../src/header-contributions.js', [
  ["import { markRaw, reactive } from 'vue'", vueHeaderStub],
])
const header = createHeaderContributionRegistry({ hasPermission: (code) => allowed.has(code) })
const alertsHeader = header.forModule('alerts')
const Dummy = { name: 'AlertsBell' }
alertsHeader.register({ id: 'alerts.bell', label: 'Alerts', permission: 'alerts.view', component: Dummy, props: ({ user }) => ({ username: user.username }), order: 10 })
let rows = header.list({ user: { username: 'alice' } })
assert.equal(rows.length, 1)
assert.equal(rows[0].component, Dummy)
assert.deepEqual(rows[0].resolvedProps, { username: 'alice' })
allowed = new Set()
assert.equal(header.list({ user: { username: 'alice' } }).length, 0)
allowed = new Set(['alerts.view'])
for (let i = 0; i < 8; i += 1) {
  header.forModule(`m${i}`).register({ id: `m${i}.x`, label: `M${i}`, component: { name: `M${i}` }, order: 100 + i })
}
assert.equal(header.list({ user: {} }).length, 6)
alertsHeader.clear()
assert.equal(header.snapshot().some((row) => row.id === 'alerts.bell'), false)

// F10: existing contextActions registry consumed at client/site context-menu placements.
const { createContextActionRegistry } = await dataModule('../src/context-actions.js', [
  ["import { reactive } from 'vue'", vueReactiveStub],
])
const contextActions = createContextActionRegistry({ hasPermission: (code) => code === 'tickets.create' })
const halo = contextActions.forModule('halopsa')
let executed = null
halo.register({ id: 'halopsa.client-ticket', resource: 'client', label: 'Create ticket', placements: ['client.context-menu'], permission: 'tickets.create' }, async (ctx) => { executed = ctx; return 42 })
halo.register({ id: 'halopsa.site-ticket', resource: 'site', label: 'Create site ticket', placements: ['site.context-menu'] }, async () => 43)
const client = { id: 7, name: 'Acme' }
rows = contextActions.list({ resource: 'client', placement: 'client.context-menu', context: { resource_type: 'client', resource: client, client, selection: [client] } })
assert.deepEqual(rows.map((row) => row.id), ['halopsa.client-ticket'])
assert.equal(rows[0].state.enabled, true)
assert.equal(await contextActions.execute(rows[0].id, { resource_type: 'client', resource: client, client, selection: [client] }), 42)
assert.equal(executed.client.id, 7)
assert.equal(contextActions.list({ resource: 'site', placement: 'site.context-menu', context: { resource: { id: 9 }, selection: [{ id: 9 }] } }).length, 1)
halo.clear()
assert.equal(contextActions.list({ resource: 'client', placement: 'client.context-menu' }).length, 0)

// Consumer wiring is exercised through the same production helper functions used
// by LoginPanel, App and ResourcesView; no source-text assertions are required.
const surface = await import('../src/extension-surface-workflows.js')
assert.deepEqual(surface.loginSsoEntries(sso, {}).map((row) => row.id), [])
// Re-register one provider after the cleanup assertion above and execute through
// the LoginPanel helper boundary.
ssoA.register({ id: 'global-settings.entra', label: 'Microsoft Entra ID' }, async (ctx) => { started = ctx; return 'started-again' })
assert.equal(await surface.beginLoginSso(sso, surface.loginSsoEntries(sso, {})[0], { return_to: '/tec-tac/' }), 'started-again')
assert.equal(started.return_to, '/tec-tac/')
allowed = new Set(['alerts.view'])
alertsHeader.register({ id: 'alerts.bell', label: 'Alerts', permission: 'alerts.view', component: Dummy, order: 10 })
assert.deepEqual(surface.appHeaderItems(header, { user: { username: 'alice' } }).map((row) => row.id).includes('alerts.bell'), true)
halo.register({ id: 'halopsa.client-ticket', resource: 'client', label: 'Create ticket', placements: ['client.context-menu'], permission: 'tickets.create' }, async (ctx) => { executed = ctx; return 42 })
rows = surface.resourceContextMenuActions(contextActions, 'client', client)
assert.deepEqual(rows.map((row) => row.id), ['halopsa.client-ticket'])
assert.equal(await surface.executeResourceContextMenuAction(contextActions, rows[0], 'client', client), 42)
assert.equal(executed.client.id, 7)

console.log('extension hooks F8-F10 0.12.62: PASS')
