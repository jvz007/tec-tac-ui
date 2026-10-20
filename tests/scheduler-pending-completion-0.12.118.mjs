// 0.12.118: a Scheduler run that waits for a result (Core 1.17.61): the 'Waiting for the result' label with the kind in words and the
// start time, the plain words for Core's seven run error types, and nothing extra for a run with no completion or an older Core.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const c = await import(new URL('../src/scheduler-completion.js', import.meta.url).href)

// ---- the label, the kind and the time ----
const pending = { id: 'r1', status: 'running', completion: { state: 'pending', kind: 'module', since: '2026-10-20T08:00:00Z' } }
assert.deepEqual(c.pendingCompletion(pending), { label: 'Waiting for the result', kind: 'a module job', since: '2026-10-20T08:00:00Z' })
assert.equal(c.pendingCompletion({ completion: { state: 'pending', kind: 'server_maintenance_job', since: 'x' } }).kind, 'a server maintenance job')
assert.equal(c.pendingCompletion({ completion: { state: 'pending', kind: 'something_new', since: 'x' } }).kind, 'a job', 'an unknown kind reads as a job')
assert.equal(c.WAITING_LABEL, 'Waiting for the result')
assert.equal(c.pendingCompletion({ completion: { state: 'pending', kind: 'module' } }).since, '', 'a missing time is empty, not invented')

// completed, expired, null and an older Core draw nothing extra
assert.equal(c.pendingCompletion({ completion: { state: 'completed', kind: 'module', since: 'x' } }), null)
assert.equal(c.pendingCompletion({ completion: { state: 'expired', kind: 'module', since: 'x' } }), null)
assert.equal(c.pendingCompletion({ completion: null }), null)
assert.equal(c.pendingCompletion({}), null, 'an older Core sends no completion key')
assert.equal(c.pendingCompletion(null), null)
assert.equal(c.pendingCompletion({ completion: 'pending' }), null)

// ---- the seven error types ----
const types = ['CompletionTimeout', 'ExternalFailed', 'ExternalCancelled', 'ExternalTimedOut', 'PendingRefused', 'SystemActionRefused', 'OutcomeUnknown']
assert.deepEqual(Object.keys(c.ERROR_WORDS), types)
for (const type of types) {
  const words = c.errorWords(type)
  assert.notEqual(words, type, `${type} reads as a sentence`)
  assert.match(words, /^[A-Z].*\.$/, `${type} is a plain sentence`)
}
assert.equal(c.errorWords('SomethingElse'), 'SomethingElse', 'an unknown type is shown as sent')
assert.equal(c.errorWords(''), '')
assert.equal(c.errorWords(undefined), '')
assert.equal(c.errorWords('toString'), 'toString', 'an object property name is not a known type')

// ---- the page: the status badge still reads running, and the label is extra ----
const view = read('../src/views/SchedulesView.vue')
assert.match(view, /<span class="pill" :class="statusClass\(run\.status\)">\{\{run\.status\}\}<\/span>/, 'the status badge is unchanged and reads the run status')
assert.match(view, /<template v-if="pendingCompletion\(run\)"><span class="pill warn">\{\{pendingCompletion\(run\)\.label\}\}<\/span>/)
assert.match(view, /\{\{pendingCompletion\(run\)\.kind\}\}<template v-if="pendingCompletion\(run\)\.since"> · since \{\{nextLabel\(pendingCompletion\(run\)\.since\)\}\}<\/template>/, 'the kind and the start time (through formatDateTime)')
assert.match(view, /function nextLabel\(iso\)\{return iso\?formatDateTime\(iso\):'—'\}/, 'the time uses the shared date formatter')
assert.match(view, /<span v-if="run\.error_type" class="sub dangertext">\{\{errorWords\(run\.error_type\)\}\}<\/span>/, 'the error words sit under the status')
assert.equal(c.pendingCompletion({ status: 'running', completion: { state: 'pending', kind: 'module', since: 'x' } }) !== null && pending.status === 'running', true, 'the status stays running')
assert.ok(!/status\s*===\s*'waiting|'waiting'/.test(view + read('../src/scheduler-completion.js')), 'there is no new status value')
assert.ok(!/v-html/.test(view), 'text only')
console.log('scheduler-pending-completion-0.12.118: ok')
