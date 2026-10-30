// 0.12.123 (Core 1.17.97): schedules whose owner module is not installed. The query string and filter rules, the five api calls through a
// stub fetch (exact URL, method, body), the plain error sentences, the badge and button rules, and the page wiring read from source.
// Schedules of a disabled module never arrive from Core 1.17.97, so the page has no code for them.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'tok-1' : null), setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const calls = []
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options })
  return new Response('{"modules":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
}
const schedulerSource = read('../src/scheduler.js')
  .replace(/from '[.][/]api'/, `from '${new URL('../src/api.js', import.meta.url).href}'`)
  .replace(/from '[.][/]scheduler-creators[.]js'/, `from '${new URL('../src/scheduler-creators.js', import.meta.url).href}'`)
const scheduler = await import(`data:text/javascript;base64,${Buffer.from(schedulerSource).toString('base64')}`)
const c = await import(new URL('../src/scheduler-creators.js', import.meta.url).href)
const o = await import(new URL('../src/scheduler-orphaned.js', import.meta.url).href)

// ---- (a) the query: orphaned is added last and only when true; every older combination is unchanged ----
assert.equal(c.schedulesQuery(), '')
assert.equal(c.schedulesQuery(null, {}), '')
assert.equal(c.schedulesQuery('user'), '?owner_type=user')
assert.equal(c.schedulesQuery(null, { createdBy: 'alice' }), '?created_by=alice')
assert.equal(c.schedulesQuery(null, { confirmedBy: 'bob' }), '?confirmed_by=bob')
assert.equal(c.schedulesQuery('module', { createdBy: 'a b', confirmedBy: 'c&d' }), '?owner_type=module&created_by=a%20b&confirmed_by=c%26d')
assert.equal(c.schedulesQuery(null, { orphaned: true }), '?orphaned=true')
assert.equal(c.schedulesQuery('module', { createdBy: 'alice', confirmedBy: 'bob', orphaned: true }), '?owner_type=module&created_by=alice&confirmed_by=bob&orphaned=true')
assert.equal(c.schedulesQuery(null, { orphaned: false }), '')
assert.equal(c.schedulesQuery(null, { orphaned: 'true' }), '', 'only the boolean true counts')
assert.deepEqual(c.cleanFilters({ orphaned: true }), { orphaned: true })
assert.deepEqual(c.cleanFilters({ orphaned: false, createdBy: ' alice ' }), { createdBy: 'alice' })
assert.deepEqual(c.cleanFilters({ orphaned: 1 }), {})
assert.equal(c.filterStateSentence({ orphaned: true }), 'Showing schedules whose owner module is not installed')
assert.equal(c.filterStateSentence({ createdBy: 'alice', orphaned: true }), 'Showing schedules created by alice whose owner module is not installed')
assert.equal(c.filterStateSentence({ createdBy: 'alice', confirmedBy: 'bob', orphaned: true }), 'Showing schedules created by alice and confirmed by bob whose owner module is not installed')
assert.equal(c.filterStateSentence({ createdBy: 'alice', confirmedBy: 'bob' }), 'Showing schedules created by alice and confirmed by bob')
assert.equal(c.tabCountLine(1, 1, true), '1 configured · 1 enabled · filtered')

// ---- (b) the api layer ----
calls.length = 0
await scheduler.listSchedules()
assert.equal(calls[0].url, 'https://rmm.example.test/api/tfd/scheduler/schedules/', 'the default URL is unchanged')
await scheduler.listSchedules('module', { createdBy: 'a' })
assert.equal(calls[1].url, 'https://rmm.example.test/api/tfd/scheduler/schedules/?owner_type=module&created_by=a')
await scheduler.listSchedules(null, { orphaned: true })
assert.equal(calls[2].url, 'https://rmm.example.test/api/tfd/scheduler/schedules/?orphaned=true')
calls.length = 0
await scheduler.listOrphanedSchedules()
await scheduler.disableOrphanedSchedule('11111111-2222')
await scheduler.removeOrphanedSchedule('11111111-2222')
await scheduler.disableOrphanedModule('patch/management')
await scheduler.removeOrphanedModule('patch/management')
const B = 'https://rmm.example.test/api/tfd/scheduler/orphaned/'
assert.equal(calls[0].url, B); assert.equal(calls[0].options.method || 'GET', 'GET'); assert.equal(calls[0].options.body, undefined)
assert.equal(calls[1].url, `${B}11111111-2222/disable/`); assert.equal(calls[1].options.method, 'POST'); assert.equal(calls[1].options.body, '{}')
assert.equal(calls[2].url, `${B}11111111-2222/`); assert.equal(calls[2].options.method, 'DELETE'); assert.equal(calls[2].options.body, undefined)
assert.equal(calls[3].url, `${B}modules/patch%2Fmanagement/disable/`); assert.equal(calls[3].options.method, 'POST'); assert.equal(calls[3].options.body, '{"confirm":true}')
assert.equal(calls[4].url, `${B}modules/patch%2Fmanagement/`); assert.equal(calls[4].options.method, 'DELETE'); assert.equal(calls[4].options.body, '{"confirm":true}')
const confirmBodies = calls.filter((x) => String(x.options.body || '').includes('confirm'))
assert.equal(confirmBodies.length, 2, '{"confirm":true} goes only on the two bulk calls')

