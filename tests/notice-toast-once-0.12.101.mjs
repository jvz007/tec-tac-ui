// 0.12.101: a Core notice toasts once per person in this browser. The first check of a page load toasts only what was created
// since the last check. A poll stop and start, a second page instance on the same storage, a change of person and a failed
// mark-read never toast a known notice again. The stored values hold ids and times only. Johan's HAR pattern is covered:
// rows the sweep creates at install time, polled every 30 seconds, on a page that restarts its poll.
import assert from 'node:assert/strict'
import fs from 'node:fs'

// Toast expiry runs only when the test fires it. Date.now is fixed so the created and checked times are exact.
const pending = []
globalThis.window = {
  setTimeout: (fn) => { pending.push(fn); return pending.length },
  clearTimeout: () => {},
}
let clock = 10000
Date.now = () => clock

const { createNotificationService } = await import('../src/notifications.js')
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const POLL_PATH = '/api/tfd/ui/notices/?state=unread&limit=100'
const TOASTED = (person) => `tec_tac_notices_toasted:${person}`
const CHECKED = (person) => `tec_tac_notices_checked:${person}`
const iso = (ms) => new Date(ms).toISOString()

function fakeStorage() {
  const data = new Map()
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)) },
    removeItem: (key) => { data.delete(key) },
  }
}

function brokenStorage() {
  return {
    getItem() { throw new Error('storage is blocked') },
    setItem() { throw new Error('storage is blocked') },
  }
}

function setStorage(storage) { globalThis.window.localStorage = storage }
function seedChecked(storage, person, at) { storage.setItem(CHECKED(person), String(at)) }

// A fake Core: unread rows, POST read marks a row read, and failRead makes that call fail.
function fakeCore() {
  const core = { rows: [], readIds: new Set(), requests: [], failRead: false }
  core.api = async (path, options = {}) => {
    const method = options.method || 'GET'
    core.requests.push({ path, method })
    if (method === 'GET' && path === POLL_PATH) {
      const unread = core.rows.filter((item) => !core.readIds.has(item.id))
      return { notices: unread, count: unread.length, unread_count: unread.length }
    }
    const match = /^\/api\/tfd\/ui\/notices\/([^/]+)\/read\/$/.exec(path)
    if (method === 'POST' && match) {
      if (core.failRead) throw new Error('network is down')
      core.readIds.add(decodeURIComponent(match[1]))
      return { unread_count: core.rows.filter((item) => !core.readIds.has(item.id)).length }
    }
    throw new Error(`unexpected request ${method} ${path}`)
  }
  core.reads = (id) => core.requests.filter((item) => item.method === 'POST' && item.path.endsWith('/read/') && (id == null || item.path.includes(`/${id}/`)))
  return core
}

const row = (id, extra = {}) => ({
  id,
  source: 'core',
  level: 'error',
  title: 'Module job failed',
  message: `Module patching could not be updated. ${id}`,
  action: { label: 'Open Modules', route: '/modules' },
  read: false,
  created_at: iso(6000),
  ...extra,
})

function makeService(core, person = { value: 7 }) {
  return createNotificationService({ api: core.api, router: { push: async () => {} }, userKey: () => person.value })
}

function resetTimers() { pending.length = 0 }

// 1. two page instances on the same storage: a row toasts once, in whichever instance sees it first
{
  resetTimers()
  const storage = fakeStorage()
  setStorage(storage)
  seedChecked(storage, 7, 5000)
  const core = fakeCore()
  core.rows = [row('r1')]
  clock = 10000
  const first = makeService(core)
  const second = makeService(core)
  await first.pollServerNotices()
  await second.pollServerNotices()
  await second.pollServerNotices()
  assert.equal(first.toasts.length, 1, 'the first instance toasts the new row')
  assert.equal(second.toasts.length, 0, 'the second instance does not toast it again')
  assert.equal(first.toasts[0].serverNoticeId, 'r1')
  assert.deepEqual(JSON.parse(storage.getItem(TOASTED(7))), ['r1'], 'the toasted id is stored for the person')
}

