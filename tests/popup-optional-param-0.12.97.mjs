// 0.12.97: a popup route may use the router's optional-parameter marker ('/endpoints/:agentId?'). The route path rule is
// one rule in popup-mode.js and module-loader.js; any other '?', '#', whitespace, '..', a backslash and control characters
// still get no alias, and the loader now warns instead of skipping in silence. main.js warns when the popup address does
// not land on a module route. Uses the real vue-router.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRouter, createMemoryHistory } from 'vue-router'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const loaderSource = read('../src/module-loader.js').replace("import * as Vue from 'vue'", 'const Vue = {}')
const { loadUiModules } = await import(dataUrl(loaderSource))
const popup = await import('../src/popup-mode.js')

const AGENT = 'a'.repeat(40)
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: {} },
      { path: '/popup/refused', name: 'popup-refused', component: {} },
      { path: '/popup/:pathMatch(.*)*', name: 'popup-pending', component: {} },
    ],
  })
}
let uid = 0
function moduleUrl(id, routes) {
  uid += 1
  return dataUrl(`// ${id} ${uid} ${Math.random()}
export default {
  register(context) {
    for (const route of ${JSON.stringify(routes)}) context.router.addRoute({ ...route, component: { name: ${JSON.stringify(id)} + '-view' } });
  },
};`)
}
const descriptor = (id, routes) => ({ id, entry: moduleUrl(id, routes), dependencies: [], permissions: [] })
const runtime = (router, moduleId, permitted = () => true) => ({
  app: {},
  router,
  state: { context: { permissions: [], user: {}, module_status: [] }, contextSource: 'backend' },
  addNavigation() {},
  removeNavigation() {},
  popupMode: { moduleId, permitted, refuse() {}, deniedMessage: 'denied' },
})
async function withWarnings(fn) {
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args.map(String).join(' '))
  try { await fn() } finally { console.warn = original }
  return warnings
}

// (1) The optional parameter gets its alias, resolves with and without the id, and beats the catch-all.
{
  const router = makeRouter()
  const warnings = await withWarnings(async () => {
    const result = await loadUiModules(runtime(router, 'endpoints'), [descriptor('endpoints', [{ path: '/endpoints/:agentId?', name: 'endpoints-page', meta: { popup: true } }])])
    assert.deepEqual(result.loaded, ['endpoints'])
  })
  assert.deepEqual(warnings, [], 'no warning when the alias is built')
  assert.ok(router.getRoutes().some((r) => r.path === '/popup/endpoints/endpoints/:agentId?'), 'the alias exists')
  for (const hash of [`/popup/endpoints/endpoints/${AGENT}`, '/popup/endpoints/endpoints']) {
    const resolved = router.resolve(hash)
    assert.notEqual(resolved.name, 'popup-pending', hash)
    assert.equal(resolved.matched.at(-1).components.default.name, 'endpoints-view', hash)
  }
  assert.equal(router.resolve(`/popup/endpoints/endpoints/${AGENT}`).params.agentId, AGENT)
  assert.equal(router.resolve('/popup/endpoints/nothing/here').name, 'popup-pending')
}

// (2) beforeEnter: no permission on the route passes; a missing permission is refused.
{
  const router = makeRouter()
  await loadUiModules(runtime(router, 'endpoints', (meta) => !meta.permission), [descriptor('endpoints', [
    { path: '/endpoints/:agentId?', meta: { popup: true } },
    { path: '/endpoints-secret/:id?', meta: { popup: true, permission: 'endpoints.secret' } },
  ])])
  await router.push('/popup/endpoints/endpoints')
  assert.equal(router.currentRoute.value.path, '/popup/endpoints/endpoints')
  await router.push('/popup/endpoints/endpoints-secret')
  assert.equal(router.currentRoute.value.path, '/popup/refused')
}

// (3) The Take Control shape still works.
{
  const router = makeRouter()
  await loadUiModules(runtime(router, 'take-control'), [descriptor('take-control', [{ path: '/take-control/:id/vnc', meta: { popup: true } }])])
  assert.equal(router.resolve('/popup/take-control/take-control/12/vnc').params.id, '12')
}

