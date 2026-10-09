// 0.12.89: the tacticalOperation binding cannot be bypassed through a replaced-id edit or the shared transport helpers.
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
const { loadUiModules, guardTacticalOperationPath } = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])

let calls = []
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) }
const shared = createTacticalOperation({ apiRaw })
const refused = (fn, pattern) => {
  try { fn() } catch (error) {
    assert.equal(error.status, 0)
    assert.equal(error.payload, null)
    assert.equal(error.code, null)
    if (pattern) assert.match(error.message, pattern)
    return
  }
  assert.fail('expected a refusal')
}
const refusedWith = async (promise, pattern) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, 0)
    assert.equal(error.payload, null)
    assert.equal(error.code, null)
    if (pattern) assert.match(error.message, pattern)
    return true
  })
}

// (1) the path guard, on its own
const base = '/api/tfd/tactical-operations/'
for (const own of ['checks/run/', 'checks']) guardTacticalOperationPath(base + own, 'checks', '')
guardTacticalOperationPath(base + 'patching/list/', 'patchmanagement', 'patching')
for (const path of [
  base + 'agents/list/',
  '/api/tfd/tactical-operations/%61gents/list/',
  '/api/tfd/tactical-operations/checks/../agents/list/',
  '/api/tfd/tactical-operations/checks/%2e%2e/agents/list/',
  '/api/tfd/tactical-operations/checks/%2E%2E%2Fagents/list/',
  '/api/tfd/tactical-operations%2Fagents/list/',
  '/api/tfd/tactical-operations/checks/%252e%252e/agents/list/',
  '/api/tfd/tactical-operations/%2561gents/list/',
  '/api/tfd/tactical-operations/AGENTS/list/',
  '/API/TFD/Tactical-Operations/Agents/list/',
  'api/tfd/tactical-operations/agents/list/',
  'https://rmm.example.test/api/tfd/tactical-operations/agents/list/',
  base + 'agents/list/?x=1',
  base + 'agents?a=/../',
  base + 'agents/list/#frag',
  '/api/tfd/tactical-operations\\agents/list/',
  '/api/tfd/modules/../tactical-operations/agents/list/',
  '/api/tfd/x%3f/../tactical-operations/agents/list/',
  '/api/tfd/tactical-operations/agents%/list/',
  '/api/tfd/tactic%61l-operations/agents/list/',
  '/api/tfd/tactical-operations/%zzagents/list/%',
]) refused(() => guardTacticalOperationPath(path, 'checks', ''), undefined)
refused(() => guardTacticalOperationPath(base + 'agents/x/', 'patchmanagement', 'patching'), /"patchmanagement" or "patching"/)
// A decode that never settles fails closed.
refused(() => guardTacticalOperationPath('/api/tfd/tactical-operations/%' + '25'.repeat(10) + '61gents/x/', 'checks', ''))
// Other paths are untouched.
for (const path of ['/api/tfd/agents/list/', '/api/tfd/modules/v2/', '/api/tfd/checks/tactical/', 'api/tfd/ui/context/', '', undefined, null, '/api/tfd/a%20b/']) {
  guardTacticalOperationPath(path, 'checks', '')
}

