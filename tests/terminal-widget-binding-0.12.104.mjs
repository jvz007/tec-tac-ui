// 0.12.104: context.terminal is bound to the module that receives it. The shared service never reaches a module; a module
// gets its own scope (create and clear only). Its terminals are cleared when it is unloaded, when its register() fails and
// when its register() times out. A runtime without the service still loads modules, with terminal undefined. registerPublic
// gets no terminal. Every context key the earlier tests assert is still there.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const loader = await import(new URL('../src/module-loader.js', import.meta.url).href)

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const moduleLoader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])

// A fake of the shell's terminal service: one scope per module. The scope exposes create and clear only, as the real one does;
// what it made is kept on a separate record, so the test can read it.
function fakeTerminalService() {
  const scopes = []
  return {
    scopes,
    forModule(moduleId) {
      const record = { moduleId, created: [], cleared: 0 }
      scopes.push(record)
      return {
        async create(element, options) {
          const handle = { moduleId, element, options, disposed: false, dispose() { this.disposed = true } }
          record.created.push(handle)
          return handle
        },
        clear() {
          record.cleared += 1
          for (const handle of record.created) handle.disposed = true
        },
      }
    },
  }
}

const element = { appendChild() {}, clientWidth: 0, clientHeight: 0 }
const shared = fakeTerminalService()
const baseRuntime = () => ({
  app: {},
  router: { currentRoute: { value: { path: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} },
  state: { context: { permissions: ['demo.use'], user: { superuser: true, id: 1 } }, contextSource: 'backend' },
  addNavigation() {},
  removeNavigation() {},
  api: async () => ({}),
  apiRaw: async () => ({}),
  apiBlob: async () => ({}),
  apiText: async () => '',
  services: { forModule: () => ({ provide() {}, has: () => false, list: () => [], call: async () => null, clear() {}, removeProvider() {} }) },
  contextActions: { forModule: () => ({ register() {}, clear() {} }) },
  tacticalWebSocket: { open: async () => ({ status: 'open' }), closeAll() {} },
  jobs: { forModule: () => ({ follow() {}, clear() {} }), stopAll() {} },
  codeEditor: { forModule: () => ({ clear() {} }) },
  confirm: async () => true,
  isSignedOut: () => false,
  terminal: shared,
})

// Each module keeps the context it was given, so the test can read the keys.
const seen = {}
globalThis.__seen = seen
const alphaEntry = entry(`
export default { async register(ctx) {
  globalThis.__seen.alpha = ctx
  globalThis.__seen.alphaTerminal = await ctx.terminal.create(${'{ appendChild() {}, clientWidth: 0, clientHeight: 0 }'}, { theme: { background: '#101010' } })
} }`)
const betaEntry = entry(`
export default { async register(ctx) {
  globalThis.__seen.beta = ctx
  globalThis.__seen.betaTerminal = await ctx.terminal.create({ appendChild() {}, clientWidth: 0, clientHeight: 0 })
} }`)
const failEntry = entry(`
export default { async register(ctx) {
  await ctx.terminal.create({ appendChild() {}, clientWidth: 0, clientHeight: 0 })
  throw new Error('register broke after opening a terminal')
} }`)
const slowEntry = entry(`
export default { async register(ctx) {
  await ctx.terminal.create({ appendChild() {}, clientWidth: 0, clientHeight: 0 })
  await new Promise((resolve) => setTimeout(resolve, 400))
} }`)
const publicEntry = entry(`
export default { registerPublic(ctx) { globalThis.__seen.publicKeys = Object.keys(ctx) } }`)

// 1. two modules load; each gets terminal bound to its own id; the shared object never reaches a module
{
  const runtime = baseRuntime()
  const loaded = await moduleLoader.loadUiModules(runtime, [
    { id: 'alpha', entry: alphaEntry, permissions: ['demo.use'], allowed: true },
    { id: 'beta', entry: betaEntry, permissions: ['demo.use'], allowed: true },
  ], { timeoutMs: 500 })
  assert.deepEqual(loaded.loaded, ['alpha', 'beta'])
  const alphaScope = shared.scopes.find((scope) => scope.moduleId === 'alpha')
  const betaScope = shared.scopes.find((scope) => scope.moduleId === 'beta')
  assert.ok(alphaScope && betaScope, 'the service was bound once for each module')
  assert.notEqual(seen.alpha.terminal, shared, 'the shared object is not in the context')
  assert.equal(seen.alpha.terminal.forModule, undefined, 'a module cannot bind the service again')
  assert.deepEqual(Object.keys(seen.alpha.terminal).sort(), ['clear', 'create'], 'a module gets create and clear only')
  assert.equal(seen.alphaTerminal.moduleId, 'alpha')
  assert.equal(seen.betaTerminal.moduleId, 'beta')
  assert.equal(seen.alphaTerminal.options.theme.background, '#101010', 'the options pass through')
  assert.equal('terminal' in seen.alpha, true)
  assert.notEqual(seen.alpha.terminal, seen.beta.terminal)

  // 2. the existing keys the earlier tests assert are still present
  for (const key of ['tacticalWebSocket', 'jobs', 'services', 'codeEditor', 'confirm', 'api', 'apiRaw', 'apiBlob', 'apiText', 'contextActions']) {
    assert.ok(seen.alpha[key] !== undefined, `context.${key} is still present`)
  }
  assert.equal(typeof seen.alpha.confirm, 'function')
  assert.equal(typeof seen.alpha.tacticalWebSocket.open, 'function')
  assert.equal(typeof seen.alpha.jobs.follow, 'function', 'the module-bound jobs helper stays')
  assert.equal(typeof seen.alpha.services.provide, 'function')
  assert.equal(typeof seen.alpha.codeEditor.clear, 'function')

  // 3. unloading alpha disposes its terminal and leaves beta's
  assert.equal(moduleLoader.unloadUiModule(runtime, 'alpha'), true)
  assert.equal(alphaScope.cleared, 1)
  assert.equal(seen.alphaTerminal.disposed, true)
  assert.equal(betaScope.cleared, 0, "another module's terminals survive the first module's unload")
  assert.equal(seen.betaTerminal.disposed, false)
}

// 4. a register() that fails gets its terminals cleared
{
  const runtime = baseRuntime()
  const before = shared.scopes.length
  const result = await moduleLoader.loadUiModules(runtime, [
    { id: 'failer', entry: failEntry, permissions: ['demo.use'], allowed: true },
  ], { timeoutMs: 500 })
  assert.deepEqual(result.loaded, [])
  assert.equal(result.failed[0].id, 'failer')
  const scope = shared.scopes.slice(before).find((item) => item.moduleId === 'failer')
  assert.equal(scope.cleared, 1, 'the failed module is cleared once')
  assert.equal(scope.created[0].disposed, true, 'its terminal is disposed')
}

// 5. a register() that times out gets its terminals cleared at once, and a create() after that is refused
{
  const runtime = baseRuntime()
  const before = shared.scopes.length
  const result = await moduleLoader.loadUiModules(runtime, [
    { id: 'slow', entry: slowEntry, permissions: ['demo.use'], allowed: true },
  ], { timeoutMs: 50 })
  assert.equal(result.failed[0].id, 'slow')
  assert.equal(result.failed[0].timedOut, true)
  const scope = shared.scopes.slice(before).find((item) => item.moduleId === 'slow')
  assert.equal(scope.created[0].disposed, true, 'the timed-out terminal is disposed')
  await new Promise((resolve) => setTimeout(resolve, 450))
  assert.equal(scope.created.length, 1, 'the late create() did not add a terminal after the timeout')
}

// 6. a runtime without the terminal service still loads modules, and their terminal is undefined
{
  const runtime = baseRuntime()
  delete runtime.terminal
  const probe = entry('export default { register(ctx) { globalThis.__seen.probe = ctx } }')
  const bare = await moduleLoader.loadUiModules(runtime, [
    { id: 'probe', entry: probe, permissions: ['demo.use'], allowed: true },
  ], { timeoutMs: 500 })
  assert.deepEqual(bare.loaded, ['probe'])
  assert.deepEqual(bare.failed, [])
  assert.equal(seen.probe.terminal, undefined, 'terminal is undefined without the service')
}

// 7. a module that does not use the widget loads with the bound scope and nothing else
{
  const runtime = baseRuntime()
  const plain = entry('export default { register(ctx) { globalThis.__seen.plain = ctx } }')
  const result = await moduleLoader.loadUiModules(runtime, [
    { id: 'plain', entry: plain, permissions: ['demo.use'], allowed: true },
  ], { timeoutMs: 500 })
  assert.deepEqual(result.loaded, ['plain'])
  assert.notEqual(seen.plain.terminal, shared, 'the shared service is not in the context')
  assert.equal(typeof seen.plain.terminal.create, 'function')
}

// 8. registerPublic gets no terminal
{
  const runtime = baseRuntime()
  runtime.ssoProviders = { forModule: () => ({ clear() {}, register() {} }) }
  runtime.publicApi = {}
  const result = await moduleLoader.loadPublicUiModules(runtime, [
    { id: 'publicdemo', public: { entry: publicEntry, base_path: '/public/publicdemo' } },
  ], { timeoutMs: 500 })
  assert.deepEqual(result.loaded, ['publicdemo'])
  assert.equal(seen.publicKeys.includes('terminal'), false, 'the public context has no terminal')
}

// 9. the source: main.js creates the service once and passes it on; the loader strips the shared object from the spread
{
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(main, /import \{ createTerminalService \} from '\.\/terminal-widget'/)
  assert.match(main, /const terminal = createTerminalService\(\)/)
  assert.match(main, /      jobs,\n      terminal,\n      isSignedOut,/)
  const source = fs.readFileSync(new URL('../src/module-loader.js', import.meta.url), 'utf8')
  assert.match(source, /terminal: _sharedTerminal, isSignedOut: _signedOutProbe/)
  assert.match(source, /moduleTerminalWidgets = guardAbandoned\(runtime\.terminal\?\.forModule\?\.\(descriptor\.id, \{ isAbandoned \}\) \|\| null, isAbandoned, descriptor\.id\)/)
  assert.match(source, /\.\.\.\(moduleTerminalWidgets \? \{ terminal: moduleTerminalWidgets \} : \{\}\)/)
  assert.match(source, /try \{ moduleTerminalWidgets\?\.clear\?\.\(\) \} catch \{\}/)
  assert.doesNotMatch(source, /@xterm/, 'the loader never imports xterm')
}

console.log('terminal widget binding 0.12.104: PASS')