// (4) Paths that stay refused get no alias and now log a warning that names module, path and reason.
const refused = ['/x#y', '/x y', '/x/../y', '/x?y', '/x\\y', '/x/:id??', '/x/y\u0007', '/x/​y']
for (const bad of refused) {
  const router = makeRouter()
  const warnings = await withWarnings(async () => {
    await loadUiModules(runtime(router, 'm'), [descriptor('m', [{ path: bad, meta: { popup: true } }])])
  })
  assert.ok(!router.getRoutes().some((r) => r.path.startsWith('/popup/m')), `no alias for ${JSON.stringify(bad)}`)
  assert.equal(warnings.length, 1, `one warning for ${JSON.stringify(bad)}`)
  assert.match(warnings[0], /module m route/)
  assert.match(warnings[0], /no popup alias/)
}

// (5) A route without meta.popup gets no alias and no warning.
{
  const router = makeRouter()
  const warnings = await withWarnings(async () => {
    await loadUiModules(runtime(router, 'm'), [descriptor('m', [{ path: '/plain/:id?' }, { path: '/other', meta: { popup: false } }])])
  })
  assert.deepEqual(warnings, [])
  assert.ok(!router.getRoutes().some((r) => r.path.startsWith('/popup/m')))
}

// (6) popupAliasPath and popupRoutePathProblem agree with the loader.
assert.equal(popup.popupAliasPath('endpoints', '/endpoints/:agentId?'), '/popup/endpoints/endpoints/:agentId?')
assert.equal(popup.popupAliasPath('m', '/a/:id([0-9]+)?/b'), '/popup/m/a/:id([0-9]+)?/b')
assert.equal(popup.popupAliasPath('m', '/a/:rest*'), '/popup/m/a/:rest*')
assert.equal(popup.popupAliasPath('m', '/take-control/:id/vnc'), '/popup/m/take-control/:id/vnc')
for (const bad of [...refused, 'x', '', null]) {
  assert.equal(popup.popupAliasPath('m', bad), '', JSON.stringify(bad))
  assert.notEqual(popup.popupRoutePathProblem(bad), '', JSON.stringify(bad))
}
assert.equal(popup.popupAliasPath('bad id', '/x'), '')
assert.equal(popup.popupHref('endpoints', '/endpoints/x?tab=1', 'https://h'), '')
assert.equal(popup.popupHref('endpoints', '/popup/x', 'https://h'), '')

// (7) popupMissDetails lists the registered popup aliases only.
{
  const router = makeRouter()
  await loadUiModules(runtime(router, 'endpoints'), [descriptor('endpoints', [{ path: '/endpoints/:agentId?', meta: { popup: true } }])])
  const details = popup.popupMissDetails('#/popup/endpoints/x', { moduleId: 'endpoints', path: '/x' }, router.getRoutes(), ['endpoints'])
  assert.equal(details.moduleId, 'endpoints')
  assert.equal(details.path, '/x')
  assert.equal(details.ownerLoaded, true)
  assert.deepEqual(details.popupAliases, ['/popup/endpoints/endpoints/:agentId?'])
}

// (8) Source assertions: main.js warns on popup-pending after the replay and when the owner did not load; guards stay.
const main = read('../src/main.js')
const replayAt = main.indexOf('await router.replace(initialHashTarget)')
const pendingAt = main.indexOf("router.currentRoute.value.name === 'popup-pending'")
assert.ok(replayAt > 0 && pendingAt > replayAt, 'the popup-pending check runs after the replay')
assert.match(main.slice(pendingAt, pendingAt + 700), /console\.warn\([\s\S]*popupMissDetails/)
assert.match(main, /the owner module did not load/)
const loaderText = read('../src/module-loader.js')
assert.ok(loaderText.includes('const POPUP_PREFIX_PATTERN = /^\\/popup(\\/|$)/i'))
assert.match(loaderText, /cannot register a route or alias under \/popup\//)
assert.ok(loaderText.includes('if (!popup.permitted(route.meta || {}))'))
assert.ok(read('../src/popup-mode.js').includes("if (context?.source !== 'backend') return false"))

console.log('popup optional parameter 0.12.97: ok')
