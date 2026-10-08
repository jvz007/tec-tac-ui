import assert from 'node:assert/strict'
import fs from 'node:fs'

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const vueStub = `const reactive = (value) => value\n`
const preferencesStub = `
const preferenceState = { preferences: { extensions: { core: { quick_actions: [] } } } }
function updateUserPreferences(mutator) {
  const next = JSON.parse(JSON.stringify(preferenceState.preferences))
  preferenceState.preferences = mutator(next) || next
}
globalThis.__prefs = preferenceState
`

let granted = new Set()
let superuser = false
const hasPermission = (code) => superuser || granted.has(code)

// --- Context actions -------------------------------------------------------
{
  const { createContextActionRegistry } = await dataModule('../src/context-actions.js', [["import { reactive } from 'vue'", vueStub]])
  const registry = createContextActionRegistry({ hasPermission })
  const owner = registry.forModule('tickets')
  let ran = 0
  owner.register({ id: 'tickets.create', resource: 'client', label: 'Create ticket', placements: ['client.context-menu'], permission: 'tickets.create' }, async () => { ran += 1; return 'ok' })
  owner.register({ id: 'tickets.open', resource: 'client', label: 'Open', placements: ['client.context-menu'] }, async () => 'open')
  const ids = () => registry.list({ resource: 'client', placement: 'client.context-menu', context: { resource: {} } }).map((row) => row.id)

  assert.deepEqual(ids(), ['tickets.open'], 'denied action is absent from list()')
  assert.deepEqual(owner.list({ resource: 'client' }).map((row) => row.id), ['tickets.open'])
  await assert.rejects(() => registry.execute('tickets.create', { resource: {} }), /Permission required: tickets\.create/)
  await assert.rejects(() => owner.execute('tickets.create', { resource: {} }), /Permission required: tickets\.create/)
  assert.equal(ran, 0)
  // The reason stays in state for diagnostics.
  const snapshot = registry.snapshot().find((row) => row.id === 'tickets.create')
  assert.ok(snapshot)

  granted = new Set(['tickets.create'])
  assert.deepEqual(ids(), ['tickets.create', 'tickets.open'].sort((a, b) => a.localeCompare(b)))
  assert.equal(registry.list({ resource: 'client', context: { resource: {} } }).find((row) => row.id === 'tickets.create').state.enabled, true)
  assert.equal(await registry.execute('tickets.create', { resource: {} }), 'ok')

  granted = new Set()
  superuser = true
  assert.equal(ids().includes('tickets.create'), true, 'superuser sees it')
  superuser = false
  granted = new Set()
}

// --- Context interactions --------------------------------------------------
{
  const { createContextInteractionRegistry } = await dataModule('../src/context-interactions.js', [["import { reactive } from 'vue'", vueStub]])
  const registry = createContextInteractionRegistry({ hasPermission })
  const owner = registry.forModule('endpoints')
  owner.register({ id: 'endpoints.move', surface: 'tree', sourceTypes: ['agent'], targetTypes: ['site'], permission: 'agents.move' }, async () => 'moved')
  owner.register({ id: 'endpoints.tag', surface: 'tree', sourceTypes: ['agent'], targetTypes: ['site'] }, async () => 'tagged')
  const query = { surface: 'tree', source: { type: 'agent' }, target: { type: 'site' } }
  assert.deepEqual(registry.list(query).map((row) => row.id), ['endpoints.tag'])
  await assert.rejects(() => owner.execute('endpoints.move', query), /Permission required: agents\.move/)
  granted = new Set(['agents.move'])
  assert.deepEqual(registry.list(query).map((row) => row.id).sort(), ['endpoints.move', 'endpoints.tag'])
  assert.equal(await owner.execute('endpoints.move', query), 'moved')
  granted = new Set()
  superuser = true
  assert.equal(registry.list(query).length, 2)
  superuser = false
}

