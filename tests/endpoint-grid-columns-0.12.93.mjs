// 0.12.93: grid columns pushed by their owners at endpoint.grid-columns, and the Endpoints placement docs.
import assert from 'node:assert/strict'
import fs from 'node:fs'

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const { createResourceViewRegistry } = await dataModule('../src/resource-views.js', [["import { reactive } from 'vue'", 'const reactive = (value) => value\n']])
const { guardAbandoned } = await dataModule('../src/module-loader.js', [
  ["import * as Vue from 'vue'", 'const Vue = {}'],
  ['function guardAbandoned(', 'export function guardAbandoned('],
])

const GRID = 'endpoint.grid-columns'
let granted = new Set()
let superuser = false
let limitSeconds = 0.05
const make = () => createResourceViewRegistry({ hasPermission: (code) => superuser || granted.has(code), timeoutSeconds: () => limitSeconds })
const col = (id, extra = {}) => ({ id, resource: 'endpoint', placement: GRID, label: id, load: async (ids) => Object.fromEntries(ids.map((x) => [x, `${id}:${x}`])), ...extra })
const ids = (rows) => rows.map((row) => row.id)

// --- Registration ---------------------------------------------------------
{
  const registry = make()
  const checks = registry.forModule('checks')
  checks.register(col('checks.failing', { sortable: true, filterable: 'yes', cell: { template: '<i/>' } }))
  const row = registry.snapshot().find((r) => r.id === 'checks.failing')
  assert.equal(row.sortable, true)
  assert.equal(row.filterable, false, 'strict booleans')
  assert.equal(row.order, 500)
  assert.equal(row.component, undefined)
  assert.equal('load' in row, false, 'snapshot strips functions')
  assert.equal('cell' in row, false)
  assert.equal(registry.snapshot().length, 1)

  assert.throws(() => checks.register({ ...col('checks.noload'), load: undefined }), /requires a load function/)
  assert.throws(() => checks.register(col('checks.badcell', { cell: 'x' })), /cell must be a component/)
  assert.throws(() => checks.register(col('other.x')), /must begin with checks\./)
  assert.throws(() => registry.forModule('alerts').register(col('checks.failing')), /must begin with alerts\./)
  // Duplicate owner: another module cannot take an id, namespacing already refuses it.
  assert.throws(() => registry.forModule('checks2').register(col('checks.failing')), /must begin with checks2\./)
  // Other placements keep the old rule.
  assert.throws(() => checks.register({ id: 'checks.tab', resource: 'endpoint', placement: 'endpoint.tabs', label: 'x' }), /requires a component/)
  assert.throws(() => checks.register({ id: 'checks.tab', resource: 'endpoint', placement: 'endpoint.tabs', component: {}, load: () => ({}) }), /load is only accepted/)
  checks.register({ id: 'checks.tab', resource: 'endpoint', placement: 'endpoint.tabs', component: { template: '<b/>' } })
  const tab = registry.snapshot().find((r) => r.id === 'checks.tab')
  assert.equal('sortable' in tab, false)
  assert.deepEqual(ids(checks.list({ resource: 'endpoint', placement: 'endpoint.tabs' })), ['checks.tab'])
}

// --- gridColumns: permission, visible, order, ids ---------------------------
{
  granted = new Set(); superuser = false
  const registry = make()
  const a = registry.forModule('a')
  const b = registry.forModule('b')
  a.register(col('a.two', { order: 20 }))
  a.register(col('a.locked', { order: 10, permission: 'a.view' }))
  a.register(col('a.hidden', { order: 5, visible: () => false }))
  b.register(col('b.one', { order: 20, label: 'Zeta' }))
  b.register(col('b.zero', { order: 1 }))
  const ctx = { resource: { id: 1 } }
  assert.deepEqual(ids(a.gridColumns({ context: ctx })), ['b.zero', 'a.two', 'b.one'], 'denied and hidden are absent; order, label, id')
  granted.add('a.view')
  assert.deepEqual(ids(a.gridColumns({ context: ctx })), ['b.zero', 'a.locked', 'a.two', 'b.one'], 'after the grant')
  granted = new Set(); superuser = true
  assert.deepEqual(ids(a.gridColumns({ context: ctx })), ['b.zero', 'a.locked', 'a.two', 'b.one'], 'superuser')
  superuser = false
  assert.deepEqual(ids(a.gridColumns({ ids: ['a.two', 'nope', 'a.hidden', 'a.locked', 'b.zero', 'a.two'], context: ctx })), ['a.two', 'b.zero'])
  assert.deepEqual(a.gridColumns({ ids: [] }), [])
  assert.deepEqual(ids(a.gridColumns({ resource: 'asset' })), [], 'other resource')
  registry.removeProvider('b')
  assert.deepEqual(ids(a.gridColumns({ ids: ['b.one', 'a.two'], context: ctx })), ['a.two'])
  a.clear()
  assert.deepEqual(a.gridColumns(), [])
}

