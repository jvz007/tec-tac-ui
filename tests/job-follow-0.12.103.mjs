// 0.12.103: the shell's background job follow. A fake clock and a fake api drive the poll. The shell polls, so a follow does
// not depend on any component or route. Sign-out, a 401, three failed reads, the time limit, cancel, replace, the limits and
// the module binding are all covered, and the real loader binds jobs to each module.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { createJobFollowService } = await import(new URL('../src/job-follow.js', import.meta.url).href)

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])

// A manual clock: timers fire only when advance() reaches them, and every await of a read is flushed.
function clock() {
  let now = 0
  let next = 1
  const timers = new Map()
  return {
    setTimer(fn, ms) { const id = next++; timers.set(id, { at: now + ms, fn }); return id },
    clearTimer(id) { timers.delete(id) },
    count: () => timers.size,
    async advance(ms) {
      const target = now + ms
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        now = due[1].at
        timers.delete(due[0])
        due[1].fn()
        for (let i = 0; i < 5; i += 1) await Promise.resolve()
      }
      now = target
    },
  }
}

function notices() {
  const log = []
  const make = (level) => (message, options = {}) => { log.push({ level, message, ...options }); return `t${log.length}` }
  return { log, notifications: { info: make('info'), success: make('success'), warning: make('warning'), error: make('error') } }
}

function setup({ signedOut = () => false, trusted = () => true } = {}) {
  const c = clock()
  const service = createJobFollowService({ isSignedOut: () => signedOut(), isTrustedContext: () => trusted(), setTimer: c.setTimer, clearTimer: c.clearTimer })
  return { c, service }
}

function bind(service, moduleId, api, n = notices(), abandoned = { value: false }) {
  const jobs = service.forModule(moduleId, { api, notifications: n.notifications, isAbandoned: () => abandoned.value })
  return { jobs, n, abandoned }
}

const base = (extra = {}) => ({
  id: 'j1',
  title: 'Install 7-Zip',
  path: '/api/tfd/software/jobs/1/',
  check: (payload) => (payload.s === 'done' ? 'success' : payload.s === 'bad' ? 'error' : false),
  timeLimitMs: 600000,
  ...extra,
})

// Success path: one success notice, then polling stops. The route changing is irrelevant: nothing here reads a route.
{
  const { c, service } = setup()
  const reads = []
  const answers = [{ s: 'run' }, { s: 'run' }, { s: 'done' }]
  const { jobs, n } = bind(service, 'software', async (path) => { reads.push(path); return answers.shift() })
  const handle = jobs.follow(base({ successMessage: (p) => `Done ${p.s}` }))
  assert.equal(handle.id, 'j1')
  assert.equal(typeof handle.cancel, 'function')
  await c.advance(4999)
  assert.equal(reads.length, 0, 'the first read waits one interval')
  await c.advance(1)
  assert.equal(reads.length, 1)
  await c.advance(10000)
  assert.equal(reads.length, 3)
  assert.equal(n.log.length, 1)
  assert.equal(n.log[0].level, 'success')
  assert.equal(n.log[0].message, 'Done done')
  assert.equal(n.log[0].dedupeKey, 'job-follow:j1')
  await c.advance(120000)
  assert.equal(reads.length, 3, 'polling stopped')
  assert.equal(c.count(), 0, 'no timer left, not even the time limit')
  assert.equal(service.count(), 0)
}

// Error path, with the default text.
{
  const { c, service } = setup()
  const { jobs, n } = bind(service, 'software', async () => ({ s: 'bad' }))
  jobs.follow(base())
  await c.advance(5000)
  assert.equal(n.log.length, 1)
  assert.equal(n.log[0].level, 'error')
  assert.match(n.log[0].message, /Install 7-Zip did not finish/)
}

// The time limit sends one timeout notice and stops. A custom message is used when given.
{
  const { c, service } = setup()
  let reads = 0
  const { jobs, n } = bind(service, 'software', async () => { reads += 1; return { s: 'run' } })
  jobs.follow(base({ timeLimitMs: 20000 }))
  await c.advance(25000)
  assert.equal(n.log.length, 1)
  assert.equal(n.log[0].level, 'warning')
  assert.match(n.log[0].message, /has not finished/)
  const after = reads
  await c.advance(60000)
  assert.equal(reads, after)
  assert.equal(service.count(), 0)
  const second = bind(service, 'software', async () => ({ s: 'run' }))
  second.jobs.follow(base({ id: 'j2', timeLimitMs: 10000, timeoutMessage: 'Check Software.' }))
  await c.advance(10000)
  assert.equal(second.n.log[0].message, 'Check Software.')
}

// Sign-out stops every follow with no notice and no further api call.
{
  let out = false
  const { c, service } = setup({ signedOut: () => out })
  let reads = 0
  const { jobs, n } = bind(service, 'software', async () => { reads += 1; return { s: 'run' } })
  jobs.follow(base({ id: 'a' }))
  jobs.follow(base({ id: 'b' }))
  await c.advance(5000)
  assert.equal(reads, 2)
  out = true
  await c.advance(300000)
  assert.equal(reads, 2, 'no read after sign-out')
  assert.equal(n.log.length, 0, 'silent')
  assert.equal(service.count(), 0)
  assert.throws(() => jobs.follow(base({ id: 'c' })), /signed out/)
}

