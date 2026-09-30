import assert from 'node:assert/strict'
import fs from 'node:fs'

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const vueHeader = 'const reactive = (value) => value\nconst markRaw = (value) => value\n'
const { createHeaderContributionRegistry } = await dataModule('../src/header-contributions.js', [
  ["import { markRaw, reactive } from 'vue'", vueHeader],
])
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])
const surface = await import('../src/extension-surface-workflows.js')

// F9: a contribution that omits permission inherits the module descriptor's
// permissions. Backend provenance is an independent fail-closed boundary.
let trusted = true
let allowed = new Set(['alerts.view'])
const header = createHeaderContributionRegistry({
  hasPermission: (code) => allowed.has(code),
  isTrustedContext: () => trusted,
})
const router = { currentRoute: { value: { path: '/', fullPath: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} }
const state = { context: { user: { username: 'alice' }, permissions: ['alerts.view'] }, contextSource: 'backend' }
const entry = `data:text/javascript;base64,${Buffer.from(`export default { async register(ctx){ctx.header.register({id:'alerts.bell',label:'Alerts',component:{name:'AlertsBell'}})} }`).toString('base64')}`
const loaded = await loader.loadUiModules({ state, router, addNavigation(){}, header }, [
  { id: 'alerts', entry, permissions: ['alerts.view'], allowed: true },
])
assert.deepEqual(loaded.failed, [])
assert.deepEqual(header.snapshot()[0].permissions, ['alerts.view'])
assert.deepEqual(surface.appHeaderItems(header, { user: state.context.user }).map((row) => row.id), ['alerts.bell'])
allowed = new Set()
assert.deepEqual(surface.appHeaderItems(header, { user: state.context.user }), [])
allowed = new Set(['alerts.view'])
trusted = false
assert.deepEqual(surface.appHeaderItems(header, { user: state.context.user }), [])
trusted = true
assert.deepEqual(surface.appHeaderItems(header, { user: state.context.user }).map((row) => row.id), ['alerts.bell'])

// F10: site actions receive both the site and its parent client. Listing and
// execution must use the same context object shape.
let listedContext = null
let executedContext = null
const actions = {
  list(query) {
    listedContext = query.context
    return [{ id: 'halo.site-ticket', label: 'Ticket', state: { visible: true, enabled: true } }]
  },
  async execute(id, context) {
    assert.equal(id, 'halo.site-ticket')
    executedContext = context
    return 42
  },
}
const client = { id: 7, name: 'Acme' }
const site = { id: 9, name: 'HQ', client_id: 7 }
const rows = surface.resourceContextMenuActions(actions, 'site', site, { client })
assert.equal(rows.length, 1)
assert.equal(listedContext.site, site)
assert.equal(listedContext.client, client)
assert.deepEqual(listedContext.selection, [site])
assert.equal(await surface.executeResourceContextMenuAction(actions, rows[0], 'site', site, { client }), 42)
assert.equal(executedContext.site, site)
assert.equal(executedContext.client, client)
assert.deepEqual(executedContext.selection, [site])

// Verify the live bootstrap supplies the trust-provenance guard and the
// Clients & Sites consumer passes its selected client into the shared helper.
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
assert.match(main, /isTrustedContext:\s*\(\)\s*=>\s*state\.contextSource\s*===\s*'backend'/)
const resources = fs.readFileSync(new URL('../src/views/ResourcesView.vue', import.meta.url), 'utf8')
assert.match(resources, /resourceType === 'site' \? \{ client: selectedClient\.value \} : \{\}/)

console.log('F9/F10 production closure 0.12.69: PASS')