// --- Quick actions ---------------------------------------------------------
{
  const { createQuickActionRegistry } = await dataModule('../src/quick-actions.js', [
    ["import { reactive } from 'vue'", vueStub],
    ["import { preferenceState, updateUserPreferences } from './preferences'", preferencesStub],
  ])
  const registry = createQuickActionRegistry({ hasPermission })
  const owner = registry.forModule('scriptexecution')
  let ran = 0
  owner.register({ id: 'scriptexecution.run', label: 'Run script', permission: 'scripts.run' }, async () => { ran += 1; return 'ran' })
  owner.register({ id: 'scriptexecution.free', label: 'Free action' }, async () => 'free')
  owner.register({ id: 'scriptexecution.free2', label: 'Second free action' }, async () => 'free2')

  granted = new Set(['scripts.run'])
  registry.pinAction('scriptexecution.free')
  registry.pinAction('scriptexecution.run')
  registry.pinAction('scriptexecution.free2')
  const order = () => registry.listPins().map((pin) => pin.action_id)
  assert.deepEqual(order(), ['scriptexecution.free', 'scriptexecution.run', 'scriptexecution.free2'])

  // Denied: the pin is hidden but not deleted.
  granted = new Set()
  assert.deepEqual(order(), ['scriptexecution.free', 'scriptexecution.free2'])
  assert.equal(globalThis.__prefs.preferences.extensions.core.quick_actions.length, 3, 'hidden pin is kept')
  assert.deepEqual(registry.listCatalog().map((row) => row.id).sort(), ['scriptexecution.free', 'scriptexecution.free2'])
  assert.throws(() => registry.pinAction('scriptexecution.run'), /Permission required: scripts\.run/)
  const hiddenPinId = globalThis.__prefs.preferences.extensions.core.quick_actions[1].id
  await assert.rejects(() => registry.executePin(hiddenPinId), /Permission required: scripts\.run/)
  assert.equal(ran, 0)

  // movePin moves relative to the visible pins; the hidden pin keeps its place.
  const freeId = globalThis.__prefs.preferences.extensions.core.quick_actions[0].id
  registry.movePin(freeId, 1)
  assert.deepEqual(order(), ['scriptexecution.free2', 'scriptexecution.free'])
  assert.deepEqual(globalThis.__prefs.preferences.extensions.core.quick_actions.map((pin) => pin.action_id), ['scriptexecution.run', 'scriptexecution.free2', 'scriptexecution.free'])
  assert.equal(globalThis.__prefs.preferences.extensions.core.quick_actions.length, 3)

  // Permission returns: the pin comes back and works.
  granted = new Set(['scripts.run'])
  assert.equal(order().includes('scriptexecution.run'), true)
  assert.equal(await registry.executePin(hiddenPinId), 'ran')

  // Superuser passes.
  granted = new Set()
  superuser = true
  assert.equal(order().includes('scriptexecution.run'), true)
  superuser = false
  granted = new Set()
}

// --- Resource views (0.12.82) ------------------------------------------------
{
  const { createResourceViewRegistry } = await dataModule('../src/resource-views.js', [["import { reactive } from 'vue'", vueStub]])
  const registry = createResourceViewRegistry({ hasPermission })
  const owner = registry.forModule('tickets')
  owner.register({ id: 'tickets.panel', resource: 'client', placement: 'client.tab', label: 'Tickets', component: {}, permission: 'tickets.view' })
  owner.register({ id: 'tickets.open', resource: 'client', placement: 'client.tab', label: 'Open', component: {} })
  const ids = () => registry.list({ resource: 'client', placement: 'client.tab' }).map((row) => row.id)
  assert.deepEqual(ids(), ['tickets.open'], 'denied resource view is absent from list()')
  assert.deepEqual(owner.list({ resource: 'client' }).map((row) => row.id), ['tickets.open'])
  granted = new Set(['tickets.view'])
  assert.deepEqual(ids().sort(), ['tickets.open', 'tickets.panel'])
  granted = new Set()
  superuser = true
  assert.equal(ids().includes('tickets.panel'), true, 'superuser sees it')
  superuser = false
  granted = new Set()
}