// A read that finishes after sign-out gives no notice. stopAll is silent.
{
  let out = false
  const { c, service } = setup({ signedOut: () => out })
  let release
  const { jobs, n } = bind(service, 'software', () => new Promise((resolve) => { release = () => resolve({ s: 'done' }) }))
  jobs.follow(base())
  await c.advance(5000)
  out = true
  release()
  await c.advance(1)
  assert.equal(n.log.length, 0)
  const again = setup()
  const b = bind(again.service, 'software', async () => ({ s: 'run' }))
  b.jobs.follow(base())
  again.service.stopAll()
  await again.c.advance(60000)
  assert.equal(again.service.count(), 0)
  assert.equal(b.n.log.length, 0)
}

// A 401 read stops silently.
{
  const { c, service } = setup()
  let reads = 0
  const { jobs, n } = bind(service, 'software', async () => { reads += 1; throw Object.assign(new Error('no'), { status: 401 }) })
  jobs.follow(base())
  await c.advance(60000)
  assert.equal(reads, 1)
  assert.equal(n.log.length, 0)
  assert.equal(service.count(), 0)
}

// Three failed reads in a row stop with one error notice; a good read in between resets the count.
{
  const { c, service } = setup()
  let reads = 0
  const { jobs, n } = bind(service, 'software', async () => { reads += 1; throw Object.assign(new Error('down'), { status: 502 }) })
  jobs.follow(base())
  await c.advance(5000 * 3)
  assert.equal(reads, 3)
  assert.equal(n.log.length, 1)
  assert.equal(n.log[0].level, 'error')
  await c.advance(60000)
  assert.equal(reads, 3)

  const flaky = setup()
  const script = [502, 502, 'ok', 502, 502, 'done']
  const f = bind(flaky.service, 'software', async () => {
    const step = script.shift()
    if (typeof step === 'number') throw Object.assign(new Error('down'), { status: step })
    return { s: step === 'done' ? 'done' : 'run' }
  })
  f.jobs.follow(base())
  await flaky.c.advance(5000 * 6)
  assert.equal(f.n.log.length, 1)
  assert.equal(f.n.log[0].level, 'success')
}

// The same id replaces the earlier follow; cancel is silent; the old one stops.
{
  const { c, service } = setup()
  const reads = []
  const { jobs, n } = bind(service, 'software', async (path) => { reads.push(path); return { s: 'run' } })
  jobs.follow(base({ path: '/api/tfd/software/jobs/old/' }))
  jobs.follow(base({ path: '/api/tfd/software/jobs/new/' }))
  assert.equal(service.count(), 1)
  await c.advance(5000)
  assert.deepEqual(reads, ['/api/tfd/software/jobs/new/'])
  const handle = jobs.follow(base({ id: 'x' }))
  handle.cancel()
  handle.cancel()
  assert.equal(service.count(), 1)
  assert.equal(n.log.length, 0)
}

// Limits: 10 per module, 50 in all. Replacing an id is not a new follow.
{
  const { service } = setup()
  const { jobs } = bind(service, 'software', async () => ({ s: 'run' }))
  for (let i = 0; i < 10; i += 1) jobs.follow(base({ id: `k${i}` }))
  assert.throws(() => jobs.follow(base({ id: 'k10' })), /already following 10 jobs/)
  assert.doesNotThrow(() => jobs.follow(base({ id: 'k3' })))
  const otherModules = []
  for (let m = 0; m < 4; m += 1) {
    const b = bind(service, `mod${m}`, async () => ({ s: 'run' }))
    otherModules.push(b)
    for (let i = 0; i < 10; i += 1) b.jobs.follow(base({ id: `k${i}` }))
  }
  assert.equal(service.count(), 50)
  const last = bind(service, 'last', async () => ({ s: 'run' }))
  assert.throws(() => last.jobs.follow(base()), /already following 50 jobs/)
}

// An abandoned module is refused, and clear() stops that module's live follows and refuses more. Another module is unaffected.
{
  const { c, service } = setup()
  const abandoned = { value: false }
  const a = bind(service, 'a', async () => ({ s: 'run' }), notices(), abandoned)
  const b = bind(service, 'b', async () => ({ s: 'run' }))
  a.jobs.follow(base())
  b.jobs.follow(base())
  abandoned.value = true
  assert.throws(() => a.jobs.follow(base({ id: 'z' })), /abandoned/)
  await c.advance(5000)
  assert.equal(service.count(), 1, 'the abandoned module poll stopped itself')
  const d = bind(service, 'd', async () => ({ s: 'run' }))
  d.jobs.follow(base())
  d.jobs.clear()
  assert.throws(() => d.jobs.follow(base({ id: 'y' })), /unloaded/)
  assert.equal(service.count(), 1)
}

