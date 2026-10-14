// 0.12.106: module user preferences (Core 1.17.35). The helper is bound to the module id (no argument names a module), checks
// the name and the value before any request, sends exactly {value} on PUT, and refuses when signed out, abandoned or unloaded.
// The loader binds it to each module, refuses another module's /api/tfd/module-preferences/<id>/ path on every raw transport
// (encoded, dotted and backslash forms included), gives no replaced-module exception, and gives nothing to registerPublic.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { createModulePreferencesService } = await import(new URL('../src/module-preferences.js', import.meta.url).href)

// A fake api that records every call and answers from a small store, as Core does for the signed-in person.
function fakeApi(store = {}) {
  const calls = []
  const api = async (path, options = {}) => {
    calls.push({ path, method: options.method || 'GET', body: options.body })
    const m = /^\/api\/tfd\/module-preferences\/([^/]+)\/(?:([^/]+)\/)?$/.exec(path)
    if (!m) throw new Error(`unexpected path ${path}`)
    const name = m[2]
    if (options.method === 'PUT') {
      const value = JSON.parse(options.body).value
      store[name] = value
      return { module_id: m[1], name, value }
    }
    if (options.method === 'DELETE') {
      const existed = Object.prototype.hasOwnProperty.call(store, name)
      delete store[name]
      return { module_id: m[1], name, deleted: existed }
    }
    return { module_id: m[1], preferences: { ...store } }
  }
  return { api, calls }
}
const refused = async (promise, code) => {
  let error
  try { await promise } catch (err) { error = err }
  assert.ok(error, 'the call was refused')
  if (code) assert.equal(error.code, code, `code ${code}`)
  return error
}

// Own id only, exact paths, and the PUT body is exactly {value}.
{
  const store = {}
  const { api, calls } = fakeApi(store)
  const helper = createModulePreferencesService().forModule('endpoints', { api, isSignedOut: () => false, isAbandoned: () => false })
  assert.deepEqual(Object.keys(helper).sort(), ['clear', 'get', 'getAll', 'remove', 'set'], 'the helper has no id argument and no extra members')
  assert.equal(Object.isFrozen(helper), true)
  assert.equal(await helper.set('header-collapsed', true), true)
  assert.equal(calls.at(-1).path, '/api/tfd/module-preferences/endpoints/header-collapsed/')
  assert.equal(calls.at(-1).method, 'PUT')
  assert.deepEqual(JSON.parse(calls.at(-1).body), { value: true })
  assert.deepEqual(Object.keys(JSON.parse(calls.at(-1).body)), ['value'])
  assert.equal(await helper.get('header-collapsed', false), true)
  assert.equal(calls.at(-1).path, '/api/tfd/module-preferences/endpoints/')
  assert.equal(calls.at(-1).method, 'GET')
  assert.equal(await helper.get('missing', 'fallback'), 'fallback')
  assert.deepEqual(await helper.getAll(), { 'header-collapsed': true })
  assert.equal(await helper.remove('header-collapsed'), true)
  assert.equal(calls.at(-1).path, '/api/tfd/module-preferences/endpoints/header-collapsed/')
  assert.equal(calls.at(-1).method, 'DELETE')
  assert.equal(await helper.remove('header-collapsed'), false)
  // Nothing is cached: every read asks Core again.
  const before = calls.length
  await helper.getAll(); await helper.getAll()
  assert.equal(calls.length, before + 2)
  // getAll returns a new object each time.
  const copy = await helper.getAll()
  copy.injected = 1
  assert.equal('injected' in (await helper.getAll()), false)
}

// The name is checked before any request, for get, set and remove.
{
  const { api, calls } = fakeApi()
  const helper = createModulePreferencesService().forModule('endpoints', { api, isSignedOut: () => false, isAbandoned: () => false })
  const badNames = ['Bad', '', '-x', '.x', '_x', 'a'.repeat(65), 'a/b', '../x', 'x y', 'Ünï', 5, null, undefined, 'a?b']
  for (const bad of badNames) {
    await refused(helper.get(bad), 'invalid_name')
    await refused(helper.set(bad, 1), 'invalid_name')
    await refused(helper.remove(bad), 'invalid_name')
  }
  assert.equal(calls.length, 0, 'no request for a bad name')
  // The edges that are allowed.
  await helper.set('a', 1)
  await helper.set('a'.repeat(64), 1)
  await helper.set('0.x_y-z', 1)
  assert.equal(calls.length, 3)
}

