// 0.12.102: a module switched off while the page is open is unloaded at once. Its services stop answering, its context actions
// and its terminal sessions go, and another module's services stay. Unloading twice, or an unknown id, is harmless. ModulesView
// calls the unload after a succeeded disable or uninstall job, and for a replacement a job switched off, before the reload.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { moduleManagerSource } from './helpers/module-manager-source.mjs'

const { createModuleServiceRegistry } = await import(new URL('../src/module-services.js', import.meta.url).href)
const { createContextActionRegistry } = await import(new URL('../src/context-actions.js', import.meta.url).href)
const { createTacticalWebSocket } = await import(new URL('../src/tactical-websocket.js', import.meta.url).href)

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

// A fake WebSocket and api, as in tactical-websocket-0.12.102.mjs.
class FakeSocket {
  static instances = []
  constructor(url) { this.url = url; this.sent = []; this.closedWith = null; this.listeners = { open: [], message: [], close: [] }; FakeSocket.instances.push(this) }
  addEventListener(type, fn) { this.listeners[type].push(fn) }
  send(text) { this.sent.push(JSON.parse(text)) }
  close(code) { this.closedWith = code === undefined ? null : code }
  serverOpen() { for (const fn of this.listeners.open) fn({}) }
}
const ticket = 'u'.repeat(43)
const api = async () => ({ ticket, path: `/ws/tfd/agent-terminal/${ticket}/`, session_id: 'session-u', expires_in: 30, kind: 'agent-terminal' })

const granted = new Set(['provider.use', 'checks.use'])
const services = createModuleServiceRegistry({ hasPermission: (code) => granted.has(code), hasTacticalPermission: () => true, isTrustedContext: () => true })
const contextActions = createContextActionRegistry({ hasPermission: () => true, confirm: async () => true })
const tacticalWebSocket = createTacticalWebSocket({ api, wsBase: 'https://tactical.example.test', WebSocketImpl: FakeSocket })
const runtime = {
  app: {},
  router: { currentRoute: { value: { path: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} },
  state: { context: { permissions: ['provider.use', 'checks.use'], user: { superuser: true, id: 9 } }, contextSource: 'backend' },
  addNavigation() {},
  removeNavigation() {},
  api,
  apiRaw: api,
  services,
  contextActions,
  tacticalWebSocket,
}

const providerEntry = entry(`
export default { register(ctx) {
  ctx.services.provide('provider.echo', async (args) => ({ echoed: args }), { label: 'Echo' })
  ctx.contextActions.register({ id: 'provider.act', resource: 'client', label: 'Act', placements: ['client.context-menu'] }, async () => 'acted')
  globalThis.__providerTerminal = ctx.tacticalWebSocket.open('provider', 'agent-terminal', { agentId: 'agent-1' })
} }`)
const checksEntry = entry(`
export default { register(ctx) {
  ctx.services.provide('checks.run', async () => 'checks-ran', { label: 'Run checks' })
} }`)

const loaded = await loader.loadUiModules(runtime, [
  { id: 'provider', entry: providerEntry, permissions: ['provider.use'], allowed: true },
  { id: 'checks', entry: checksEntry, permissions: ['checks.use'], allowed: true },
], { timeoutMs: 500 })
assert.deepEqual(loaded.loaded, ['provider', 'checks'])

// the provider's terminal connects; the test lets the fake server accept it
await tick()
FakeSocket.instances[0].serverOpen()
const terminal = await globalThis.__providerTerminal
assert.equal(terminal.status, 'open')

// before unload: everything is there
const checks = services.forModule('checks', { permissions: ['checks.use'] })
assert.equal(checks.has('provider.echo'), true)
assert.equal(checks.has('checks.run'), true)
assert.equal(contextActions.list({ resource: 'client' }).some((action) => action.id === 'provider.act'), true)

// (1) unload the provider: its services stop answering, its context action goes, its terminal is closed, and checks stays
assert.equal(loader.unloadUiModule(runtime, 'provider'), true)
assert.equal(checks.has('provider.echo'), false, 'the service is gone')
assert.deepEqual(checks.list().map((item) => item.name), ['checks.run'], 'only the other module’s services are listed')
await assert.rejects(checks.call('provider.echo', {}), (error) => error.code === 'service_unavailable')
assert.equal(contextActions.list({ resource: 'client' }).some((action) => action.id === 'provider.act'), false, 'the context action is gone')
assert.equal(terminal.status, 'closed', 'the terminal the module opened is closed')
assert.equal(FakeSocket.instances[0].closedWith, 1000)
assert.equal(checks.has('checks.run'), true, 'another module’s services stay')
assert.equal(await checks.call('checks.run'), 'checks-ran')

// (2) unloading twice, an unknown id and a missing id are harmless
assert.equal(loader.unloadUiModule(runtime, 'provider'), false, 'the second unload does nothing')
assert.equal(loader.unloadUiModule(runtime, 'nobody'), false)
assert.equal(loader.unloadUiModule(runtime, ''), false)
assert.equal(loader.unloadUiModule(runtime, undefined), false)
assert.equal(loader.unloadUiModule(null, 'checks'), false)
assert.equal(checks.has('checks.run'), true, 'an unknown id leaves the others alone')

// (3) unloading the other module removes its service and nothing of the first
assert.equal(loader.unloadUiModule(runtime, 'checks'), true)
assert.equal(checks.has('checks.run'), false)

// (4) a module that is not loaded yet is unknown to the unload; it can still be loaded afterwards
const late = await loader.loadUiModules(runtime, [
  { id: 'checks', entry: checksEntry, permissions: ['checks.use'], allowed: true },
], { timeoutMs: 500 })
assert.deepEqual(late.loaded, ['checks'])
assert.equal(checks.has('checks.run'), true, 'a reloaded module provides again')

// (5) the shared registries' removeProvider is also called: a service left by a provider that was never bound to the loader
granted.add('stray.use')
services.forModule('stray', { permissions: ['stray.use'] }).provide('stray.run', () => 'stray')
assert.equal(checks.has('stray.run'), true)
loader.unloadUiModule(runtime, 'stray')
assert.equal(checks.has('stray.run'), false, 'the unload removes the services of that module id')

// (6) the source: the shell provides the unload, and ModulesView calls it on a succeeded disable or uninstall job
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
assert.match(main, /app\.provide\('tecTacModuleUnload', \(moduleId\) => unloadUiModule\(loaderRuntime, moduleId\)\)/)
assert.match(main, /tacticalWebSocket,\n      modules,/)
const view = moduleManagerSource()
assert.match(view, /const unloadModule = inject\('tecTacModuleUnload', null\)/)
assert.match(view, /if \(\(job\.action === 'disable' \|\| job\.action === 'remove'\) && typeof job\.plugin_id === 'string'/)
assert.match(view, /for \(const id of Array\.isArray\(job\.disabled_modules\) \? job\.disabled_modules : \[\]\)/)
const succeeded = view.indexOf("if (activeJob.value.status === 'succeeded') {")
const unloadCall = view.indexOf('unloadSwitchedModules(activeJob.value)', succeeded)
const reloadCall = view.indexOf('scheduleReload()', succeeded)
assert.ok(succeeded > 0 && unloadCall > succeeded, 'the unload runs on a succeeded job')
assert.ok(unloadCall < reloadCall, 'the unload runs before the reload countdown starts')
assert.doesNotMatch(view.slice(view.indexOf('function unloadSwitchedModules'), view.indexOf('function beginPoll')), /failed|dispatch_failed/)

console.log('module unload 0.12.102: PASS')
