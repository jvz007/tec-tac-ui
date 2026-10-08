import assert from 'node:assert/strict'
import fs from 'node:fs'

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])
const { normalizeBackendRuntimeContext, emptyRuntimeContext } = await import('../src/runtime-context.js')

// Normalization of module_register_timeout_seconds.
for (const bad of [4, 301, '30', true, undefined, null, 30.5, -1, NaN]) {
  assert.equal(normalizeBackendRuntimeContext({ module_register_timeout_seconds: bad }).module_register_timeout_seconds, 30, `value ${String(bad)}`)
}
for (const good of [5, 30, 300, 120]) {
  assert.equal(normalizeBackendRuntimeContext({ module_register_timeout_seconds: good }).module_register_timeout_seconds, good)
}
assert.equal(normalizeBackendRuntimeContext({}).module_register_timeout_seconds, 30)
assert.equal(normalizeBackendRuntimeContext(null).module_register_timeout_seconds, 30)
assert.equal(emptyRuntimeContext().module_register_timeout_seconds, 30)

// A tiny router and registry fixture that records what is added and removed.
function fixture() {
  const routes = []
  const navigation = []
  const registered = []
  const cleared = []
  const router = {
    currentRoute: { value: { path: '/', fullPath: '/' } },
    getRoutes: () => routes,
    addRoute(route) {
      routes.push(route)
      return () => { const index = routes.indexOf(route); if (index >= 0) routes.splice(index, 1) }
    },
    replace: async () => {},
  }
  const registry = (name) => ({
    forModule(id) {
      return Object.freeze({
        register(item) { registered.push(`${name}:${id}:${item}`); return () => {} },
        clear() { cleared.push(`${name}:${id}`) },
      })
    },
  })
  const runtime = {
    state: { context: { permissions: [], user: {}, module_register_timeout_seconds: 30 }, contextSource: 'backend' },
    router,
    addNavigation(item) { navigation.push(item) },
    removeNavigation(moduleId) {
      for (let i = navigation.length - 1; i >= 0; i -= 1) if (navigation[i].moduleId === moduleId) navigation.splice(i, 1)
    },
    api: async () => {}, apiRaw: async () => {}, apiBlob: async () => {}, apiText: async () => {},
    contextActions: registry('actions'),
    audit: registry('audit'),
    codeEditor: registry('editor'),
  }
  return { runtime, routes, navigation, registered, cleared }
}

// A module that never resolves times out and is marked failed; the next loads.
{
  const f = fixture()
  globalThis.__late = null
  const hang = entry(`export default { register(ctx) { ctx.addNavigation({ to: '/hang', label: 'Hang' }); ctx.router.addRoute({ path: '/hang', component: {} }); return new Promise(() => {}) } }`)
  const good = entry(`export default { async register(ctx) { ctx.addNavigation({ to: '/good', label: 'Good' }); ctx.router.addRoute({ path: '/good', component: {} }) } }`)
  const started = Date.now()
  const result = await loader.loadUiModules(f.runtime, [
    { id: 'hang', entry: hang, permissions: [], allowed: true },
    { id: 'good', entry: good, permissions: [], allowed: true },
  ], { timeoutMs: 50 })
  assert.ok(Date.now() - started < 3000)
  assert.deepEqual(result.loaded, ['good'])
  assert.equal(result.failed.length, 1)
  assert.equal(result.failed[0].id, 'hang')
  assert.equal(result.failed[0].timedOut, true)
  assert.match(result.failed[0].message, /^register\(\) did not finish within [\d.]+ seconds$/)
  // The hung module's navigation and routes are gone; the good module keeps its own.
  assert.deepEqual(f.navigation.map((item) => item.to), ['/good'])
  assert.deepEqual(f.routes.map((route) => route.path), ['/good'])
  assert.ok(f.cleared.includes('actions:hang') && f.cleared.includes('audit:hang') && f.cleared.includes('editor:hang'))
}

// The budget is read from context.module_register_timeout_seconds.
{
  const f = fixture()
  f.runtime.state.context.module_register_timeout_seconds = 5
  const slow = entry(`export default { async register() { await new Promise((resolve) => setTimeout(resolve, 150)) } }`)
  const result = await loader.loadUiModules(f.runtime, [{ id: 'slow', entry: slow, permissions: [], allowed: true }])
  assert.deepEqual(result.loaded, ['slow'])
  assert.deepEqual(result.failed, [])
}