// ---- (c) the words ----
const err = (status, code, extra = {}, message = '') => Object.assign(new Error(message), { status, payload: { code, ...extra } })
assert.equal(o.orphanedErrorWords(err(403, '', { detail: 'You are outside the scope of this schedule.' })), 'You are outside the scope of this schedule.')
assert.match(o.orphanedErrorWords(err(403, '')), /not a Scheduler manager/)
assert.equal(o.orphanedErrorWords(err(409, 'owner_module_installed')), 'The module is installed again, or Core cannot tell. Reload the list.')
assert.equal(o.orphanedErrorWords(err(409, 'active_runs')), 'A run is queued or running. Try again when it has ended.')
assert.equal(o.orphanedErrorWords(err(409, 'active_runs', { active_runs: 3 })), '3 runs are queued or running. Try again when they have ended.')
assert.equal(o.orphanedErrorWords(err(409, 'active_runs', { active_runs: 1 })), '1 run is queued or running. Try again when it has ended.')
assert.match(o.orphanedErrorWords(err(409, 'something_else')), /Reload the list/)
assert.equal(o.orphanedErrorWords(err(503, 'audit_unavailable')), 'Nothing was changed because the audit row could not be written.')
assert.match(o.orphanedErrorWords(err(400, 'confirmation_required')), /Nothing was changed/)
assert.match(o.orphanedErrorWords(err(404, 'not_found')), /Reload the list/)
assert.equal(o.orphanedErrorWords(new Error('Network down')), 'Network down')
assert.match(o.orphanedErrorWords({}), /Nothing was changed/)
assert.match(o.orphanedErrorWords(null), /Nothing was changed/)
const markup = o.orphanedErrorWords(err(403, '', { detail: '<img src=x onerror=alert(1)>Not allowed' }))
assert.ok(!/[<>]/.test(markup), `no markup survives: ${markup}`)
assert.ok(o.orphanedErrorWords(err(403, '', { detail: 'x'.repeat(2000) })).length <= 300, 'long text is cut')
assert.equal(o.bulkResultSentence({ module_id: 'patchmanagement', count: 4, mode: 'remove', skipped_out_of_scope: 1 }), 'Removed 4 schedules of patchmanagement. 1 outside your scope was left alone.')
assert.equal(o.bulkResultSentence({ module_id: 'patchmanagement', count: 1, mode: 'disable', skipped_out_of_scope: 0 }), 'Disabled 1 schedule of patchmanagement.')
assert.equal(o.bulkResultSentence({ module_id: 'm', count: 2, mode: 'disable', skipped_out_of_scope: 2 }), 'Disabled 2 schedules of m. 2 outside your scope were left alone.')
assert.equal(o.outOfScopeLine(3), '3 schedules are outside your scope and are not listed')
assert.equal(o.outOfScopeLine(1), '1 schedule is outside your scope and is not listed')
assert.equal(o.outOfScopeLine(0), '')
const q = o.bulkQuestion('remove', 'patchmanagement', 4)
assert.equal(q.question, 'Remove 4 schedules of patchmanagement?')
assert.match(q.detail, /deleted/); assert.match(q.detail, /Run history stays/); assert.equal(q.danger, true)
assert.equal(o.bulkQuestion('disable', 'patchmanagement', 1).question, 'Disable 1 schedule of patchmanagement?')