// --- Header items (0.12.82) --------------------------------------------------
{
  const { createHeaderContributionRegistry } = await dataModule('../src/header-contributions.js', [
    ["import { markRaw, reactive } from 'vue'", 'const reactive = (value) => value; const markRaw = (value) => value'],
  ])
  let trusted = true
  const registry = createHeaderContributionRegistry({ hasPermission, isTrustedContext: () => trusted })
  const owner = registry.forModule('alerts')
  owner.register({ id: 'alerts.single', label: 'Single', component: {}, permission: 'alerts.view' })
  owner.register({ id: 'alerts.both', label: 'Both', component: {}, permissions: ['alerts.view', 'alerts.edit'] })
  owner.register({ id: 'alerts.free', label: 'Free', component: {} })
  const ids = () => registry.list({}).map((row) => row.id).sort()
  assert.deepEqual(ids(), ['alerts.free'], 'denied header items are absent')
  granted = new Set(['alerts.view'])
  assert.deepEqual(ids(), ['alerts.free', 'alerts.single'], 'every code must be held')
  granted = new Set(['alerts.view', 'alerts.edit'])
  assert.deepEqual(ids(), ['alerts.both', 'alerts.free', 'alerts.single'])
  trusted = false
  assert.deepEqual(ids(), [], 'nothing shows without a backend context')
  trusted = true
  granted = new Set()
  superuser = true
  assert.deepEqual(ids(), ['alerts.both', 'alerts.free', 'alerts.single'], 'superuser sees all')
  superuser = false
  granted = new Set()
}

// --- Dashboard widgets (0.12.82) ---------------------------------------------
{
  const { createDashboardWidgetRegistry } = await dataModule('../src/dashboard-widgets.js', [
    ["import { reactive, markRaw } from 'vue'", 'const reactive = (value) => value; const markRaw = (value) => value'],
  ])
  const registry = createDashboardWidgetRegistry({ hasPermission })
  const owner = registry.forModule('audit')
  owner.register({ id: 'audit.recent', title: 'Recent audit', component: {}, permission: 'audit.view' })
  owner.register({ id: 'audit.free', title: 'Free widget', component: {} })
  const listIds = () => registry.list().map((row) => row.id)
  const snapIds = () => registry.snapshot().map((row) => row.id)
  assert.deepEqual(listIds(), ['audit.free'])
  assert.deepEqual(snapIds(), ['audit.free'])
  assert.equal(registry.get('audit.recent'), null, 'get(id) hides a denied widget')
  assert.deepEqual(owner.list().map((row) => row.id), ['audit.free'])
  granted = new Set(['audit.view'])
  assert.deepEqual(listIds().sort(), ['audit.free', 'audit.recent'])
  assert.deepEqual(snapIds().sort(), ['audit.free', 'audit.recent'])
  assert.equal(registry.get('audit.recent')?.id, 'audit.recent')
  granted = new Set()
  superuser = true
  assert.equal(registry.get('audit.recent')?.id, 'audit.recent', 'superuser sees it')
  superuser = false
  granted = new Set()
}

// --- Navigation filter -----------------------------------------------------
{
  const { navItemPermitted } = await dataModule('../src/extension-surface-workflows.js')
  const backend = (permissions, user = {}) => ({ source: 'backend', permissions, user })
  assert.equal(navItemPermitted({ to: '/a', label: 'A' }, backend([])), true, 'no field means shown')
  assert.equal(navItemPermitted({ permission: 'x.view' }, backend([])), false)
  assert.equal(navItemPermitted({ permission: 'x.view' }, backend(['x.view'])), true)
  assert.equal(navItemPermitted({ permissions: ['x.view', 'x.edit'] }, backend(['x.view'])), false)
  assert.equal(navItemPermitted({ permissions: ['x.view', 'x.edit'] }, backend(['x.view', 'x.edit'])), true)
  assert.equal(navItemPermitted({ permission: 'x.view' }, backend([], { superuser: true })), true)
  assert.equal(navItemPermitted({ permission: 'x.view' }, { source: 'local-manifest', permissions: ['x.view'], user: {} }), false, 'no backend context means no permissions')
}

// --- Source checks ---------------------------------------------------------
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const app = read('../src/App.vue')
assert.match(app, /navItemPermitted\(item, navContext\.value\)/)
assert.match(app, /pin\.state\?\.visible !== false/)
assert.match(read('../src/components/QuickActionsDialog.vue'), /pin\.state\?\.visible !== false/)
assert.match(read('../src/components/QuickActionsDialog.vue'), /item\.state\?\.visible !== false/)
for (const file of ['context-actions', 'context-interactions', 'quick-actions']) {
  assert.doesNotMatch(read(`../src/${file}.js`), /visible: true, enabled: false, reason: `Permission required/, `${file} still disables instead of hiding`)
}

console.log('[TEST] hidden when denied (AD-12) OK')
