// 0.12.96 (held Low from the 0.12.95 review): the /popup/ prefix belongs to the shell. A module route whose path or
// alias starts with /popup/ is refused. Only withPopupRoute adds a popup path, for the owning module's own route.
// Every alias is checked against the paths and aliases already registered. Also the version and Core pin.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const loaderSource = read('../src/module-loader.js').replace("import * as Vue from 'vue'", 'const Vue = {}')
const { loadUiModules } = await import(dataUrl(loaderSource))

// A router that lists alias records too, as vue-router's getRoutes() does.
function fakeRouter() {
  const routes = []
  return {
    routes,
    getRoutes: () => routes.flatMap((r) => [{ path: r.path, name: r.name, meta: r.meta }, ...[].concat(r.alias || []).map((alias) => ({ path: alias, meta: r.meta }))]),
    addRoute(parentOrRoute, maybe) {
      const route = maybe === undefined ? parentOrRoute : maybe
      routes.push(route)
      return () => {}
    },
    currentRoute: { value: { path: '/' } },
    async replace() {},
  }
}
let uid = 0
function moduleUrl(id, routes) {
  uid += 1
  return dataUrl(`// ${id} ${uid} ${Math.random()}
export default {
  register(context) {
    for (const route of ${JSON.stringify(routes)}) context.router.addRoute({ ...route, component: {} });
  },
};`)
}
const popupMode = { moduleId: 'take-control', permitted: () => true, refuse() {}, deniedMessage: '' }
const runtime = (router) => ({
  app: {},
  router,
  state: { context: { permissions: [], user: {}, module_status: [] }, contextSource: 'backend' },
  addNavigation() {},
  removeNavigation() {},
  popupMode,
})
const descriptor = (id, routes) => ({ id, entry: moduleUrl(id, routes), dependencies: [], permissions: [] })

// A path under /popup/ is refused, in every spelling.
for (const path of ['/popup/x/y', '/popup/take-control/take-control/12', '/POPUP/x', '//popup//x', '/popup']) {
  const router = fakeRouter()
  const result = await loadUiModules(runtime(router), [descriptor('evil', [{ path }])], { timeoutMs: 5000 })
  assert.deepEqual(result.loaded, [], path)
  assert.match(result.failed[0].message, /\/popup\//, path)
  assert.equal(router.routes.length, 0, `${path} was not added`)
}

// An alias under /popup/ is refused too, with a string or a list.
for (const alias of ['/popup/x', ['/fine', '/popup/y/z']]) {
  const router = fakeRouter()
  const result = await loadUiModules(runtime(router), [descriptor('evil', [{ path: '/evil/a', alias }])], { timeoutMs: 5000 })
  assert.deepEqual(result.loaded, [])
  assert.match(result.failed[0].message, /\/popup\//)
  assert.equal(router.routes.length, 0)
}

// The owner's own popup alias still registers through withPopupRoute.
{
  const router = fakeRouter()
  const result = await loadUiModules(runtime(router), [descriptor('take-control', [{ path: '/take-control/:id/vnc', meta: { popup: true } }])], { timeoutMs: 5000 })
  assert.deepEqual(result.failed, [])
  assert.deepEqual(router.routes[0].alias, ['/popup/take-control/take-control/:id/vnc'])
}

// A dependency cannot shadow the owner's alias.
{
  const router = fakeRouter()
  const set = [
    descriptor('take-control', [{ path: '/take-control/a', meta: { popup: true } }]),
    descriptor('helper', [{ path: '/popup/take-control/take-control/a' }, { path: '/helper/b', alias: '/popup/take-control/take-control/a' }]),
  ]
  const result = await loadUiModules(runtime(router), set, { timeoutMs: 5000 })
  assert.deepEqual(result.loaded, ['take-control'])
  assert.equal(result.failed[0].id, 'helper')
  assert.equal(router.routes.length, 1)
}

// An alias that is already taken (a path or another alias) is refused before addRoute.
{
  const router = fakeRouter()
  const set = [
    descriptor('first', [{ path: '/first/a', alias: '/shared/entry' }]),
    descriptor('second', [{ path: '/second/a', alias: '/shared/entry' }]),
    descriptor('third', [{ path: '/third/a', alias: '/first/a' }]),
  ]
  const result = await loadUiModules(runtime(router), set, { timeoutMs: 5000 })
  assert.deepEqual(result.loaded, ['first'])
  assert.match(result.failed.find((f) => f.id === 'second').message, /alias \/shared\/entry/)
  assert.match(result.failed.find((f) => f.id === 'third').message, /alias \/first\/a/)
  assert.equal(router.routes.length, 1)
}

// A normal module without popup aliases is untouched.
{
  const router = fakeRouter()
  const result = await loadUiModules(runtime(router), [descriptor('plain', [{ path: '/plain', alias: '/plain-old' }])], { timeoutMs: 5000 })
  assert.deepEqual(result.failed, [])
  assert.equal(router.routes.length, 1)
}

// The Core requirement and the three version files agree.
const pkg = JSON.parse(read('../package.json'))
const manifest = JSON.parse(read('../tec_tac_package.json'))
const version = read('../VERSION').trim()
assert.match(version, /^0\.12\.(9[6-9]|[1-9]\d\d)(-\d+)?$/) // 0.12.96 or later (moved on each release)
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(manifest.dependencies?.['tec-tac-framework'] ?? manifest.requires?.['tec-tac-framework'] ?? JSON.stringify(manifest).match(/"tec-tac-framework":\s*"([^"]+)"/)?.[1], '>=1.17.25,<2.0.0')

console.log('popup-route-prefix-0.12.96: PASS')
