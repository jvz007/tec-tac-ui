// 0.12.101: the browser service registry between modules. Names must belong to the provider; a permission denied hides the
// service and refuses a call (AD-12); tactical flags are strict; the caller id is bound by the loader and cannot be spoofed;
// a failed, timed-out or abandoned module leaves no service behind; a register() context built without services still works.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { createModuleServiceRegistry } = await import(new URL('../src/module-services.js', import.meta.url).href)

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])

// (1) provide, has, call and list through one registry with a fake permission model
const granted = new Set(['scriptexecution.view'])
const flags = {}
const hasPermission = (code) => granted.has(code)
// The shell returns the flag's value as stored; the registry must still demand a strict boolean true.
const hasTacticalPermission = (flag) => flags[flag]
const registry = createModuleServiceRegistry({ hasPermission, hasTacticalPermission })
const provider = registry.forModule('scriptexecution', { permissions: ['scriptexecution.view'] })
const consumer = registry.forModule('checks', { permissions: [] })

const seen = []
const removeRun = provider.provide('scriptexecution.run', async (args, { caller }) => {
  seen.push({ args, caller })
  return { ran: args.script }
}, { label: 'Run script' })
assert.equal(consumer.has('scriptexecution.run'), true)
assert.deepEqual(consumer.list(), [{ name: 'scriptexecution.run', label: 'Run script', provider: 'scriptexecution' }])
assert.deepEqual(await consumer.call('scriptexecution.run', { script: 'disk' }), { ran: 'disk' })
assert.equal(seen[0].caller, 'checks', 'the handler is told the calling module')
// the caller cannot be spoofed by a value in args
await consumer.call('scriptexecution.run', { script: 'x', caller: 'evil-module' })
assert.equal(seen[1].caller, 'checks', 'an argument named caller does not change the caller')
// the provider calling its own service is told its own id
await provider.call('scriptexecution.run', { script: 'self' })
assert.equal(seen[2].caller, 'scriptexecution')
assert.equal(consumer.has('scriptexecution.missing'), false)
await assert.rejects(consumer.call('scriptexecution.missing', {}), (error) => error.code === 'service_unavailable')

// (2) name rules: the provider's own prefix, a real name, and a handler
assert.throws(() => provider.provide('checks.run', () => {}), /must begin with scriptexecution\./)
assert.throws(() => provider.provide('scriptexecution.', () => {}), /must begin with scriptexecution\./)
assert.throws(() => provider.provide('scriptexecution.bad name', () => {}), /may use letters, digits/)
assert.throws(() => provider.provide('scriptexecution.run', 'not a function'), /requires a handler function/)

// (3) a name taken by another module is refused (module ids with dots can share a prefix)
const demo = registry.forModule('demo')
const demoSub = registry.forModule('demo.sub')
demo.provide('demo.sub.run', () => 'first')
assert.throws(() => demoSub.provide('demo.sub.run', () => 'second'), /already provided by demo/)
assert.equal(await consumer.call('demo.sub.run'), 'first', 'the first provider keeps the name')

// (4) permissions: a service the person may not use is hidden and refused; the module's own permission always applies
provider.provide('scriptexecution.secret', () => 'classified', { permission: 'scriptexecution.admin' })
assert.equal(consumer.has('scriptexecution.secret'), false, 'hidden without the permission')
assert.equal(consumer.list().some((item) => item.name === 'scriptexecution.secret'), false)
await assert.rejects(consumer.call('scriptexecution.secret'), (error) => error.code === 'service_denied' && error.provider === 'scriptexecution')
granted.add('scriptexecution.admin')
assert.equal(consumer.has('scriptexecution.secret'), true, 'shown again once the person may use it')
assert.equal(await consumer.call('scriptexecution.secret'), 'classified')
// a provider's explicit permission cannot widen past the module's own permission
provider.provide('scriptexecution.open', () => 'open', { permissions: [] })
granted.delete('scriptexecution.view')
assert.equal(consumer.has('scriptexecution.open'), false, 'the module permission still applies')
assert.equal(consumer.has('scriptexecution.run'), false)
granted.add('scriptexecution.view')

// (5) tactical flags are strict: only the boolean true counts
flags.can_run_scripts = 'true'
provider.provide('scriptexecution.tactical', () => 'ran', { tacticalPermission: 'can_run_scripts' })
assert.equal(consumer.has('scriptexecution.tactical'), false, 'a string "true" is not true')
flags.can_run_scripts = 1
assert.equal(consumer.has('scriptexecution.tactical'), false, 'a number 1 is not true')
flags.can_run_scripts = true
assert.equal(consumer.has('scriptexecution.tactical'), true, 'the strict boolean true shows the service')
flags.can_run_scripts = false
await assert.rejects(consumer.call('scriptexecution.tactical'), (error) => error.code === 'service_denied')
flags.can_run_scripts = true

// (6) a handler error carries the provider id and the service name
provider.provide('scriptexecution.fail', async () => { throw new Error('disk full') })
await assert.rejects(consumer.call('scriptexecution.fail'), (error) => (
  error.provider === 'scriptexecution'
  && error.service === 'scriptexecution.fail'
  && error.message === 'Service scriptexecution.fail from scriptexecution failed: disk full'
  && error.cause?.message === 'disk full'
))