// Outside a backend context follow is refused. Bad descriptors are refused with plain messages.
{
  const { service } = setup({ trusted: () => false })
  const { jobs } = bind(service, 'software', async () => ({}))
  assert.throws(() => jobs.follow(base()), /Core has sent your access/)
  const ok = setup()
  const b = bind(ok.service, 'software', async () => ({}))
  assert.throws(() => b.jobs.follow(null), /descriptor/)
  assert.throws(() => b.jobs.follow(base({ id: '' })), /id/)
  assert.throws(() => b.jobs.follow(base({ title: '' })), /title/)
  assert.throws(() => b.jobs.follow(base({ path: 'api/x' })), /path/)
  assert.throws(() => b.jobs.follow(base({ check: 'no' })), /check/)
  assert.throws(() => b.jobs.follow(base({ timeLimitMs: undefined })), /timeLimitMs/)
}

// Interval and time limit are clamped.
{
  const { c, service } = setup()
  let reads = 0
  const { jobs } = bind(service, 'software', async () => { reads += 1; return { s: 'run' } })
  jobs.follow(base({ id: 'fast', intervalMs: 10, timeLimitMs: 1 }))
  await c.advance(1999)
  assert.equal(reads, 0, 'interval has a floor of 2000')
  await c.advance(1)
  assert.equal(reads, 1)
  await c.advance(7999)
  assert.equal(service.count(), 1, 'time limit has a floor of 10000')
  await c.advance(1)
  assert.equal(service.count(), 0)

  const slow = setup()
  let slowReads = 0
  const s = bind(slow.service, 'software', async () => { slowReads += 1; return { s: 'run' } })
  s.jobs.follow(base({ intervalMs: 9e9, timeLimitMs: 9e12 }))
  await slow.c.advance(60000)
  assert.equal(slowReads, 1, 'interval has a ceiling of 60000')
  await slow.c.advance(1800000)
  assert.equal(slow.service.count(), 0, 'time limit has a ceiling of 30 minutes')
}

// The real loader binds jobs to each module: the id is bound, the guarded api refuses another module's operations route,
// cleanup (unload) stops the module's follows, and the shared service is not handed to the module.
{
  const { c, service } = setup()
  const reads = []
  const api = async (path) => { reads.push(path); return { s: 'run' } }
  const n = notices()
  const registry = { forModule: () => n.notifications }
  globalThis.__ctx = {}
  const runtime = {
    state: { context: { permissions: [], user: {}, module_register_timeout_seconds: 30 }, contextSource: 'backend' },
    router: { currentRoute: { value: { path: '/', fullPath: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} },
    addNavigation() {}, removeNavigation() {},
    api, apiRaw: api, apiBlob: api, apiText: api,
    notifications: registry,
    jobs: service,
  }
  const code = (id) => entry(`export default { register(context) { globalThis.__ctx['${id}'] = context } }`)
  const result = await loader.loadUiModules(runtime, [{ id: 'software', entry: code('software') }, { id: 'other', entry: code('other') }])
  assert.deepEqual(result.loaded, ['software', 'other'])
  const ctx = globalThis.__ctx.software
  assert.equal(typeof ctx.jobs.follow, 'function')
  assert.equal('forModule' in ctx.jobs, false, 'the shared service is not handed out')
  assert.equal('stopAll' in ctx.jobs, false)
  assert.equal('isSignedOut' in ctx, false)

  // The module cannot name another module: the descriptor has no module field and the key is bound.
  ctx.jobs.follow(base({ id: 'same', moduleId: 'other', module: 'other' }))
  globalThis.__ctx.other.jobs.follow(base({ id: 'same' }))
  assert.equal(service.count(), 2, 'the same id in two modules is two follows')

  // The guarded api still refuses another module's tactical-operations route.
  ctx.jobs.follow(base({ id: 'steal', path: '/api/tfd/tactical-operations/other/run/' }))
  await c.advance(5000)
  assert.equal(reads.some((path) => path.includes('tactical-operations')), false, 'the guarded api refused it')
  assert.equal(reads.filter((path) => path === '/api/tfd/software/jobs/1/').length, 2)

  // Unload runs the cleanup, which stops the module's follows and refuses more.
  assert.equal(loader.unloadUiModule(runtime, 'software'), true)
  assert.equal(service.count(), 1, 'only the other module follow is left')
  assert.throws(() => ctx.jobs.follow(base({ id: 'late' })), /unloaded|abandoned/)
  assert.equal(globalThis.__ctx.other.jobs.follow(base({ id: 'more' })).id, 'more')
}

// Source scan: main.js shares one service, stops it on sign-out and pagehide.
{
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(main, /createJobFollowService\(\{ isSignedOut/)
  assert.match(main, /addEventListener\('pagehide', \(\) => jobs\.stopAll\(\)\)/)
  assert.match(main, /jobs\.stopAll\(\)/)
  assert.match(main, /\n      jobs,\n/)
  const source = fs.readFileSync(new URL('../src/job-follow.js', import.meta.url), 'utf8')
  assert.equal(/localStorage|sessionStorage|fetch\(|Authorization/.test(source), false, 'no storage, no direct fetch, no auth header')
  assert.ok(fs.existsSync(new URL('../docs/module-job-follow.md', import.meta.url)))
}

console.log('job follow 0.12.103: PASS')