// A module that adds navigation and a route and then throws has both removed.
{
  const f = fixture()
  const bad = entry(`export default { async register(ctx) { ctx.addNavigation({ to: '/bad', label: 'Bad' }); ctx.router.addRoute({ path: '/bad', component: {} }); throw new Error('boom') } }`)
  const result = await loader.loadUiModules(f.runtime, [{ id: 'bad', entry: bad, permissions: [], allowed: true }], { timeoutMs: 500 })
  assert.deepEqual(result.failed, [{ id: 'bad', message: 'boom' }])
  assert.deepEqual(f.navigation, [])
  assert.deepEqual(f.routes, [])
  // The route can be claimed again by someone else: ownership was released.
  const again = entry(`export default { async register(ctx) { ctx.router.addRoute({ path: '/bad', component: {} }) } }`)
  const second = await loader.loadUiModules(f.runtime, [{ id: 'other', entry: again, permissions: [], allowed: true }], { timeoutMs: 500 })
  assert.deepEqual(second.loaded, ['other'])
}

// A module that registers late, after the timeout, is refused and cleaned up.
{
  const f = fixture()
  globalThis.__lateResult = null
  const late = entry(`export default { async register(ctx) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    const outcome = {}
    try { ctx.addNavigation({ to: '/late', label: 'Late' }) } catch (error) { outcome.nav = error.message }
    try { ctx.router.addRoute({ path: '/late', component: {} }) } catch (error) { outcome.route = error.message }
    try { ctx.contextActions.register('x') } catch (error) { outcome.registry = error.message }
    outcome.clear = typeof ctx.contextActions.clear
    globalThis.__lateResult = outcome
  } }`)
  const result = await loader.loadUiModules(f.runtime, [{ id: 'late', entry: late, permissions: [], allowed: true }], { timeoutMs: 50 })
  assert.equal(result.failed[0].timedOut, true)
  await sleep(400)
  assert.match(globalThis.__lateResult.nav, /abandoned/)
  assert.match(globalThis.__lateResult.route, /abandoned/)
  assert.match(globalThis.__lateResult.registry, /abandoned/)
  assert.equal(globalThis.__lateResult.clear, 'function')
  assert.deepEqual(f.navigation, [])
  assert.deepEqual(f.routes, [])
  assert.deepEqual(f.registered, [])
}

// A late register that adds something through a path that was open before the
// timeout is removed when the promise settles.
{
  const f = fixture()
  const late = entry(`export default { async register(ctx) {
    ctx.addNavigation({ to: '/early', label: 'Early' })
    await new Promise((resolve) => setTimeout(resolve, 150))
  } }`)
  const result = await loader.loadUiModules(f.runtime, [{ id: 'early', entry: late, permissions: [], allowed: true }], { timeoutMs: 40 })
  assert.equal(result.failed[0].timedOut, true)
  assert.deepEqual(f.navigation, [])
  await sleep(300)
  assert.deepEqual(f.navigation, [])
}

// A runtime without removeNavigation (older callers) still works.
{
  const f = fixture()
  delete f.runtime.removeNavigation
  const bad = entry(`export default { async register() { throw new Error('plain') } }`)
  const result = await loader.loadUiModules(f.runtime, [{ id: 'bad', entry: bad, permissions: [], allowed: true }])
  assert.deepEqual(result.failed, [{ id: 'bad', message: 'plain' }])
}

// A public module that hangs does not block the next one.
{
  const routes = []
  const router = {
    currentRoute: { value: { path: '/', fullPath: '/' } },
    getRoutes: () => routes,
    addRoute(route) { routes.push(route); return () => routes.splice(routes.indexOf(route), 1) },
    replace: async () => {},
  }
  const hang = entry(`export default { registerPublic(ctx) { ctx.addPublicRoute({ path: '/public/hang/a', component: {} }); return new Promise(() => {}) } }`)
  const good = entry(`export default { async registerPublic(ctx) { ctx.addPublicRoute({ path: '/public/good/a', component: {} }) } }`)
  const result = await loader.loadPublicUiModules({ app: {}, router, publicApi: async () => {} }, [
    { id: 'hang', public: { entry: hang, base_path: '/public/hang' } },
    { id: 'good', public: { entry: good, base_path: '/public/good' } },
  ], { timeoutMs: 50 })
  assert.deepEqual(result.loaded, ['good'])
  assert.equal(result.failed[0].id, 'hang')
  assert.equal(result.failed[0].timedOut, true)
  assert.deepEqual(routes.map((route) => route.path), ['/public/good/a'])
}

// Source assertions: main.js supplies removeNavigation and the loader cleans up.
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
assert.match(main, /function removeNavigation\(moduleId\)/)
assert.match(main, /removeNavigation,\n/)
const loaderSource = fs.readFileSync(new URL('../src/module-loader.js', import.meta.url), 'utf8')
assert.ok(!/^import .* from '\.\//m.test(loaderSource), 'module-loader.js must not gain relative imports')

console.log('[TEST] module register() time limit and failed-module cleanup OK')
