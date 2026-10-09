// 0.12.88: context.tacticalOperation is bound to the module that receives it.
import assert from 'node:assert/strict'
import fs from 'node:fs'

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`

globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'abc123' : null), setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const { apiRaw } = await import('../src/api.js')
const { createTacticalOperation } = await import('../src/tactical-operations.js')
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])
const { bindTacticalOperation, loadUiModules, loadPublicUiModules } = loader

let calls = []
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) }
const shared = createTacticalOperation({ apiRaw })
const refusedWith = async (promise, pattern) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, 0)
    assert.equal(error.payload, null)
    assert.equal(error.code, null)
    if (pattern) assert.match(error.message, pattern)
    return true
  })
}

// (1) own id only
let bound = bindTacticalOperation(shared, { moduleId: 'checks', isAbandoned: () => false })
await bound('checks', 'run-checks', { params: { agent_id: 'a' } })
assert.equal(calls.length, 1)
assert.equal(calls[0].url, 'https://rmm.example.test/api/tfd/tactical-operations/checks/run-checks/')
calls = []
await refusedWith(bound('agents', 'list', {}), /"checks"/)
await refusedWith(bound('..', 'list', {}))
await refusedWith(bound('a/b', 'list', {}))
await refusedWith(bound('checks', 'a/b', {}))
await refusedWith(bound('checks', 'run', { params: { x: {} } }))
assert.equal(calls.length, 0)
// Validation order: syntax, then scope, then params.
await refusedWith(bound('agents', 'run', { params: { x: {} } }), /cannot run Tactical operations/)
await refusedWith(bound('..', 'run', { params: { x: {} } }), /module id/)

// (2) the AD-20 replaced module
bound = bindTacticalOperation(shared, { moduleId: 'patchmanagement', replaces: 'patching', isAbandoned: () => false })
await bound('patching', 'list-updates')
await bound('patchmanagement', 'list-updates')
assert.equal(calls.length, 2)
calls = []
await refusedWith(bound('checks', 'x'), /patchmanagement.*patching/)
for (const replaces of [undefined, null, '', 5, {}, ['patching']]) {
  const b = bindTacticalOperation(shared, { moduleId: 'm', replaces, isAbandoned: () => false })
  await b('m', 'x')
  await refusedWith(b('patching', 'x'))
}
assert.equal(calls.length, 6)
calls = []

// (3) abandoned
let gone = false
bound = bindTacticalOperation(shared, { moduleId: 'checks', isAbandoned: () => gone })
await bound('checks', 'x')
gone = true
calls = []
await assert.rejects(bound('checks', 'x'), /module checks was abandoned after a failed or timed-out register\(\); tacticalOperation\(\) is refused/)
assert.equal(calls.length, 0)

// (4) through loadUiModules
function runtimeFixture(extra = {}) {
  const router = { currentRoute: { value: { path: '/', fullPath: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} }
  return {
    state: { context: { permissions: [], user: {}, module_register_timeout_seconds: 30 }, contextSource: 'backend' },
    router, addNavigation() {}, removeNavigation() {},
    api: async () => {}, apiRaw: async () => {}, apiBlob: async () => {}, apiText: async () => {},
    tacticalOperation: shared,
    ...extra,
  }
}
const got = {}
globalThis.__got = got
const good = (id) => ({ id, entry: entry(`export default { register(c) { globalThis.__got['${id}'] = c.tacticalOperation } }`) })
const throws = { id: 'bad', entry: entry(`export default { register(c) { globalThis.__got.bad = c.tacticalOperation; throw new Error('boom') } }`) }
const hangs = { id: 'slow', entry: entry(`export default { register(c) { globalThis.__got.slow = c.tacticalOperation; return new Promise(() => {}) } }`) }
const result = await loadUiModules(runtimeFixture(), [good('a'), good('b'), throws, hangs, good('c')], { timeoutMs: 80 })
assert.deepEqual([...result.loaded].sort(), ['a', 'b', 'c'])
assert.equal(result.failed.length, 2)
calls = []
await refusedWith(got.a('b', 'x'), /"a".*"b"/)
await got.a('a', 'x')
await got.b('b', 'x')
await got.c('c', 'x')
assert.equal(calls.length, 3)
calls = []
await assert.rejects(got.bad('bad', 'x'), /abandoned.*tacticalOperation\(\) is refused/)
await assert.rejects(got.slow('slow', 'x'), /abandoned.*tacticalOperation\(\) is refused/)
assert.equal(calls.length, 0)

// Public modules get none.
const pubEntry = entry('export default { registerPublic(c) { globalThis.__got.pub = Object.keys(c) } }')
const publicResult = await loadPublicUiModules(runtimeFixture({ app: {}, publicApi: {} }), [{ id: 'pub', public: { entry: pubEntry, base_path: '/public/pub' } }])
assert.deepEqual(publicResult.loaded, ['pub'])
assert.ok(Array.isArray(got.pub) && !got.pub.includes('tacticalOperation'))

// A runtime with no tacticalOperation leaves the key out.
const noHelper = runtimeFixture()
delete noHelper.tacticalOperation
await loadUiModules(noHelper, [{ id: 'keys', entry: entry("export default { register(c) { globalThis.__got.keys = 'tacticalOperation' in c } }") }])
assert.equal(got.keys, false)

// (5) replaces from module_status; the descriptor wins; a bad value fails closed.
const withStatus = (rows) => runtimeFixture({ state: { context: { permissions: [], user: {}, module_status: rows, module_register_timeout_seconds: 30 }, contextSource: 'backend' } })
await loadUiModules(withStatus([{ id: 'pm', replaces: 'patching' }, { id: 'weird', replaces: 7 }]), [good('pm'), good('weird'), { ...good('dm'), replaces: 'agents' }])
calls = []
await got.pm('patching', 'x')
await refusedWith(got.pm('agents', 'x'))
await refusedWith(got.weird('patching', 'x'))
await got.dm('agents', 'x')
assert.equal(calls.length, 2)

// (6) docs and loader shape
const doc = fs.readFileSync(new URL('../docs/module-runtime-api.md', import.meta.url), 'utf8')
assert.ok(!doc.includes('checks that your module owns the operation'))
assert.match(doc, /binds the helper to the calling module/)
assert.match(doc, /AD-20/)
assert.match(doc, /patchmanagement/)
const loaderSource = fs.readFileSync(new URL('../src/module-loader.js', import.meta.url), 'utf8')
assert.ok(!/^import .* from '\.\//m.test(loaderSource), 'module-loader.js must not gain relative imports')
console.log('tactical-operation-scope-0.12.88: ok')