// ---- (d) buttons ----
const orphan = { id: 'a', orphaned: true, enabled: true }
assert.equal(o.canManageOrphan(orphan, true, false), true)
assert.equal(o.canManageOrphan(orphan, false, false), false, 'not a manager')
assert.equal(o.canManageOrphan(orphan, undefined, false), false)
assert.equal(o.canManageOrphan(orphan, true, true), false, 'the registry could not be read')
assert.equal(o.canManageOrphan({ id: 'b', orphaned: false }, true, false), false, 'not an orphaned row')
assert.equal(o.canManageOrphan({ id: 'b' }, true, false), false)
assert.equal(o.canManageOrphan(null, true, false), false)

// ---- (e) the badge ----
assert.equal(o.orphanedBadge({ orphaned: true, orphan_label: 'Owner module not installed' }), 'Owner module not installed')
assert.equal(o.orphanedBadge({ orphaned: true, orphan_label: 'Module gone' }), 'Module gone', "Core's label wins")
assert.equal(o.orphanedBadge({ orphaned: true }), 'Owner module not installed', 'the fixed words are the fallback')
assert.equal(o.orphanedBadge({ orphaned: true, orphan_label: '   ' }), 'Owner module not installed')
assert.equal(o.orphanedBadge({ orphaned: false, orphan_label: 'x' }), '')
assert.equal(o.orphanedBadge({}), '')
assert.ok(!/[<>]/.test(o.orphanedBadge({ orphaned: true, orphan_label: '<b>gone</b>' })))

// ---- (f) the page, read from source ----
const view = read('../src/views/SchedulesView.vue')
assert.match(view, /import \{[^}]*removeOrphanedSchedule[^}]*\} from '\.\.\/scheduler'/)
assert.match(view, /askConfirm\(\{question:`Remove schedule \$\{item\.name\}\?`/, 'Remove asks the plain Yes or No')
assert.match(view, /askConfirm\(bulkQuestion\(mode,m\.module_id,m\.count\)\)/, 'the bulk calls ask first, naming the module and the count')
assert.ok(view.indexOf('askConfirm(bulkQuestion') < view.indexOf('removeOrphanedModule(m.module_id)'), 'the question comes before the bulk call')
assert.ok(!/<input[^>]*v-model="(typed|confirmText|confirmName|confirmInput)/i.test(view), 'no typed confirmation')
assert.doesNotMatch(view, /localStorage|sessionStorage/)
assert.doesNotMatch(view, /Authorization|headers\s*:/)
assert.doesNotMatch(view, /\bfetch\(|apiFetch|from '\.\.\/api'/, 'the page calls nothing but src/scheduler.js')
assert.doesNotMatch(view, /v-html/)
assert.match(view, /s\.manage===true/)
assert.match(view, /item\.orphaned===true\) ?return|item\.orphaned===true\)return/, 'an orphaned row does not open the editor')
assert.match(view, /:disabled="!item\.action_available\|\|item\.orphaned===true"/, 'Run now is off for an orphaned row')
assert.match(view, /v-if="item\.enabled!==false"/, 'Disable is hidden once the schedule is disabled')
assert.match(view, /v-if="showOrphanPanel"/)
assert.match(view, /manage\.value&&\(registryUnreadable\.value\|\|orphanedModules\.value\.length>0\)/, 'the panel needs a manager and a listed module (or the registry notice)')
assert.match(view, /<template v-if="registryUnreadable">[^]*?<template v-else>/, 'no button inside the panel when the registry is unreadable')
assert.match(view, /moduleStateUnreadable/)
assert.match(view, /Owner module not installed<\/label>|Owner module not installed<\/label><button/)
assert.doesNotMatch(view, /disabled module|owner module disabled/i, 'nothing is built for a disabled module (Core hides them)')
const loadFn = view.slice(view.indexOf('async function loadOrphaned'), view.indexOf('async function refresh'))
assert.match(loadFn, /catch\(e\)\{[^}]*orphanedError\.value=orphanedErrorWords\(e\)/, 'a failed bulk list shows plain words and does not block the list')

// ---- (g) the Core requirement ----
const manifest = JSON.parse(read('../tec_tac_package.json'))
assert.equal(manifest.requires['tec-tac-framework'], '>=1.17.97,<2.0.0')
assert.match(read('../src/help/articles/schedules.md'), /Owner module not installed/)
console.log('scheduler-orphaned-0.12.123: ok')