// The value is checked before any request: plain JSON, at most 4 KiB as UTF-8, at most 5 levels deep.
{
  const { api, calls } = fakeApi()
  const helper = createModulePreferencesService().forModule('endpoints', { api, isSignedOut: () => false, isAbandoned: () => false })
  class Thing { constructor() { this.a = 1 } }
  const bad = [undefined, NaN, Infinity, -Infinity, () => 1, new Date(0), new Map(), new Set(), new Thing(), 1n, Symbol('x'), [undefined], { a: undefined }, [[[[[[1]]]]]], { a: { a: { a: { a: { a: { a: 1 } } } } } }, 'x'.repeat(4096), 'é'.repeat(2100)]
  for (const value of bad) await refused(helper.set('value', value), 'invalid_value')
  assert.equal(calls.length, 0, 'no request for a bad value')
  // The edges that are allowed: 5 levels, 4000 ASCII characters, 2000 two-byte characters (4000 bytes).
  await helper.set('value', [[[[[1]]]]])
  await helper.set('value', { a: { a: { a: { a: { a: 1 } } } } })
  await helper.set('value', 'x'.repeat(4000))
  await helper.set('value', 'é'.repeat(2000))
  await helper.set('value', null)
  await helper.set('value', [1, 'two', false, { three: 3 }])
  assert.equal(calls.length, 6)
}

// Signed out, abandoned and unloaded: refused, and no request leaves.
{
  const { api, calls } = fakeApi()
  let signedOut = true
  const signed = createModulePreferencesService().forModule('endpoints', { api, isSignedOut: () => signedOut, isAbandoned: () => false })
  const error = await refused(signed.get('x'), 'signed_out')
  assert.equal(error.status, 401)
  await refused(signed.set('x', 1), 'signed_out')
  await refused(signed.getAll(), 'signed_out')
  await refused(signed.remove('x'), 'signed_out')
  assert.equal(calls.length, 0)
  signedOut = false
  await signed.set('x', 1)
  assert.equal(calls.length, 1)

  let abandoned = false
  const gone = createModulePreferencesService().forModule('endpoints', { api, isSignedOut: () => false, isAbandoned: () => abandoned })
  await gone.get('x')
  abandoned = true
  await refused(gone.get('x'))
  await refused(gone.set('x', 1))
  assert.equal(calls.length, 2, 'no request after the module was abandoned')

  const unloaded = createModulePreferencesService().forModule('endpoints', { api, isSignedOut: () => false, isAbandoned: () => false })
  await unloaded.get('x')
  unloaded.clear()
  await refused(unloaded.get('x'))
  await refused(unloaded.remove('x'))
  assert.equal(calls.length, 3, 'no request after the module was unloaded')
}

// Core's refusal comes back as the usual error (status and code kept), and the helper adds nothing to it.
{
  const coreError = Object.assign(new Error('preference_limit'), { status: 400, code: 'preference_limit', payload: { detail: 'A module may keep at most 50 preference names for one person.', code: 'preference_limit' } })
  const helper = createModulePreferencesService().forModule('endpoints', { api: async () => { throw coreError }, isSignedOut: () => false, isAbandoned: () => false })
  const error = await refused(helper.set('x', 1))
  assert.equal(error, coreError)
}

