// 0.12.97: a popup window can load the modules that publish into the owner's placements. The owner's popup route opts in
// with meta.popupPublishers: true (every other enabled, allowed module) or an array of module ids. The shell loads the
// owner and its hard dependencies first (phase 1), reads the opt-in from the matched route, then loads the extra set
// (phase 2) before the original hash is replayed. Routes without the flag load exactly what they loaded before.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRouter, createMemoryHistory } from 'vue-router'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const loaderSource = read('../src/module-loader.js').replace("import * as Vue from 'vue'", 'const Vue = {}')
const { loadUiModules, moduleIsAllowed } = await import(dataUrl(loaderSource))
const popup = await import('../src/popup-mode.js')
const { createResourceViewRegistry } = await import('../src/resource-views.js')

const gate = { permissions: [], permissionSet: new Set(), user: {}, source: 'backend' }
const allowed = (descriptor) => moduleIsAllowed(descriptor, gate)
const d = (id, extra = {}) => ({ id, entry: `/m/${id}.js`, dependencies: [], permissions: [], ...extra })
const ids = (list) => list.map((item) => item.id)

// (1) popupPublishersChoice reads only true or a list of module ids.
assert.equal(popup.popupPublishersChoice({ popupPublishers: true }), true)
assert.deepEqual(popup.popupPublishersChoice({ popupPublishers: ['checks', 'bad id', 7, '../x', 'alerts'] }), ['checks', 'alerts'])
for (const meta of [undefined, null, {}, { popupPublishers: false }, { popupPublishers: 'true' }, { popupPublishers: 1 }, { popupPublishers: {} }]) {
  assert.equal(popup.popupPublishersChoice(meta), null, JSON.stringify(meta))
}

// (2) popupPublisherSet: true gives every enabled allowed module except the loaded ones, dependencies first.
{
  const list = [
    d('endpoints'),
    d('agents'),
    d('checks', { dependencies: ['agents', 'helper'] }),
    d('helper'),
    d('alerts'),
    d('noentry', { entry: '' }),
    d('gated', { permissions: ['x.use'], allowed: false }),
  ]
  const set = popup.popupPublisherSet(list, 'endpoints', ['endpoints', 'agents'], true, { allowed })
  assert.deepEqual(ids(set), ['helper', 'checks', 'alerts'], 'loaded modules, the owner, no-entry and gated modules are left out; dependencies first')
  assert.deepEqual(ids(popup.popupPublisherSet(list, 'endpoints', [], true, { allowed })), ['agents', 'helper', 'checks', 'alerts'])
  // An id array gives only those ids (with their hard dependencies).
  assert.deepEqual(ids(popup.popupPublisherSet(list, 'endpoints', ['endpoints'], ['alerts'], { allowed })), ['alerts'])
  assert.deepEqual(ids(popup.popupPublisherSet(list, 'endpoints', ['endpoints'], ['checks'], { allowed })), ['agents', 'helper', 'checks'])
  // Gated, no-entry, unknown, junk and owner ids are left out; nothing is listed twice.
  assert.deepEqual(ids(popup.popupPublisherSet(list, 'endpoints', ['endpoints'], ['gated', 'noentry', 'ghost', '../x', 'bad id', 'endpoints', 'alerts', 'alerts'], { allowed })), ['alerts'])
  // No choice, no extra modules.
  assert.deepEqual(popup.popupPublisherSet(list, 'endpoints', [], null, { allowed }), [])
  assert.deepEqual(popup.popupPublisherSet(list, 'endpoints', [], false, { allowed }), [])
  assert.deepEqual(popup.popupPublisherSet(null, 'endpoints', [], true, { allowed }), [])
}
// A dependency the person may not use is skipped, and so is a module that needs it only through it.
{
  const list = [d('endpoints'), d('a', { dependencies: ['blocked'] }), d('blocked', { allowed: false })]
  assert.deepEqual(ids(popup.popupPublisherSet(list, 'endpoints', ['endpoints'], true, { allowed })), ['a'])
}
// A dependency cycle is cut.
{
  const list = [d('endpoints'), d('a', { dependencies: ['b'] }), d('b', { dependencies: ['a'] })]
  const set = ids(popup.popupPublisherSet(list, 'endpoints', ['endpoints'], true, { allowed }))
  assert.equal(new Set(set).size, set.length)
  assert.deepEqual([...set].sort(), ['a', 'b'])
}

// (3) Integration with the real vue-router, loadUiModules and the resource view registry.
let uid = 0
const moduleCode = (id, body) => { uid += 1; return dataUrl(`// ${id} ${uid} ${Math.random()}\nexport default { register(context) { ${body} } };`) }
const ownerRoute = (extraMeta) => `context.router.addRoute({ path: '/endpoints/:agentId?', meta: { popup: true, ${extraMeta} }, component: { name: 'dossier' } });`
const publisher = (id, body = '') => ({
  ...d(id),
  entry: moduleCode(id, `${body} context.resourceViews.register({ id: '${id}.tab', resource: 'endpoint', placement: 'endpoint.detail-tabs', label: '${id}', component: { name: '${id}-tab' } });`),
})