// --- loadGridColumns -------------------------------------------------------
{
  granted = new Set(['x.view']); superuser = false; limitSeconds = 0.05
  const registry = make()
  const x = registry.forModule('x')
  const calls = []
  let aborted = false
  x.register(col('x.good', { permission: 'x.view', load: async (agentIds, info) => { calls.push({ agentIds, info }); return { ...Object.fromEntries(agentIds.map((i) => [i, i.toUpperCase()])), stray: 'no', 99: 'no' } } }))
  x.register(col('x.throws', { load: () => { throw new Error('boom') } }))
  x.register(col('x.rejects', { load: async () => { throw new Error('boom') } }))
  x.register(col('x.array', { load: async () => ['a'] }))
  x.register(col('x.null', { load: async () => null }))
  x.register(col('x.partial', { load: async () => ({ a: 1 }) }))
  x.register(col('x.slow', { load: (agentIds, info) => new Promise(() => { info.signal.addEventListener('abort', () => { aborted = true }) }) }))
  const context = { resource: 'x' }
  const columns = x.gridColumns({ context })
  const started = Date.now()
  const out = x.loadGridColumns({ columns, agentIds: ['a', 'b', 'a', 7, null], context })
  assert.deepEqual(Object.keys(out).sort(), ['x.array', 'x.good', 'x.null', 'x.partial', 'x.rejects', 'x.slow', 'x.throws'])
  for (const p of Object.values(out)) assert.ok(p instanceof Promise)
  const fast = await out['x.good']
  assert.ok(Date.now() - started < 40, 'a slow column does not delay another')
  assert.deepEqual(fast, { id: 'x.good', status: 'ready', values: { a: 'A', b: 'B', 7: '7' } })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].agentIds, ['a', 'b', '7'])
  assert.equal(calls[0].info.resource, 'endpoint')
  assert.equal(calls[0].info.placement, GRID)
  assert.equal(calls[0].info.context, context)
  assert.ok(calls[0].info.signal)
  for (const id of ['x.throws', 'x.rejects', 'x.array', 'x.null']) assert.deepEqual(await out[id], { id, status: 'failed', values: {} }, id)
  assert.deepEqual(await out['x.partial'], { id: 'x.partial', status: 'ready', values: { a: 1 } }, 'a missing id is simply absent')
  assert.deepEqual(await out['x.slow'], { id: 'x.slow', status: 'timeout', values: {} })
  assert.equal(aborted, true, 'the signal is aborted on timeout')

  // The limit is read per call.
  limitSeconds = 0.01
  const quick = await x.loadGridColumns({ columns: [{ id: 'x.slow' }], agentIds: ['a'], context })['x.slow']
  assert.equal(quick.status, 'timeout')

  // The 100-id cap.
  let ran = 0
  x.register(col('x.count', { load: async () => { ran += 1; return {} } }))
  const many = Array.from({ length: 101 }, (_, i) => `id${i}`)
  assert.throws(() => x.loadGridColumns({ columns: x.gridColumns(), agentIds: many }), RangeError)
  assert.equal(ran, 0)
  const hundred = many.slice(0, 100)
  limitSeconds = 0.05
  await x.loadGridColumns({ columns: [{ id: 'x.count' }], agentIds: [...hundred, ...hundred] })['x.count']
  assert.equal(ran, 1, 'duplicates are removed before the cap')

  // Permission is re-checked at load time.
  const before = calls.length
  granted.delete('x.view')
  const denied = await x.loadGridColumns({ columns, agentIds: ['a'], context })['x.good']
  assert.deepEqual(denied, { id: 'x.good', status: 'failed', values: {} })
  assert.equal(calls.length, before, 'loader not called after the grant was removed')
  assert.equal((await x.loadGridColumns({ columns: [{ id: 'nope' }], agentIds: ['a'] }).nope).status, 'failed')
  assert.deepEqual(x.loadGridColumns({ columns: [], agentIds: ['a'] }), {})

  // A host signal aborts the loader's signal.
  const y = registry.forModule('y')
  let hostAborted = false
  y.register(col('y.wait', { load: (agentIds, info) => new Promise(() => { info.signal.addEventListener('abort', () => { hostAborted = true }) }) }))
  limitSeconds = 5
  const controller = new AbortController()
  y.loadGridColumns({ columns: [{ id: 'y.wait' }], agentIds: ['a'], signal: controller.signal })
  controller.abort()
  assert.equal(hostAborted, true)

  // A removed provider is not called.
  registry.removeProvider('x')
  assert.equal((await x.loadGridColumns({ columns, agentIds: ['a'] })['x.good']).status, 'failed')
}

// --- guardAbandoned --------------------------------------------------------
{
  const registry = make()
  let abandoned = false
  const guarded = guardAbandoned(registry.forModule('z'), () => abandoned, 'z')
  guarded.register(col('z.c'))
  assert.equal(guarded.gridColumns().length, 1)
  assert.equal(typeof guarded.loadGridColumns({ columns: [{ id: 'z.c' }], agentIds: ['a'] })['z.c'].then, 'function')
  abandoned = true
  assert.throws(() => guarded.gridColumns(), /abandoned/)
  assert.throws(() => guarded.loadGridColumns({}), /abandoned/)
  assert.doesNotThrow(() => guarded.clear())
}

// --- main.js, docs -------------------------------------------------------
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
assert.match(main, /createResourceViewRegistry\(\{ hasPermission, timeoutSeconds: \(\) => state\.context\?\.module_register_timeout_seconds \}\)/)
assert.ok(!/^import .* from '\.\//m.test(fs.readFileSync(new URL('../src/resource-views.js', import.meta.url), 'utf8')), 'resource-views.js stays import-free')
const doc = fs.readFileSync(new URL('../docs/module-resource-views.md', import.meta.url), 'utf8')
for (const needle of ['endpoint.grid-columns', 'endpoint.summary', 'endpoint.tabs', '## Grid columns', '100 ids', 'RangeError', 'gridColumns(', 'loadGridColumns(', 'agent_id', 'tactical:', '{ resource: endpoint }', 'saved view']) {
  assert.ok(doc.includes(needle), `docs name ${needle}`)
}
console.log('endpoint-grid-columns-0.12.93: ok')