// The loader: the helper is bound to each module, a raw path to another module is refused on every transport, and unloading
// clears the helper. A replacement has no exception.
{
  const store = {}
  const { api, calls } = fakeApi(store)
  const { createContextActionRegistry } = await import(new URL('../src/context-actions.js', import.meta.url).href)
  const dataModule = (path, replacements = []) => {
    let source = read(path)
    for (const [from, to] of replacements) source = source.replace(from, to)
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  }
  const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])
  let signedOut = false
  const runtime = {
    app: {},
    router: { currentRoute: { value: { path: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} },
    state: { context: { permissions: [], user: { superuser: true, id: 9 } }, contextSource: 'backend' },
    addNavigation() {},
    removeNavigation() {},
    api,
    apiRaw: api,
    apiBlob: api,
    apiText: api,
    contextActions: createContextActionRegistry({ hasPermission: () => true }),
    modulePreferences: createModulePreferencesService(),
    isSignedOut: () => signedOut,
  }
  globalThis.__mpCtx = {}
  const remoteEntry = entry(`export default { async register(ctx) { globalThis.__mpCtx.remote = ctx } }`)
  const loaded = await loader.loadUiModules(runtime, [{ id: 'remote', entry: remoteEntry, permissions: [], allowed: true, replaces: 'old-module' }], { timeoutMs: 500 })
  assert.deepEqual(loaded.loaded, ['remote'])
  const ctx = globalThis.__mpCtx.remote
  assert.ok(ctx.modulePreferences, 'the module gets modulePreferences')
  assert.equal(await ctx.modulePreferences.set('header-collapsed', true), true)
  assert.equal(calls.at(-1).path, '/api/tfd/module-preferences/remote/header-collapsed/')

  // Another module's id is refused on every raw transport, in the forms a module could try, before any request.
  const before = calls.length
  const otherPaths = [
    '/api/tfd/module-preferences/other/',
    '/api/tfd/module-preferences/other/header-collapsed/',
    '/api/tfd/module-preferences/Other/',
    '/api/tfd/module-preferences/%6Fther/',
    '/api/tfd/module-preferences/%252Fother/',
    '/api/tfd/module-preferences/./other/',
    '/api/tfd/module-preferences/x/../other/',
    '\\api\\tfd\\module-preferences\\other\\',
    '/api/tfd/module-preferences/other;x/',
    '/api/tfd/module-preferences/​other/',
    'https://core.example/api/tfd/module-preferences/other/?x=1',
  ]
  for (const path of otherPaths) {
    for (const transport of ['api', 'apiRaw', 'apiBlob', 'apiText']) {
      await refused(ctx[transport](path), null)
    }
  }
  assert.equal(calls.length, before, `no request for another module (${calls.length - before} made)`)
  // The module's own id goes through on each transport.
  await ctx.api('/api/tfd/module-preferences/remote/')
  assert.equal(calls.at(-1).path, '/api/tfd/module-preferences/remote/')
  // A replaced module (old-module) has no exception: its preferences stay its own.
  await refused(ctx.api('/api/tfd/module-preferences/old-module/'), null)

  // Signed out: the loader refuses the raw path first, and the helper refuses as well.
  signedOut = true
  await refused(ctx.modulePreferences.get('x'), 'signed_out')
  await refused(ctx.api('/api/tfd/module-preferences/remote/'), 'signed_out')
  signedOut = false

  // Unloading the module clears the helper: its calls are refused and nothing else changes.
  const callsBeforeUnload = calls.length
  assert.equal(loader.unloadUiModule(runtime, 'remote'), true)
  await refused(ctx.modulePreferences.get('header-collapsed'))
  await refused(ctx.modulePreferences.set('header-collapsed', false))
  assert.equal(calls.length, callsBeforeUnload, 'no call after unload')

  // A module that is loaded but abandoned (register() timed out) refuses too. Its register() never finishes here.
  const slowEntry = entry(`export default { register(ctx) { return new Promise(() => { globalThis.__mpCtx.slow = ctx }) } }`)
  const late = await loader.loadUiModules(runtime, [{ id: 'slow', entry: slowEntry, permissions: [], allowed: true }], { timeoutMs: 50 })
  assert.equal(late.failed.length, 1, 'the slow module is abandoned')
  await refused(globalThis.__mpCtx.slow.modulePreferences.get('x'))
}

// The raw guard, direct: refuses another module's id, allows the module's own, and allows no replacement exception.
{
  const { guardTacticalOperationPath } = await import(`data:text/javascript;base64,${Buffer.from(read('../src/module-loader.js').replace("import * as Vue from 'vue'", 'const Vue = {}')).toString('base64')}`)
  assert.throws(() => guardTacticalOperationPath('/api/tfd/module-preferences/other/', 'remote'), /cannot read or change preferences for "other"/)
  assert.throws(() => guardTacticalOperationPath('/api/tfd/module-preferences/old-module/', 'remote', 'old-module'), /old-module/)
  assert.doesNotThrow(() => guardTacticalOperationPath('/api/tfd/module-preferences/remote/x/', 'remote', 'old-module'))
  assert.doesNotThrow(() => guardTacticalOperationPath('/api/tfd/module-preferences/remote/', 'remote'))
  // The existing rules are unchanged: a replacement may run its replaced module's Tactical operations and open its terminals.
  assert.doesNotThrow(() => guardTacticalOperationPath('/api/tfd/tactical-operations/old-module/run/', 'remote', 'old-module'))
  assert.doesNotThrow(() => guardTacticalOperationPath('/api/tfd/tactical-websocket/remote/agent-terminal/tickets/', 'remote'))
  assert.throws(() => guardTacticalOperationPath('/api/tfd/tactical-operations/other/run/', 'remote', 'old-module'), /cannot run Tactical operations for "other"/)
  assert.throws(() => guardTacticalOperationPath('/api/tfd/tactical-websocket/other/agent-terminal/tickets/', 'remote'), /cannot open Tactical terminals for "other"/)
  assert.doesNotThrow(() => guardTacticalOperationPath('/api/tfd/account/tactical-ui/', 'remote'))
  assert.doesNotThrow(() => guardTacticalOperationPath('https://core.example/api/tfd/module-preferences/remote/', 'remote'))
}

// registerPublic gets no helper: the public loader builds its own runtime and never names modulePreferences.
{
  const loaderSource = read('../src/module-loader.js')
  const publicStart = loaderSource.indexOf('export async function loadPublicUiModules')
  const publicEnd = loaderSource.indexOf('export async function loadUiModules')
  assert.ok(publicStart > 0 && publicEnd > publicStart, 'the public loader is found')
  assert.doesNotMatch(loaderSource.slice(publicStart, publicEnd), /modulePreferences/)
}

console.log('module-preferences-0.12.106: PASS')