async function popupWindow({ hash, ownerMeta, descriptors }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: {} },
      { path: '/popup/:pathMatch(.*)*', name: 'popup-pending', component: {} },
    ],
  })
  const resourceViews = createResourceViewRegistry({ hasPermission: () => true })
  const target = popup.parsePopupHash(`#${hash}`)
  const runtime = {
    app: {},
    router,
    state: { context: { permissions: [], user: {}, module_status: [] }, contextSource: 'backend' },
    addNavigation() {},
    removeNavigation() {},
    resourceViews,
    popupMode: { moduleId: target.moduleId, permitted: () => true, refuse() {}, deniedMessage: 'denied' },
  }
  const all = [{ ...d('endpoints'), entry: moduleCode('endpoints', ownerRoute(ownerMeta)) }, ...descriptors]
  // The same two phases main.js runs.
  let moduleLoad = await loadUiModules(runtime, popup.popupModuleSet(all, target.moduleId, { allowed }))
  const matched = router.resolve(hash).matched
  const choice = popup.popupPublishersChoice(matched[matched.length - 1]?.meta)
  const extra = popup.popupPublisherSet(all, target.moduleId, moduleLoad.loaded, choice, { allowed })
  if (extra.length) {
    const more = await loadUiModules(runtime, extra)
    moduleLoad = { loaded: [...moduleLoad.loaded, ...more.loaded], failed: [...moduleLoad.failed, ...more.failed], skipped: [...(moduleLoad.skipped || []), ...(more.skipped || [])] }
  }
  await router.replace(hash)
  const tabs = resourceViews.list({ resource: 'endpoint', placement: 'endpoint.detail-tabs' }).map((view) => view.id)
  return { router, moduleLoad, tabs }
}
const AGENT = 'b'.repeat(40)

{
  const result = await popupWindow({
    hash: `/popup/endpoints/endpoints/${AGENT}`,
    ownerMeta: 'popupPublishers: true',
    descriptors: [publisher('checks'), publisher('alerts')],
  })
  assert.deepEqual([...result.moduleLoad.loaded].sort(), ['alerts', 'checks', 'endpoints'])
  assert.deepEqual([...result.tabs].sort(), ['alerts.tab', 'checks.tab'], 'the view is listed once the replay lands')
  assert.equal(result.router.currentRoute.value.name === 'popup-pending', false)
  assert.equal(result.router.currentRoute.value.params.agentId, AGENT)
  // The extra modules get no popup alias.
  const aliases = result.router.getRoutes().map((r) => r.path).filter((p) => p.startsWith('/popup/') && !p.includes(':pathMatch'))
  assert.deepEqual(aliases, ['/popup/endpoints/endpoints/:agentId?'])
}

// A route without the flag loads no extra module.
{
  const result = await popupWindow({
    hash: `/popup/endpoints/endpoints/${AGENT}`,
    ownerMeta: 'title: "x"',
    descriptors: [publisher('checks')],
  })
  assert.deepEqual(result.moduleLoad.loaded, ['endpoints'])
  assert.deepEqual(result.tabs, [])
}

// An id list loads just those.
{
  const result = await popupWindow({
    hash: '/popup/endpoints/endpoints',
    ownerMeta: "popupPublishers: ['alerts']",
    descriptors: [publisher('checks'), publisher('alerts')],
  })
  assert.deepEqual([...result.moduleLoad.loaded].sort(), ['alerts', 'endpoints'])
  assert.deepEqual(result.tabs, ['alerts.tab'])
}

// An extra module that throws in register() leaves the popup open.
{
  const broken = { ...d('broken'), entry: moduleCode('broken', "throw new Error('boom')") }
  const result = await popupWindow({
    hash: `/popup/endpoints/endpoints/${AGENT}`,
    ownerMeta: 'popupPublishers: true',
    descriptors: [broken, publisher('checks')],
  })
  assert.ok(result.moduleLoad.loaded.includes('endpoints'))
  assert.ok(result.moduleLoad.loaded.includes('checks'))
  assert.deepEqual(result.moduleLoad.failed.map((f) => f.id), ['broken'])
  assert.notEqual(result.router.currentRoute.value.name, 'popup-pending')
  assert.deepEqual(result.tabs, ['checks.tab'])
}

// (4) main.js: the second load runs before the replay, with the same allowed gate and the same loader runtime.
const main = read('../src/main.js')
const firstLoad = main.indexOf('state.moduleLoad = await loadUiModules(loaderRuntime, toLoad)')
const secondLoad = main.indexOf('await loadUiModules(loaderRuntime, extra)')
const replay = main.lastIndexOf('await router.replace(initialHashTarget)')
assert.ok(firstLoad > 0 && secondLoad > firstLoad && replay > secondLoad, 'phase 1, phase 2, then the replay')
assert.ok(main.includes('popupPublisherSet(descriptors, popupTarget.moduleId, state.moduleLoad.loaded, choice, { allowed: (descriptor) => moduleIsAllowed(descriptor, popupGate) })'))
assert.ok(main.includes('popupPublishersChoice(matched[matched.length - 1]?.meta)'))
// popupForModule stays owner-only in the loader.
assert.ok(loaderSource.includes('runtime.popupMode && runtime.popupMode.moduleId === descriptor.id ? runtime.popupMode : null'))

console.log('popup publishers 0.12.97: ok')
