// 0.12.118: the event jobs panel on Scheduler Configuration (Core 1.17.45, docs/event-jobs.md). The row model from Core's documented
// answer, the age wording, 403 and 404 hiding the panel, no summary tiles without the event_jobs block, error text as text, and no
// payload or key field read.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
globalThis.localStorage = { getItem: () => 'tok', setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const e = await import(new URL('../src/scheduler-event-jobs.js', import.meta.url).href)
const schedulerSource = read('../src/scheduler.js')

// Core's list_event_jobs() answer: jobs, totals, limits. A payload or key would be a bug in Core; none may reach the page.
const answer = {
  jobs: [
    { module_id: 'alerts', job_id: 'alerts.deliver', label: 'Send an alert notice', registered: true, pending: 3, running: 1, oldest_pending_age_seconds: 420, published: 120, duplicate: 4, dropped: 2, succeeded: 110, failed: 5, expired: 1, skipped: 0, last_failure_at: '2026-10-20T07:00:00Z', last_error: 'ConnectionError: broker down', max_backlog: 500, payload: { secret: 'P-SECRET' }, key: 'K-SECRET', id: 'row-id-1' },
    { module_id: 'checks', job_id: 'checks.refresh', label: '', registered: false, pending: 0, running: 0, oldest_pending_age_seconds: null, published: 0, dropped: 0, failed: 0, expired: 0, last_failure_at: null, last_error: '' },
  ],
  totals: { pending: 3 },
  limits: { max_attempts: { minimum: 1, default: 3, maximum: 10 } },
}
const rows = e.eventJobRows(answer)
const out = JSON.stringify(rows)
for (const bad of ['P-SECRET', 'K-SECRET', 'row-id-1']) assert.ok(!out.includes(bad), `no ${bad} in the row model`)
assert.deepEqual(rows[0], {
  uid: 'alerts:alerts.deliver', module: 'alerts', label: 'Send an alert notice', registered: true, pending: 3, running: 1, oldestPending: 'about 7 minutes',
  published: 120, dropped: 2, failed: 5, expired: 1, lastFailureAt: '2026-10-20T07:00:00Z', lastError: 'ConnectionError: broker down',
})
assert.equal(rows[1].label, 'checks.refresh', 'a job with no label shows its id')
assert.equal(rows[1].registered, false)
assert.equal(rows[1].oldestPending, '—', 'nothing pending is a dash')
assert.equal(rows[1].lastFailureAt, '')
assert.deepEqual(e.eventJobRows({}), [])
assert.deepEqual(e.eventJobRows(null), [])
assert.equal(e.eventJobRows({ jobs: [{ pending: -4, running: 'x', published: 1.5 }, null] }).length, 0, 'a row with neither module nor label is dropped')
assert.equal(e.eventJobRows({ jobs: [{ module_id: 'm', pending: -4, running: 'x', published: 1.5 }] })[0].pending, 0, 'a bad count reads as 0')

// ---- the age in plain words ----
assert.equal(e.ageText(null), '—')
assert.equal(e.ageText(undefined), '—')
assert.equal(e.ageText(-1), '—')
assert.equal(e.ageText(0), 'less than a minute')
assert.equal(e.ageText(59), 'less than a minute')
assert.equal(e.ageText(60), 'about 1 minute')
assert.equal(e.ageText(420), 'about 7 minutes')
assert.equal(e.ageText(3600), 'about 1 hour')
assert.equal(e.ageText(7300), 'about 2 hours')
assert.equal(e.ageText(3 * 86400), 'about 3 days')
assert.equal(e.ageText('300'), '—', 'a string is not an age')

// ---- the summary tiles from the additive health block ----
const health = { tick_health: 'healthy', event_jobs: { registered: 4, pending: 2, running: 1, failed_last_24h: 3, dropped_last_24h: 0, oldest_pending_age_seconds: 125 } }
const tiles = e.eventJobTiles(health)
assert.deepEqual(tiles.map((t) => t.label), ['Event jobs', 'Pending', 'Failed', 'Dropped', 'Oldest pending'])
assert.deepEqual(tiles.map((t) => t.value), ['4', '2', '3', '0', 'about 2 minutes'])
assert.equal(tiles[1].note, '1 running')
assert.equal(e.eventJobTiles({ tick_health: 'healthy' }), null, 'an older health answer without event_jobs shows no tiles')
assert.equal(e.eventJobTiles(null), null)
assert.equal(e.eventJobTiles({ event_jobs: 'x' }), null)
assert.equal(e.eventJobTiles({ event_jobs: { error: 'OperationalError', registered: 0 } })[0].value, '0', 'a Core fault block still shows zeros, never an error type')

// ---- 403 and 404 hide the panel; other errors are thrown ----
const fail = (status) => async () => { throw Object.assign(new Error('x'), { status }) }
assert.deepEqual(await e.loadEventJobs({ api: fail(403) }), { hidden: true })
assert.deepEqual(await e.loadEventJobs({ api: fail(404) }), { hidden: true })
await assert.rejects(() => e.loadEventJobs({ api: fail(500) }))
const seen = []
const ok = await e.loadEventJobs({ api: async (path) => { seen.push(path); return answer } })
assert.deepEqual(seen, ['/api/tfd/scheduler/event-jobs/'])
assert.equal(ok.rows.length, 2)

// ---- the page ----
const view = read('../src/views/SchedulerSettingsView.vue')
assert.match(view, /import \{ eventJobTiles, loadEventJobs \} from '\.\.\/scheduler-event-jobs'/)
assert.match(view, /<section v-if="eventJobs" class="card mt scheduler-event-jobs"/, 'the panel exists only with rows')
assert.match(view, /const result=await loadEventJobs\(\);eventJobs\.value=result\.hidden\?null:result\}catch\{eventJobs\.value=null\}/, 'a refusal, a 404 or any failure hides the panel and never breaks the page')
assert.match(view, /<div v-if="eventTiles" class="grid g4 mb event-job-tiles">/, 'tiles only with the health block')
assert.match(view, /\{\{row\.lastError\}\}/, 'the error is text')
assert.ok(!/v-html|innerHTML/.test(view), 'text only')
assert.ok(!/row\.(payload|key|id)\b|\.payload|job\.key/.test(view + read('../src/scheduler-event-jobs.js')), 'no payload, key or row id is read')
assert.match(schedulerSource, /export function listEventJobs\(\)\{ return apiFetch\('\/api\/tfd\/scheduler\/event-jobs\/'\) \}/)
assert.match(view, /Read only\./)
assert.ok(!/@click="[^"]*eventJob|method:'POST'/.test(view.slice(view.indexOf('scheduler-event-jobs"'))), 'the panel has no action')
console.log('scheduler-event-jobs-0.12.118: ok')