// 2. the × and the action each mark the notice read, once; timer expiry, trimming and a module's clear do not
{
  resetTimers()
  const storage = fakeStorage()
  setStorage(storage)
  seedChecked(storage, 7, 5000)
  const core = fakeCore()
  core.rows = [row('r2'), row('r3')]
  clock = 10000
  const svc = makeService(core)
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 2)
  const [closed, expired] = svc.toasts
  // expiry of the second toast: its timer runs, and no read is sent
  pending[1]()
  await flush()
  assert.equal(svc.toasts.length, 1, 'the expired toast is gone')
  assert.equal(core.reads().length, 0, 'timer expiry does not mark the notice read')
  assert.equal(core.readIds.has(expired.serverNoticeId), false, 'the expired notice stays unread in the bell')
  // the × on the remaining toast marks its notice read, once
  await svc.dismissByPerson(closed.id)
  assert.equal(svc.toasts.length, 0)
  assert.equal(core.reads('r2').length, 1, 'the × sends one read')
  assert.equal(core.readIds.has('r2'), true)
  // a new notice used through its action: one read, and the toast closes
  core.rows.push(row('r4'))
  clock = 11000
  await svc.pollServerNotices()
  const acted = svc.toasts.find((item) => item.serverNoticeId === 'r4')
  assert.ok(acted, 'the new notice toasts')
  svc.invoke(acted.id)
  await flush()
  assert.equal(core.reads('r4').length, 1, 'the action sends one read')
  assert.equal(svc.toasts.some((item) => item.id === acted.id), false, 'the action closes its toast')
  // a module's clear of its toasts does not mark anything read
  core.rows.push(row('r5'))
  clock = 12000
  await svc.pollServerNotices()
  svc.forModule('core').clear()
  await flush()
  assert.equal(core.reads('r5').length, 0, 'clearing a module does not mark its notice read')
  assert.equal(core.readIds.has('r5'), false)
}

// 2b. trimming to five visible toasts removes the oldest and does not mark it read
{
  resetTimers()
  const storage = fakeStorage()
  setStorage(storage)
  seedChecked(storage, 7, 5000)
  const core = fakeCore()
  core.rows = ['t1', 't2', 't3', 't4', 't5', 't6'].map((id) => row(id))
  clock = 10000
  const svc = makeService(core)
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 5, 'at most five toasts show')
  assert.equal(core.reads().length, 0, 'trimming does not mark a notice read')
  assert.equal(svc.toasts.some((item) => item.serverNoticeId === 't1'), false, 'the oldest was trimmed')
}

// 3. a failed mark-read warns only; the notice stays remembered, so the toast never returns
{
  resetTimers()
  const storage = fakeStorage()
  setStorage(storage)
  seedChecked(storage, 7, 5000)
  const core = fakeCore()
  core.rows = [row('r6')]
  clock = 10000
  const svc = makeService(core)
  await svc.pollServerNotices()
  const warnings = []
  const warn = console.warn
  console.warn = (...args) => warnings.push(args)
  try {
    core.failRead = true
    await svc.dismissByPerson(svc.toasts[0].id)
  } finally {
    console.warn = warn
  }
  assert.equal(warnings.length, 1, 'the failed read is logged once')
  assert.equal(core.reads('r6').length, 1, 'one attempt was made')
  core.failRead = false
  clock = 11000
  await svc.pollServerNotices()
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 0, 'a failed mark-read does not toast the notice again')
  assert.equal(core.reads('r6').length, 1, 'no second attempt is made by the poll')
}

// 4. poll stop and start: no re-toast, no re-seed, and a row that arrived while stopped is not swallowed
{
  resetTimers()
  const storage = fakeStorage()
  setStorage(storage)
  seedChecked(storage, 7, 5000)
  const core = fakeCore()
  core.rows = [row('r7')]
  clock = 10000
  const svc = makeService(core)
  svc.startServerNoticePolling()
  await flush()
  assert.equal(svc.toasts.length, 1, 'the first check toasts the new row')
  svc.stopServerNoticePolling()
  core.rows.push(row('r8', { created_at: iso(10500) }))
  clock = 11000
  svc.startServerNoticePolling()
  await flush()
  svc.stopServerNoticePolling()
  svc.startServerNoticePolling()
  await flush()
  svc.stopServerNoticePolling()
  assert.equal(svc.toasts.filter((item) => item.serverNoticeId === 'r7').length, 1, 'the known row does not toast again')
  assert.equal(svc.toasts.filter((item) => item.serverNoticeId === 'r8').length, 1, 'a row that arrived while stopped toasts once')
  assert.equal(svc.toasts.length, 2)
}

// 5. the first check toasts only rows created since the stored last check; the rest are recorded
{
  resetTimers()
  const storage = fakeStorage()
  setStorage(storage)
  seedChecked(storage, 7, 5000)
  const core = fakeCore()
  core.rows = [row('old', { created_at: iso(4000) }), row('fresh', { created_at: iso(6000) })]
  clock = 10000
  const svc = makeService(core)
  await svc.pollServerNotices()
  assert.deepEqual(svc.toasts.map((item) => item.serverNoticeId), ['fresh'], 'only the row created since the last check toasts')
  clock = 11000
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 1, 'the recorded row never toasts later on this page')
}

// 5b. no stored last check: the first check records only, then the check time is stored for the next visit
{
  resetTimers()
  const storage = fakeStorage()
  setStorage(storage)
  const core = fakeCore()
  core.rows = [row('backlog', { created_at: iso(6000) })]
  clock = 10000
  const svc = makeService(core)
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 0, 'no stored check time means record only')
  assert.equal(storage.getItem(CHECKED(7)), '10000', 'the check time is stored after the poll')
  // the next visit: a row created after that check toasts; the backlog does not
  resetTimers()
  core.rows.push(row('later', { created_at: iso(10500) }))
  clock = 12000
  const next = makeService(core)
  await next.pollServerNotices()
  assert.deepEqual(next.toasts.map((item) => item.serverNoticeId), ['later'])
}

