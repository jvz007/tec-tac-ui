// 0.12.111 (held finding from the ui-0.12.93 review): a host abort settles a grid column as failed at once, aborts the loader's
// signal, clears the timer, and a late answer is ignored. A real time-limit hit still gives timeout; a normal answer, ready.
import assert from 'node:assert/strict'
import fs from 'node:fs'

let source = fs.readFileSync(new URL('../src/resource-views.js', import.meta.url), 'utf8')
source = source.replace("import { reactive } from 'vue'", 'const reactive = (value) => value\n')
const { createResourceViewRegistry } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const GRID = 'endpoint.grid-columns'
let limitSeconds = 0.08
const make = () => createResourceViewRegistry({ hasPermission: () => true, timeoutSeconds: () => limitSeconds })
const col = (id, load) => ({ id, resource: 'endpoint', placement: GRID, label: id, load })
const tick = () => new Promise((r) => setTimeout(r, 0))
const within = (p, ms = 30) => Promise.race([p, new Promise((r) => setTimeout(() => r('SLOW'), ms))])

// abort after the call: settles failed within one tick although load never resolves, and the loader signal is aborted
{
  const registry = make()
  let scoped
  let seen
  (scoped = registry.forModule('m')).register(col('m.a', (ids, { signal }) => { seen = signal; return new Promise(() => {}) }))
  const host = new AbortController()
  const out = scoped.loadGridColumns({ columns: [{ id: 'm.a' }], agentIds: ['1'], signal: host.signal })
  await tick()
  host.abort()
  const r = await within(out['m.a'])
  assert.deepEqual(r, { id: 'm.a', status: 'failed', values: {} })
  assert.equal(seen.aborted, true, 'the loader signal is aborted')
  await new Promise((res) => setTimeout(res, 150))
  assert.equal((await out['m.a']).status, 'failed', 'no timeout later')
}

// abort before the call
{
  const registry = make()
  let scoped
  (scoped = registry.forModule('m')).register(col('m.a', () => new Promise(() => {})))
  const host = new AbortController()
  host.abort()
  const out = scoped.loadGridColumns({ columns: [{ id: 'm.a' }], agentIds: ['1'], signal: host.signal })
  assert.equal((await within(out['m.a'])).status, 'failed')
}

// a late answer after the abort is ignored
{
  const registry = make()
  let scoped
  let release
  (scoped = registry.forModule('m')).register(col('m.a', () => new Promise((r) => { release = r })))
  const host = new AbortController()
  const out = scoped.loadGridColumns({ columns: [{ id: 'm.a' }], agentIds: ['1'], signal: host.signal })
  await tick()
  host.abort()
  release({ 1: 'late' })
  assert.deepEqual(await out['m.a'], { id: 'm.a', status: 'failed', values: {} })
}

// a real timeout still gives timeout and aborts the signal
{
  const registry = make()
  let scoped
  let seen
  (scoped = registry.forModule('m')).register(col('m.a', (ids, { signal }) => { seen = signal; return new Promise(() => {}) }))
  const out = scoped.loadGridColumns({ columns: [{ id: 'm.a' }], agentIds: ['1'] })
  assert.equal((await out['m.a']).status, 'timeout')
  assert.equal(seen.aborted, true)
}

// a normal answer is ready, and an abort afterwards changes nothing
{
  const registry = make()
  let scoped
  (scoped = registry.forModule('m')).register(col('m.a', async (ids) => Object.fromEntries(ids.map((x) => [x, `v${x}`]))))
  const host = new AbortController()
  const out = scoped.loadGridColumns({ columns: [{ id: 'm.a' }], agentIds: ['1', '2'], signal: host.signal })
  const r = await out['m.a']
  assert.deepEqual(r, { id: 'm.a', status: 'ready', values: { 1: 'v1', 2: 'v2' } })
  host.abort()
  await tick()
  assert.equal(r.status, 'ready')
}

assert.ok(fs.readFileSync(new URL('../docs/module-resource-views.md', import.meta.url), 'utf8').includes('settles as `failed` at once'), 'the doc says a host abort settles at once')
console.log('grid-columns-host-abort-0.12.111: PASS')
