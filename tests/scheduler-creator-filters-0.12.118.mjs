// 0.12.118: the Scheduler page shows who created and who confirmed each schedule, filters by either (Core 1.17.63), and says that
// scheduled runs are not re-checked against their creator (Core 1.17.65, Johan's signed amendment of AD-13 condition 2). The query
// strings through the real src/scheduler.js with a stub fetch, the display rules, and the page wiring read from source.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'tok-1' : null), setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const calls = []
globalThis.fetch = async (url, options) => {
  calls.push({ url, options })
  return new Response('{"schedules":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
}
const schedulerSource = read('../src/scheduler.js')
  .replace(/from '[.][/]api'/, `from '${new URL('../src/api.js', import.meta.url).href}'`)
  .replace(/from '[.][/]scheduler-creators[.]js'/, `from '${new URL('../src/scheduler-creators.js', import.meta.url).href}'`)
const scheduler = await import(`data:text/javascript;base64,${Buffer.from(schedulerSource).toString('base64')}`)
const c = await import(new URL('../src/scheduler-creators.js', import.meta.url).href)

const urlOf = async (...args) => { calls.length = 0; await scheduler.listSchedules(...args); return calls[0].url }
const base = 'https://rmm.example.test/api/tfd/scheduler/schedules/'

// ---- the query for each filter and both; the plain call is what it was ----
assert.equal(await urlOf(), base, 'listSchedules() sends no query')
assert.equal(await urlOf('module'), `${base}?owner_type=module`, 'one argument is unchanged')
assert.equal(await urlOf(null, { createdBy: 'alice' }), `${base}?created_by=alice`)
assert.equal(await urlOf(null, { confirmedBy: 'bob' }), `${base}?confirmed_by=bob`)
assert.equal(await urlOf(null, { createdBy: 'alice', confirmedBy: 'bob' }), `${base}?created_by=alice&confirmed_by=bob`)
assert.equal(await urlOf('user', { createdBy: 'alice', confirmedBy: 'bob' }), `${base}?owner_type=user&created_by=alice&confirmed_by=bob`)
assert.equal(await urlOf(null, { createdBy: '  alice  ' }), `${base}?created_by=alice`, 'the name is trimmed')
assert.equal(await urlOf(null, { createdBy: 'Anne Marie+Co' }), `${base}?created_by=Anne%20Marie%2BCo`, 'a name is encoded')
assert.equal(await urlOf(null, { createdBy: '', confirmedBy: '   ' }), base, 'an empty box sends nothing')
assert.equal(await urlOf(null, {}), base)
assert.equal(await urlOf(null, undefined), base)
assert.equal(calls[0].options.headers.get('Authorization'), 'Token tok-1')
assert.deepEqual(c.cleanFilters({ createdBy: ' a ', confirmedBy: '' }), { createdBy: 'a' })
assert.equal(c.schedulesQuery(), '')

// ---- the names ----
assert.equal(c.createdByDisplay({ created_by_username: 'alice' }), 'alice')
assert.equal(c.createdByDisplay({ created_by_username: 'former.user' }), 'former.user', 'the stored name shows even when the user no longer exists')
assert.equal(c.createdByDisplay({ created_by_username: null }), 'Not recorded')
assert.equal(c.createdByDisplay({}), 'Not recorded')
assert.equal(c.createdByDisplay({ created_by_username: '  ' }), 'Not recorded')
assert.equal(c.confirmedByDisplay({ confirmed_by_username: 'bob' }), 'bob')
assert.equal(c.confirmedByDisplay({ confirmed_by_username: null }), 'Not recorded')
assert.equal(c.confirmedByDisplay(null), 'Not recorded')
assert.equal(c.NOT_RECORDED, 'Not recorded')

// ---- the one-line state, and the tab counts say they are filtered ----
assert.equal(c.filterStateSentence({ createdBy: 'alice' }), 'Showing schedules created by alice')
assert.equal(c.filterStateSentence({ confirmedBy: 'bob' }), 'Showing schedules confirmed by bob')
assert.equal(c.filterStateSentence({ createdBy: 'alice', confirmedBy: 'bob' }), 'Showing schedules created by alice and confirmed by bob')
assert.equal(c.filterStateSentence({}), '')
assert.equal(c.filterStateSentence({ createdBy: ' ' }), '')
assert.equal(c.tabCountLine(3, 2, false), '3 configured · 2 enabled')
assert.equal(c.tabCountLine(3, 2, true), '3 configured · 2 enabled · filtered')

// ---- the note, word for word (security wording, flagged for human review) ----
assert.equal(c.NOT_RECHECKED_NOTE, 'Scheduled runs are not re-checked against the person who created them, as in Tactical. Core checked their rights when the schedule was created or last edited. A schedule keeps running after its creator loses access, until someone removes or edits it.')
assert.match(c.SAVE_CONFIRMER_NOTE, /makes you its confirmer/)

// ---- the page ----
const view = read('../src/views/SchedulesView.vue')
assert.equal((view.match(/\{\{NOT_RECHECKED_NOTE\}\}/g) || []).length, 2, 'the note is above the table (both owner tabs share that section) and in the editor')
const tableSection = view.slice(view.indexOf(`<div v-if="tab==='user'||tab==='module'"`), view.indexOf(`<section v-else-if="tab==='user-history'`))
assert.ok(tableSection.indexOf('{{NOT_RECHECKED_NOTE}}') > 0 && tableSection.indexOf('{{NOT_RECHECKED_NOTE}}') < tableSection.indexOf('<table>'), 'on User and Module schedules, before the table, with no condition')
assert.ok(!/v-if="[^"]*"\s+class="state-inline warning scheduler-recheck-note"/.test(view), 'the note has no condition: it is always shown')
assert.match(view, /<th>Created by<\/th><th>Confirmed by<\/th>/)
assert.match(view, /\{\{createdByDisplay\(item\)\}\}/)
assert.match(view, /\{\{confirmedByDisplay\(item\)\}\}/)
assert.match(view, /placeholder="Created by…"/)
assert.match(view, /placeholder="Confirmed by…"/)
assert.match(view, /<form class="toolbar scheduler-toolbar mm-filters" role="search" @submit\.prevent="applyFilters">/, 'Enter or the Apply button applies')
assert.match(view, /<button class="btn" type="submit"[^>]*>Apply<\/button>/)
assert.match(view, /<button v-if="filterActive\|\|createdByInput\|\|confirmedByInput" class="btn" type="button" @click="clearFilters">Clear<\/button>/)
assert.match(view, /\{\{filterState\}\}/)
assert.match(view, /listSchedules\(null,appliedFilters\.value\)/, 'the list is read with the applied filters')
assert.match(view, /tabCountLine\(userSchedules\.length,userEnabledCount,filterActive\)/)
assert.match(view, /tabCountLine\(moduleSchedules\.length,moduleEnabledCount,filterActive\)/)
assert.match(view, /\{\{SAVE_CONFIRMER_NOTE\}\}/, 'the editor says saving makes you the confirmer')
assert.ok(!/v-html/.test(view), 'names are text')
assert.ok(!/created_by|confirmed_by/.test(view.replace(/created_by_username|confirmed_by_username/g, '')), 'the page never builds a filter body itself')

// ---- no change to create, update, delete or run-now ----
assert.match(schedulerSource, /export function createSchedule\(payload\)\{ return apiFetch\('\/api\/tfd\/scheduler\/schedules\/',\{method:'POST',body:JSON\.stringify\(payload\)\}\) \}/)
assert.match(schedulerSource, /export function updateSchedule\(id,payload\)\{ return apiFetch\(`\/api\/tfd\/scheduler\/schedules\/\$\{encodeURIComponent\(id\)\}\/`,\{method:'PATCH',body:JSON\.stringify\(payload\)\}\) \}/)
assert.match(schedulerSource, /export function deleteSchedule\(id,\{force=false\}=\{\}\)/)
assert.match(schedulerSource, /export function runScheduleNow\(id\)\{ return apiFetch\(`\/api\/tfd\/scheduler\/schedules\/\$\{encodeURIComponent\(id\)\}\/run\/`,\{method:'POST',body:JSON\.stringify\(\{\}\)\}\) \}/)
calls.length = 0
await scheduler.createSchedule({ name: 'n' })
await scheduler.updateSchedule('s 1', { enabled: false })
await scheduler.deleteSchedule('s1', { force: true })
await scheduler.runScheduleNow('s1')
assert.deepEqual(calls.map((x) => [x.options.method, x.url.replace('https://rmm.example.test', ''), x.options.body]), [
  ['POST', '/api/tfd/scheduler/schedules/', '{"name":"n"}'],
  ['PATCH', '/api/tfd/scheduler/schedules/s%201/', '{"enabled":false}'],
  ['DELETE', '/api/tfd/scheduler/schedules/s1/?force=true', undefined],
  ['POST', '/api/tfd/scheduler/schedules/s1/run/', '{}'],
])
// the payload the editor sends has no creator or confirmer: Core records them
assert.ok(!/created_by|confirmed_by/.test(view.slice(view.indexOf('function payload()'), view.indexOf('async function save()'))), 'the editor sends no creator or confirmer')
console.log('scheduler-creator-filters-0.12.118: ok')
