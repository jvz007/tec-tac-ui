// 0.12.95: popup (chromeless) mode. A module page opens in its own window at /tec-tac/#/popup/<id>/<route path>. Only the
// owning module and its hard dependencies load; the shell shows no chrome; a route is opened only when it declares
// meta.popup and the person holds its permission (AD-12). Outside popup mode the loader behaves as before.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
function dataModule(rel, replacements = []) {
  let source = read(rel)
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`

const popup = await import('../src/popup-mode.js')
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])
const { loadUiModules, moduleIsAllowed, bindPopupHref } = loader

const ORIGIN = 'https://tec.example.test'
const hrefFor = (id, p) => popup.popupHref(id, p, ORIGIN)

// (1) parsePopupHash: a good path, and every kind of refusal.
assert.deepEqual(popup.parsePopupHash('#/popup/take-control/take-control/12/vnc'), { moduleId: 'take-control', path: '/take-control/12/vnc' })
assert.deepEqual(popup.parsePopupHash('#/popup/scoutdns/scoutdns'), { moduleId: 'scoutdns', path: '/scoutdns' })
for (const hash of [
  '#/popup//take-control',
  '#/popup/',
  '#/popup',
  '#/popup/take-control',
  '#/popup/take-control/',
  '#/popup/take-control/../x',
  '#/popup/take-control/%2e%2e/x',
  '#/popup/take-control/%252e%252e/x',
  '#/popup/%2e%2e/x',
  '#/popup/take-control/' + String.fromCharCode(0x200b) + 'x',
  '#/popup/take-control/x\u0007',
  '#/popup/take' + String.fromCharCode(0x200b) + 'control/x',
  '#/popup/take-control/x?tab=1',
  '#/popup/take-control/x\\y',
  '#/popup/bad id/x',
  '#/dashboards',
  '#/modules',
  '/popup/take-control/x',
  '',
  null,
]) {
  assert.equal(popup.parsePopupHash(hash), null, `refused: ${JSON.stringify(hash)}`)
}

// (2) popupHref and popupAliasPath: own id only, '' for a path it cannot build safely.
assert.equal(hrefFor('take-control', '/take-control/12/vnc'), `${ORIGIN}/tec-tac/#/popup/take-control/take-control/12/vnc`)
assert.equal(hrefFor('take-control', '/../other/vnc'), '')
assert.equal(hrefFor('take-control', '/take-control/%2e%2e/other'), '')
assert.equal(hrefFor('take-control', '/popup/other/x'), '', 'a path cannot point at another popup')
assert.equal(hrefFor('take-control', '/take-control/x?tab=1'), '')
assert.equal(hrefFor('take-control', 'take-control/12'), '', 'a path must start with /')
assert.equal(hrefFor('take-control', '/take-control/' + String.fromCharCode(0x200b) + ''), '')
assert.equal(hrefFor('bad id', '/x'), '')
assert.equal(hrefFor('take-control', '/take-control//vnc'), '')
assert.equal(popup.popupHref('take-control', '/x', null), '', 'origin must be a string')
assert.equal(popup.popupAliasPath('take-control', '/take-control/:agent_id/vnc'), '/popup/take-control/take-control/:agent_id/vnc')
assert.equal(popup.popupAliasPath('take-control', 'take-control'), '')
assert.equal(popup.popupAliasPath('../x', '/x'), '')

// (3) popupRoutePermitted: the code rule, superuser, and a context that did not come from the backend.
const backend = { source: 'backend', permissions: ['agents.read'], user: {} }
assert.equal(popup.popupRoutePermitted({ popup: true }, backend), true, 'no code needed')
assert.equal(popup.popupRoutePermitted({ popup: true, permission: 'agents.read' }, backend), true)
assert.equal(popup.popupRoutePermitted({ popup: true, permission: 'agents.write' }, backend), false, 'a missing code is refused')
assert.equal(popup.popupRoutePermitted({ popup: true, permissions: ['agents.read', 'agents.write'] }, backend), false, 'every code is required')
assert.equal(popup.popupRoutePermitted({ popup: true, permissions: ['agents.read'] }, backend), true)
assert.equal(popup.popupRoutePermitted({ popup: true, permission: 'agents.write' }, { ...backend, user: { superuser: true } }), true, 'superuser passes')
assert.equal(popup.popupRoutePermitted({ popup: true }, { source: 'local-manifest', permissions: [], user: {} }), false, 'no backend context is denied')
assert.equal(popup.popupRoutePermitted({ popup: true, permission: 'agents.read' }, { source: 'none', permissions: ['agents.read'], user: { superuser: true } }), false)
assert.equal(popup.popupRoutePermitted({ popup: true, permission: 7 }, backend), false, 'a malformed code is refused, never passed')
assert.equal(popup.popupRoutePermitted({ popup: true, permissions: 'agents.read' }, backend), false)
assert.equal(popup.popupRoutePermitted({ popup: true, permissions: ['agents.read', ''] }, backend), false)

// (4) popupModuleSet: the owner plus its hard dependencies, dependencies first.
const d = (id, extra = {}) => ({ id, entry: `/tec-tac/modules/${id}/index.js`, ...extra })
const diamond = [
  d('A', { dependencies: ['B', 'C'] }),
  d('B', { dependencies: ['D'] }),
  d('C', { dependencies: { D: '>=1.0.0' } }),
  d('D', { dependencies: [] }),
  d('E', { dependencies: ['D'] }),
]
assert.deepEqual(popup.popupModuleSet(diamond, 'A').map((x) => x.id), ['D', 'B', 'C', 'A'], 'hard deps in dependency order, object or array form')
assert.deepEqual(popup.popupModuleSet(diamond, 'E').map((x) => x.id), ['D', 'E'])
assert.deepEqual(popup.popupModuleSet([d('X', { dependencies: ['Y'] }), d('Y', { dependencies: ['X'] })], 'X').map((x) => x.id), ['Y', 'X'], 'a cycle is cut, not looped')
assert.deepEqual(popup.popupModuleSet([d('Q', { dependencies: ['noentry'] }), { id: 'noentry', dependencies: [] }], 'Q').map((x) => x.id), ['Q'], 'a dependency without an entry is ignored')
assert.deepEqual(popup.popupModuleSet([d('R', { dependencies: ['gated'] }), d('gated', { permissions: ['secret.code'] })], 'R', { allowed: (x) => !(x.permissions || []).length }).map((x) => x.id), ['R'], 'a refused dependency is left out')
assert.deepEqual(popup.popupModuleSet(diamond, 'missing'), [], 'an unknown module gives nothing')
assert.deepEqual(popup.popupModuleSet(diamond, 'A', { allowed: () => false }), [], 'an owner that is not allowed gives nothing')
const chain = Array.from({ length: 40 }, (_, i) => d(`m${i}`, { dependencies: [`m${i + 1}`] }))
const deep = popup.popupModuleSet(chain, 'm0')
assert.ok(deep.length <= 17, `the depth guard stops the walk (got ${deep.length})`)
assert.equal(deep[deep.length - 1].id, 'm0')

// Fake router: records routes and answers the calls the loader makes.
function fakeRouter() {
  const routes = []
  return {
    routes,
    getRoutes: () => routes.map((r) => ({ path: r.path, name: r.name, meta: r.meta })),
    addRoute(parentOrRoute, maybe) {
      const route = maybe === undefined ? parentOrRoute : maybe
      routes.push(route)
      return () => { const index = routes.indexOf(route); if (index >= 0) routes.splice(index, 1) }
    },
    currentRoute: { value: { path: '/popup/take-control' } },
    async replace() {},
  }
}
const ctxFor = (permissions = ['agents.read'], source = 'backend') => ({ permissions, permissionSet: new Set(permissions), user: {}, source })
globalThis.__imports = []
let uid = 0
function moduleUrl(id, { routes = [], fail = false, capture = false } = {}) {
  uid += 1
  return dataUrl(`// ${id} ${uid} ${Math.random()}
globalThis.__imports.push(${JSON.stringify(id)});
export default {
  register(context) {
    ${capture ? 'globalThis.__captured = context;' : ''}
    ${fail ? "throw new Error('register failed on purpose')" : ''}
    for (const route of ${JSON.stringify(routes)}) context.router.addRoute({ ...route, component: {} });
  },
};`)
}
const runtimeFor = (popupMode, { permissions = ['agents.read'] } = {}) => ({
  app: {},
  router: fakeRouter(),
  state: { context: { permissions, user: {}, module_status: [] }, contextSource: 'backend' },
  addNavigation() {},
  removeNavigation() {},
  popupHref: (moduleId, p) => hrefFor(moduleId, p),
  popupMode,
})

// (5) loadUiModules with the filtered set imports only the owner and its dependency; nothing else is requested.
const ownerRoutes = [
  { path: '/take-control/:agent_id/vnc', meta: { popup: true, permission: 'agents.read' } },
  { path: '/take-control/list', meta: {} },
]
const helperUrl = moduleUrl('helper')
const ownerUrl = moduleUrl('take-control', { routes: ownerRoutes })
const otherUrl = moduleUrl('other', { routes: [{ path: '/other/vnc', meta: { popup: true } }] })
const gatedUrl = moduleUrl('gated')
const modulesList = [
  { id: 'take-control', entry: ownerUrl, dependencies: ['helper'], permissions: [] },
  { id: 'helper', entry: helperUrl, dependencies: [], permissions: [] },
  { id: 'other', entry: otherUrl, dependencies: [], permissions: [] },
  { id: 'gated', entry: gatedUrl, dependencies: [], permissions: ['secret.code'] },
]
globalThis.__imports = []
const ctx = ctxFor()
const set = popup.popupModuleSet(modulesList, 'take-control', { allowed: (x) => moduleIsAllowed(x, ctx) })
assert.deepEqual(set.map((x) => x.id), ['helper', 'take-control'])
const popupRuntime = runtimeFor({
  moduleId: 'take-control',
  permitted: (meta) => popup.popupRoutePermitted(meta, { ...ctx, source: 'backend' }),
  refuse: () => {},
  deniedMessage: popup.POPUP_MESSAGE_UNAVAILABLE,
})
const popupResult = await loadUiModules(popupRuntime, set, { timeoutMs: 5000 })
assert.deepEqual(popupResult.loaded, ['helper', 'take-control'])
assert.deepEqual(globalThis.__imports, ['helper', 'take-control'], 'a popup boot imports the owner and its hard dependency only')
assert.equal(popupResult.failed.length, 0)

// (6) the alias: only the owning module's routes that carry meta.popup === true.
const routesNow = popupRuntime.router.routes
const vnc = routesNow.find((r) => r.path === '/take-control/:agent_id/vnc')
assert.deepEqual(vnc.alias, ['/popup/take-control/take-control/:agent_id/vnc'], 'the owner route gets its popup alias')
assert.equal(routesNow.find((r) => r.path === '/take-control/list').alias, undefined, 'a route without meta.popup gets no alias')
globalThis.__imports = []
const otherRuntime = runtimeFor({ moduleId: 'take-control', permitted: () => true, refuse: () => {}, deniedMessage: '' })
await loadUiModules(otherRuntime, [modulesList[2]], { timeoutMs: 5000 })
assert.equal(otherRuntime.router.routes[0].alias, undefined, 'another module with meta.popup gets no alias')

// Popup mode off: no alias is ever added (existing behaviour).
const offRuntime = runtimeFor(null)
await loadUiModules(offRuntime, [{ id: 'take-control', entry: moduleUrl('take-control', { routes: ownerRoutes }), dependencies: [], permissions: [] }], { timeoutMs: 5000 })
assert.ok(offRuntime.router.routes.every((r) => r.alias === undefined), 'popup mode off adds no alias')
assert.ok(offRuntime.router.routes.every((r) => r.beforeEnter === undefined), 'popup mode off adds no guard')

// (7) the route guard (AD-12): a route whose permission the person lacks is refused and never rendered.
const refusals = []
const guardedRuntime = runtimeFor({
  moduleId: 'take-control',
  permitted: (meta) => popup.popupRoutePermitted(meta, { permissions: ['agents.read'], user: {}, source: 'backend' }),
  refuse: (message) => refusals.push(message),
  deniedMessage: popup.POPUP_MESSAGE_UNAVAILABLE,
}, { permissions: ['agents.read'] })
globalThis.__imports = []
await loadUiModules(guardedRuntime, [{ id: 'take-control', entry: moduleUrl('take-control', { routes: [{ path: '/take-control/:id/secret', meta: { popup: true, permission: 'agents.write' } }, { path: '/take-control/:id/open', meta: { popup: true, permission: 'agents.read' } }] }), dependencies: [], permissions: [] }], { timeoutMs: 5000 })
const secret = guardedRuntime.router.routes.find((r) => r.path === '/take-control/:id/secret')
const open = guardedRuntime.router.routes.find((r) => r.path === '/take-control/:id/open')
assert.equal(secret.beforeEnter({}, {}), '/popup/refused', 'a route the person cannot open is redirected to the refusal')
assert.deepEqual(refusals, [popup.POPUP_MESSAGE_UNAVAILABLE])
assert.equal(open.beforeEnter({}, {}), true, 'a route the person may open continues')
assert.equal(refusals.length, 1)

// (8) a skipped module (permission-gated, not in the set) and a failed module make no module request beyond their own.
globalThis.__imports = []
const gatedSet = popup.popupModuleSet([{ id: 'gated', entry: gatedUrl, dependencies: [], permissions: ['secret.code'] }], 'gated', { allowed: (x) => moduleIsAllowed(x, ctx) })
assert.deepEqual(gatedSet, [], 'a permission-gated owner is not in the set')
const gatedResult = await loadUiModules(runtimeFor(null), gatedSet, { timeoutMs: 5000 })
assert.deepEqual(globalThis.__imports, [], 'a skipped module is never requested')
assert.equal(gatedResult.loaded.length, 0)
globalThis.__imports = []
const failing = await loadUiModules(runtimeFor({ moduleId: 'bad', permitted: () => true, refuse: () => {}, deniedMessage: '' }), [{ id: 'bad', entry: moduleUrl('bad', { fail: true }), dependencies: [], permissions: [] }], { timeoutMs: 5000 })
assert.deepEqual(failing.loaded, [])
assert.equal(failing.failed[0].id, 'bad')
assert.deepEqual(globalThis.__imports, ['bad'], 'a failed module is requested once and nothing else')

// (9) popupHref is bound to the calling module and refused after a failed register().
globalThis.__captured = null
const capturing = moduleUrl('take-control', { capture: true })
await loadUiModules(runtimeFor(null), [{ id: 'take-control', entry: capturing, dependencies: [], permissions: [] }], { timeoutMs: 5000 })
const captured = globalThis.__captured
assert.equal(captured.popupHref('/take-control/9/vnc'), `${ORIGIN}/tec-tac/#/popup/take-control/take-control/9/vnc`)
assert.equal(captured.popupHref('/../other'), '')
assert.equal(captured.popupHref('/popup/other/x'), '', 'another module id cannot be named')
const boundAbandon = bindPopupHref((id, p) => hrefFor(id, p), { moduleId: 'x', isAbandoned: () => true })
assert.throws(() => boundAbandon('/x'), /abandoned after a failed or timed-out register\(\); popupHref\(\) is refused/)
const boundLive = bindPopupHref((id, p) => hrefFor(id, p), { moduleId: 'x', isAbandoned: () => false })
assert.equal(boundLive('/x/1'), `${ORIGIN}/tec-tac/#/popup/x/x/1`)
const boundBad = bindPopupHref(() => undefined, { moduleId: 'x', isAbandoned: () => false })
assert.equal(boundBad('/x'), '', 'a helper that returns nothing gives an empty string')
globalThis.__captured = null
const failingCapture = moduleUrl('take-control', { capture: true, fail: true })
await loadUiModules(runtimeFor(null), [{ id: 'take-control', entry: failingCapture, dependencies: [], permissions: [] }], { timeoutMs: 5000 })
assert.throws(() => globalThis.__captured.popupHref('/take-control/1'), /abandoned/, 'popupHref is refused after the failed register()')

// (10) source checks: main.js, App.vue, router.js, the pending view and the sync script.
const main = read('../src/main.js')
assert.match(main, /state\.publicModuleLoad = popupMode\s*\?\s*\{ loaded: \[\], failed: \[\] \}\s*:\s*await loadPublicUiModules\(/, 'a popup never loads public modules')
assert.match(main, /const toLoad = popupMode\s*\?\s*\(popupTarget \? popupModuleSet\(/, 'a popup loads only the filtered set')
assert.match(main, /if \(popupTarget && !state\.moduleLoad\.loaded\.includes\(popupTarget\.moduleId\)\) refusePopup\(POPUP_MESSAGE_UNAVAILABLE\)/)
assert.match(main, /popupHref: \(moduleId, path\) => buildPopupHref\(moduleId, path, window\.location\.origin\)/)
const app = read('../src/App.vue')
assert.match(app, /const popupLayout = computed\(\(\) => route\.path\.startsWith\('\/popup\/'\) \|\| state\.popup\?\.active === true\)/)
assert.match(app, /if \(!state\.popup\?\.active\) notifications\?\.startServerNoticePolling\?\.\(\)/, 'a popup never starts the notice poll')
const chrome = app.slice(app.indexOf('<template v-if="!popupLayout">'), app.indexOf('<main class="main">'))
for (const piece of ['class="brand"', 'class="topbar"', 'class="rail"', 'navContextMenu']) assert.ok(chrome.includes(piece), `chrome is behind the layout guard: ${piece}`)
assert.ok(app.includes('<NoticeDrawer v-if="!popupLayout" />'))
assert.ok(app.includes('<HelpDrawer v-if="!popupLayout" />'))
assert.ok(app.includes('<QuickActionsDialog v-if="!popupLayout" v-model="quickActionsOpen" />'))
assert.ok(app.includes('<UnsavedChangesDialog />'), 'unsaved-changes dialog stays in a popup')
assert.ok(app.includes('<ModuleErrorBoundary v-else-if="state.status === \'ready\'"'), 'the error boundary stays around the page')
const mainSection = app.slice(app.indexOf('<main class="main">'), app.indexOf('</main>'))
for (const piece of ['NoticeDrawer', 'HelpDrawer', 'QuickActionsDialog', 'startServerNoticePolling']) assert.ok(!mainSection.includes(piece), `no ${piece} in the page area`)
const router = read('../src/router.js')
assert.ok(router.indexOf("path: '/popup/:pathMatch(.*)*'") < router.indexOf("path: '/:pathMatch(.*)*'"), 'the popup catch comes before the core catch-all')
const loaderSrc = read('../src/module-loader.js')
assert.doesNotMatch(loaderSrc, /^import .* from '\.\.?\//m, 'module-loader.js keeps no relative imports')
assert.match(loaderSrc, /const popupForModule = runtime\.popupMode && runtime\.popupMode\.moduleId === descriptor\.id/)
const sync = read('../scripts/sync-modules.sh')
assert.match(sync, /hard_deps=sorted\(str\(dep\) for dep in \(raw_deps\.keys\(\) if isinstance\(raw_deps,dict\) else raw_deps\)\)/)
assert.match(sync, /"dependencies":hard_deps/)
assert.match(sync, /ext_payload=json\.loads\(ext_manifest\.read_text/)

// The sync script's Python, run against a small extension tree: the hard dependencies reach modules.json, optional ones do not.
const scriptPy = sync.slice(sync.indexOf("<<'PY'\n") + "<<'PY'\n".length, sync.indexOf('\nPY\n'))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'popup-sync-'))
const extRoot = path.join(tmp, 'extensions')
for (const [id, deps] of [['take-control', { helper: '>=1.0.0' }], ['helper', {}]]) {
  const dir = path.join(extRoot, id)
  fs.mkdirSync(path.join(dir, 'ui'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'ui', 'index.js'), 'export default {}\n')
  fs.writeFileSync(path.join(dir, 'tec_tac_ui.json'), JSON.stringify({ id, entry: 'ui/index.js', version: '1.0.0' }))
  fs.writeFileSync(path.join(dir, 'tec_tac.json'), JSON.stringify({
    id, version: '1.0.0', permission_groups: {}, dependencies: deps, optional_dependencies: { scoutdns: '>=0.1.0' },
  }))
}
const outRoot = path.join(tmp, 'out')
fs.mkdirSync(outRoot)
// The first interpreter that runs. The Windows Store alias for python3 exits with an error, so it is skipped.
const pythonCandidates = [process.env.PYTHON_BIN, 'python', 'python3', 'py'].filter(Boolean)
const pyBin = pythonCandidates.find((candidate) => {
  try { execFileSync(candidate, ['--version'], { stdio: 'pipe' }); return true } catch { return false }
})
assert.ok(pyBin, 'a Python interpreter is needed to run the sync script')
execFileSync(pyBin, ['-', extRoot, outRoot, path.join(tmp, 'no-state.json')], { input: scriptPy, stdio: ['pipe', 'pipe', 'pipe'] })
const manifest = JSON.parse(fs.readFileSync(path.join(outRoot, 'modules.json'), 'utf8'))
const byId = Object.fromEntries(manifest.map((item) => [item.id, item]))
assert.deepEqual(byId['take-control'].dependencies, ['helper'], 'hard dependencies reach the descriptor')
assert.ok(!byId['take-control'].dependencies.includes('scoutdns'), 'optional dependencies do not')
assert.deepEqual(byId.helper.dependencies, [])
fs.rmSync(tmp, { recursive: true, force: true })

// (11) the docs say what a popup loads and how a module opts a route in.
const docs = read('../docs/module-runtime-api.md')
assert.ok(docs.includes('## Popup mode'), 'the runtime docs have a Popup mode section')
assert.ok(docs.includes('#/popup/'), 'the docs give the popup URL form')
assert.ok(docs.includes('meta: { popup: true'), 'the docs show how a route opts in')
assert.ok(docs.includes('popupHref(path)'), 'the docs name popupHref(path)')

console.log('popup-mode-0.12.95: ok')