// (2) through loadUiModules: wrapped transport
function runtimeFixture(extra = {}) {
  const router = { currentRoute: { value: { path: '/', fullPath: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} }
  const seen = []
  const mk = (name) => async (...args) => { seen.push([name, ...args]); return `${name}:ok` }
  return {
    seen,
    state: { context: { permissions: [], user: {}, module_register_timeout_seconds: 30 }, contextSource: 'backend' },
    router, addNavigation() {}, removeNavigation() {},
    api: mk('api'), apiRaw: mk('apiRaw'), apiBlob: mk('apiBlob'), apiText: mk('apiText'),
    tacticalOperation: shared,
    ...extra,
  }
}
const got = {}
globalThis.__got = got
const good = (id, extra = {}) => ({ id, entry: entry(`export default { register(c) { globalThis.__got['${id}'] = c } }`), ...extra })

const rt = runtimeFixture({ state: { context: { permissions: [], user: {}, module_status: [{ id: 'pm', replaces: 'patching' }], module_register_timeout_seconds: 30 }, contextSource: 'backend' } })
await loadUiModules(rt, [good('pm'), good('checks'), good('agents')], { timeoutMs: 200 })
for (const name of ['api', 'apiRaw', 'apiBlob', 'apiText']) {
  rt.seen.length = 0
  const own = await got.checks[name](base + 'checks/run/', { method: 'POST' })
  assert.equal(own, `${name}:ok`)
  assert.deepEqual(rt.seen[0], [name, base + 'checks/run/', { method: 'POST' }])
  assert.equal(await got.pm[name](base + 'patching/list/'), `${name}:ok`)
  assert.equal(await got.pm[name](base + 'pm/list/'), `${name}:ok`)
  assert.equal(await got.checks[name]('/api/tfd/checks/list/'), `${name}:ok`)
  rt.seen.length = 0
  for (const path of [
    base + 'agents/x/', '/api/tfd/tactical-operations/%61gents/x/', base + '../tactical-operations/agents/x/',
    '/api/tfd/tactical-operations/%2e%2e/tactical-operations/agents/x/', '/api/tfd/tactical-operations%2Fagents/x/',
    '/api/tfd/tactical-operations/%2561gents/x/', '/api/tfd/tactical-operations/AGENTS/x/', 'api/tfd/tactical-operations/agents/x/',
    base + 'agents/x/?q=1',
  ]) await refusedWith(got.checks[name](path), /cannot run Tactical operations/)
  await refusedWith(got.pm[name](base + 'checks/x/'))
  assert.equal(rt.seen.length, 0, 'refused calls never reach the transport')
}

// The shared helper keeps the unwrapped apiRaw.
calls = []
await got.checks.tacticalOperation('checks', 'run-checks', { params: { agent_id: 'a' } })
assert.equal(calls.length, 1)
assert.equal(calls[0].url, 'https://rmm.example.test/api/tfd/tactical-operations/checks/run-checks/')
await refusedWith(got.checks.tacticalOperation('agents', 'x'))

// (3) the replaced id is a snapshot taken before any register() runs
const editor = { id: 'editor', entry: entry(`export default { register(c) {
  const rows = c.context.module_status
  rows.find((r) => r.id === 'victim').replaces = 'agents'
  globalThis.__victimDescriptor.replaces = 'agents'
  globalThis.__got.editor = c
} }`) }
const victimDescriptor = good('victim')
globalThis.__victimDescriptor = victimDescriptor
const rt3 = runtimeFixture({ state: { context: { permissions: [], user: {}, module_status: [{ id: 'editor' }, { id: 'victim' }, { id: 'late', replaces: 'patching' }], module_register_timeout_seconds: 30 }, contextSource: 'backend' } })
const late = good('late')
await loadUiModules(rt3, [editor, victimDescriptor, late], { timeoutMs: 200 })
calls = []
await refusedWith(got.victim.tacticalOperation('agents', 'x'), /"victim"/)
await got.victim.tacticalOperation('victim', 'x')
await refusedWith(got.victim.apiRaw(base + 'agents/x/'))
// A late edit before a later call stays refused, and the snapshot keeps the true id.
rt3.state.context.module_status.find((r) => r.id === 'late').replaces = 'agents'
late.replaces = 'agents'
await refusedWith(got.late.tacticalOperation('agents', 'x'))
await got.late.tacticalOperation('patching', 'x')
await refusedWith(got.late.apiRaw(base + 'agents/x/'))
rt3.state.context.module_status.find((r) => r.id === 'late').replaces = 7
await got.late.tacticalOperation('patching', 'x')

// (4) public modules are unchanged; the loader keeps no relative imports
const source = fs.readFileSync(new URL('../src/module-loader.js', import.meta.url), 'utf8')
assert.ok(!/^import .* from '\.\//m.test(source), 'module-loader.js must not gain relative imports')
assert.match(source, /replacedSnapshot/)
assert.ok(!/replaces: \(\) =>/.test(source), 'the replaced id must not be read lazily')

// (5) docs say what the guard is, and what it is not
const doc = fs.readFileSync(new URL('../docs/module-runtime-api.md', import.meta.url), 'utf8')
assert.match(doc, /not a sandbox/)
assert.match(doc, /snapshot/)
assert.match(doc, /apiRaw.*apiBlob.*apiText|apiBlob.*apiText/s)
const notes = fs.readFileSync(new URL('../RELEASE_NOTES_0.12.89.md', import.meta.url), 'utf8')
assert.match(notes, /not a sandbox/)
assert.match(notes, /1\.17\.11/)
console.log('tactical-operation-binding-0.12.89: ok')