// 6. a change of person: each person has its own stored ids and check time; nothing leaks between them
{
  resetTimers()
  const storage = fakeStorage()
  setStorage(storage)
  seedChecked(storage, 7, 5000)
  seedChecked(storage, 8, 5000)
  const core = fakeCore()
  core.rows = [row('r9')]
  clock = 10000
  const person = { value: 7 }
  const svc = makeService(core, person)
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 1)
  assert.deepEqual(JSON.parse(storage.getItem(TOASTED(7))), ['r9'])
  assert.equal(storage.getItem(TOASTED(8)), null, 'person 8 has nothing stored yet')
  // the same instance, now another person: the check starts over and person 8 is not suppressed by person 7's ids
  person.value = 8
  clock = 11000
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 2, 'person 8 toasts the row it has not seen')
  assert.deepEqual(JSON.parse(storage.getItem(TOASTED(8))), ['r9'])
  assert.deepEqual(JSON.parse(storage.getItem(TOASTED(7))), ['r9'], 'person 7 keeps its own list')
}

// 7. storage that throws: the page keeps its 0.12.92 behaviour (backlog recorded, a new row toasts once)
{
  resetTimers()
  setStorage(brokenStorage())
  const core = fakeCore()
  core.rows = [row('old-backlog', { created_at: iso(1000) })]
  clock = 10000
  const svc = makeService(core)
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 0, 'the backlog is not replayed')
  core.rows.push(row('new-one', { created_at: iso(9000) }))
  clock = 11000
  await svc.pollServerNotices()
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 1, 'a new row toasts once with storage blocked')
  assert.equal(svc.toasts[0].serverNoticeId, 'new-one')
}

// 8. what is stored: ids and a time only; no message text, no token
{
  resetTimers()
  const storage = fakeStorage()
  setStorage(storage)
  seedChecked(storage, 7, 5000)
  const core = fakeCore()
  core.rows = [row('r10', { message: 'Secret wording token=abc123' })]
  clock = 10000
  const svc = makeService(core)
  await svc.pollServerNotices()
  assert.equal(svc.toasts.length, 1)
  const stored = storage.getItem(TOASTED(7))
  assert.deepEqual(JSON.parse(stored), ['r10'])
  assert.doesNotMatch(stored, /Secret|token|abc123|message/)
  assert.equal(storage.getItem(CHECKED(7)), '10000')
  assert.deepEqual([...storage.data.keys()].sort(), [CHECKED(7), TOASTED(7)].sort(), 'only the two notice keys are written')
}

// 9. Johan's pattern: a sweep creates a row mid-session; a second page instance on the same storage and a poll restart
// toast it exactly once
{
  resetTimers()
  const storage = fakeStorage()
  setStorage(storage)
  seedChecked(storage, 7, 5000)
  const core = fakeCore()
  clock = 10000
  const first = makeService(core)
  await first.pollServerNotices()
  clock = 19000
  core.rows.push(row('sweep-1', { created_at: iso(19500) }))
  await first.pollServerNotices()
  first.stopServerNoticePolling()
  first.startServerNoticePolling()
  await flush()
  first.stopServerNoticePolling()
  const second = makeService(core)
  await second.pollServerNotices()
  clock = 20000
  await first.pollServerNotices()
  await second.pollServerNotices()
  const toasts = [...first.toasts, ...second.toasts].filter((item) => item.serverNoticeId === 'sweep-1')
  assert.equal(toasts.length, 1, 'the sweep row toasts exactly once across both page instances')
  assert.equal(first.toasts.length, 1)
  assert.equal(second.toasts.length, 0)
}

// 10. source checks: no token or auth header in the notices code, and the wiring the shell relies on
const source = fs.readFileSync(new URL('../src/notifications.js', import.meta.url), 'utf8')
assert.doesNotMatch(source, /access_token|Authorization|sessionStorage/, 'the notices code never handles a token or a header')
assert.match(source, /tec_tac_notices_toasted:/)
assert.match(source, /tec_tac_notices_checked:/)
assert.match(source, /const MAX_STORED_TOASTED = 500/)
const app = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
assert.match(app, /@click="notifications\.dismissByPerson\(toast\.id\)"/, 'the toast × marks the notice read')
assert.doesNotMatch(app, /notifications\.dismiss\(toast\.id\)/, 'the toast × no longer uses the plain dismiss')
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
assert.match(main, /createNotificationService\(\{ api: apiFetch, router, userKey: \(\) => state\.context\?\.user\?\.id \}\)/)

console.log('notice-toast-once-0.12.101: ok')