// (7) the returned remover, clear and removeProvider each take the service away, and only what the module owns
removeRun()
assert.equal(consumer.has('scriptexecution.run'), false, 'the remover removes it')
provider.clear()
assert.equal(consumer.has('scriptexecution.fail'), false, 'clear removes what the module provides')
assert.equal(consumer.has('demo.sub.run'), true, 'clear does not touch another module')
registry.removeProvider('demo')
assert.equal(consumer.has('demo.sub.run'), false, 'removeProvider removes that module only')
assert.deepEqual(consumer.list(), [], 'the list is empty after the clears')

// (8) the loader binds services per module: the caller is the module's own id, a failed or abandoned module leaves nothing
const loaderRegistry = createModuleServiceRegistry({ hasPermission: () => true, hasTacticalPermission: () => true })
const runtime = {
  app: {},
  router: { currentRoute: { value: { path: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} },
  state: { context: { permissions: [], user: { superuser: true, id: 9 } }, contextSource: 'backend' },
  addNavigation() {},
  removeNavigation() {},
  services: loaderRegistry,
}

const providerEntry = entry(`
export default { register(ctx) {
  ctx.services.provide('provider.echo', async (args, { caller }) => ({ args, caller }), { label: 'Echo' })
  ctx.services.provide('provider.boom', async () => { throw new Error('boom') })
} }`)
const consumerEntry = entry(`
export default { register(ctx) { globalThis.__checksServices = ctx.services } }`)
const failingEntry = entry(`
export default { async register(ctx) {
  ctx.services.provide('flaky.run', () => 1)
  throw new Error('register broke')
} }`)
const slowEntry = entry(`
export default { async register(ctx) {
  ctx.services.provide('slow.run', () => 1)
  await new Promise((resolve) => setTimeout(resolve, 120))
  try { ctx.services.provide('slow.late', () => 2) } catch (error) { globalThis.__slowProvideError = error.message }
  try { ctx.services.call('provider.echo', {}) } catch (error) { globalThis.__slowCallError = error.message }
} }`)
const plainEntry = entry(`
export default { register(ctx) { globalThis.__plainServices = ctx.services } }`)

const first = await loader.loadUiModules(runtime, [
  { id: 'provider', entry: providerEntry, permissions: [], allowed: true },
  { id: 'checks', entry: consumerEntry, permissions: [], allowed: true },
], { timeoutMs: 500 })
assert.deepEqual(first.loaded, ['provider', 'checks'])
const checks = globalThis.__checksServices
assert.equal(typeof checks.provide, 'function')
assert.equal(typeof checks.forModule, 'undefined', 'the shared registry is not handed to a module')
const echoed = await checks.call('provider.echo', { value: 1 })
assert.deepEqual(echoed, { args: { value: 1 }, caller: 'checks' }, 'the loader binds the caller to the module that calls')
await assert.rejects(checks.call('provider.boom'), (error) => error.provider === 'provider' && error.service === 'provider.boom')

const failed = await loader.loadUiModules(runtime, [{ id: 'flaky', entry: failingEntry, permissions: [], allowed: true }], { timeoutMs: 500 })
assert.equal(failed.failed[0]?.id, 'flaky')
assert.equal(checks.has('flaky.run'), false, 'a module whose register() failed leaves no service')

const timedOut = await loader.loadUiModules(runtime, [{ id: 'slow', entry: slowEntry, permissions: [], allowed: true }], { timeoutMs: 50 })
assert.equal(timedOut.failed[0]?.timedOut, true)
assert.equal(checks.has('slow.run'), false, 'a timed-out module leaves no service')
await new Promise((resolve) => setTimeout(resolve, 200))
assert.match(globalThis.__slowProvideError, /abandoned/, 'an abandoned module cannot provide later')
assert.match(globalThis.__slowCallError, /abandoned/, 'an abandoned module cannot call later')
assert.equal(checks.has('slow.late'), false)

// a runtime without services (a context built before this release) still loads a module, which gets a null services
const plain = await loader.loadUiModules({ ...runtime, services: undefined }, [{ id: 'plain', entry: plainEntry, permissions: [], allowed: true }], { timeoutMs: 500 })
assert.deepEqual(plain.loaded, ['plain'])
assert.equal(globalThis.__plainServices, null)

// (9) the loader source: bound per module, cleaned up on failure, never the shared registry
const loaderSource = fs.readFileSync(new URL('../src/module-loader.js', import.meta.url), 'utf8')
assert.match(loaderSource, /moduleServices = guardAbandoned\(runtime\.services\?\.forModule\(descriptor\.id, \{ permissions: descriptor\.permissions \|\| \[\] \}\) \|\| null, isAbandoned, descriptor\.id\)/)
assert.match(loaderSource, /try \{ moduleServices\?\.clear\?\.\(\) \} catch \{\}/)
assert.match(loaderSource, /services: _sharedServices, \.\.\.moduleRuntime/)
assert.match(loaderSource, /        services: moduleServices,\n      \}\)/)

// (10) the shell creates the registry with the same permission and flag checks as the rest of the shell
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
assert.match(main, /const moduleServices = createModuleServiceRegistry\(\{ hasPermission, hasTacticalPermission \}\)/)
assert.match(main, /services: moduleServices,/)

const doc = fs.readFileSync(new URL('../docs/module-services.md', import.meta.url), 'utf8')
assert.match(doc, /services\.provide\(/)
assert.match(doc, /service_denied/)
assert.match(doc, /service_unavailable/)
assert.match(doc, /caller/)

console.log('module services 0.12.101: ok')
