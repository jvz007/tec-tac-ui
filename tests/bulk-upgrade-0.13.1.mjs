// 0.13.1 (Core 1.18.35): select several modules in the Online catalog and upgrade them in one run. Covers who can be ticked, the
// selection, the exact request bodies, the plan view, the plain Yes or No, the 409 / 400 / 503 answers, the progress poll and the
// Stop button, text-only rendering, the unchanged single Download button and the Reload prompt.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const b = await import(new URL('../src/module-bulk-upgrade.js', import.meta.url).href)
const tables = await import(new URL('../src/module-manager-tables.js', import.meta.url).href)
const { DataTable } = await import(new URL('../src/shared-kit.js', import.meta.url).href)
const { createLatestRequestGate } = await import(new URL('../src/admin-session-state.js', import.meta.url).href)
const render = (vnode) => renderToString(createSSRApp({ render: () => vnode }))

// ---- eligibility ----
const repos = [{ id: 'lic', kind: 'licensing' }, { id: 'off', kind: 'official' }]
const row = (id, extra = {}) => ({ id, name: id.toUpperCase(), installed: true, installed_version: '1.0.0', latest_version: '1.1.0', update_available: true, compatible: true, selected_repository_id: 'lic', ...extra })
const blockedEntry = { module_id: 'blk', installable: false, blocked_reason: 'Needs Tec-Tac Core 1.18.40.' }
const ctx = { update: (item) => (item.id === 'blk' ? blockedEntry : null), repositories: repos }
const catalog = [
  row('a'), row('b'),
  row('blk'),
  row('ext', { selected_repository_id: 'off' }),
  row('bad', { compatible: false }),
  row('conf', { source_conflict: true }),
  row('new', { installed: false, update_available: false }),
  row('same', { update_available: false }),
  row('nover', { latest_version: '' }),
  row('norepo', { selected_repository_id: 'gone' }),
]
assert.deepEqual(b.bulkEligibility(row('a'), ctx), { eligible: true, reason: '' })
assert.deepEqual(b.bulkEligibility(row('blk'), ctx), { eligible: false, reason: 'Needs Tec-Tac Core 1.18.40.' }, 'a blocked update shows Core\'s reason')
assert.deepEqual(b.bulkEligibility(row('ext', { selected_repository_id: 'off' }), ctx), { eligible: false, reason: 'Upgrade on its own' })
for (const id of ['bad', 'conf', 'new', 'same', 'nover']) assert.equal(b.bulkEligibility(catalog.find((r) => r.id === id), ctx).eligible, false, `${id} is not eligible`)
assert.equal(b.bulkEligibility(catalog.find((r) => r.id === 'norepo'), ctx).eligible, false)
assert.deepEqual(b.eligibleIds(catalog, ctx), ['a', 'b'], 'select all picks exactly the eligible ids')
assert.equal(b.upgradeSelectedLabel(2), 'Upgrade selected (2)')
assert.equal(b.upgradeSelectedLabel(0), 'Upgrade selected (0)')
// ---- selection and pruning ----
let sel = b.toggleSelection([], 'a', true)
sel = b.toggleSelection(sel, 'b', true)
assert.deepEqual(sel, ['a', 'b'])
assert.deepEqual(b.toggleSelection(sel, 'a', false), ['b'])
assert.deepEqual(b.pruneSelection(['a', 'b', 'gone'], catalog, ctx), ['a', 'b'], 'an id that left the catalog is dropped')
assert.deepEqual(b.pruneSelection(['a', 'b'], catalog.filter((r) => r.id !== 'b'), ctx), ['a'])
assert.deepEqual(b.pruneSelection(['a', 'ext'], catalog, ctx), ['a'], 'an id that is no longer eligible is dropped')
// ---- the button is off when it must be ----
const on = { count: 2, canManage: true, jobRunning: false, inspecting: false, staged: null, runActive: false, busy: false }
assert.equal(b.upgradeSelectedDisabled(on), false)
for (const [k, v] of [['count', 0], ['canManage', false], ['jobRunning', true], ['inspecting', true], ['staged', {}], ['runActive', true], ['busy', true]]) assert.equal(b.upgradeSelectedDisabled({ ...on, [k]: v }), true, `${k} turns it off`)
// ---- request bodies ----
assert.deepEqual(b.planBody(['a', 'b']), { modules: ['a', 'b'], purpose: 'upgrade' })
assert.deepEqual(b.installBody(['a']), { modules: ['a'], purpose: 'upgrade' })
const plan = {
  ok: true, state: 'ok', purpose: 'upgrade',
  order: [{ id: 'b', name: 'B', version: '1.1.0', current_version: '1.0.0', action: 'replace' }, { id: 'a', name: 'A', version: '1.1.0', current_version: '1.0.0', action: 'replace' }, { id: 'dep', name: 'Dep', version: '2.0.0', current_version: '1.0.0', action: 'replace', added: true }],
  blocked: [{ id: 'x', name: 'X', code: 'other_source', message: 'This module comes from another source.' }],
  conflicts: [{ message: 'A needs Dep 2.' }], will_disable: [],
}
const view = b.planView(plan, ['a', 'b'])
assert.deepEqual(view.order.map((s) => s.id), ['b', 'a', 'dep'], 'the install order is Core\'s')
assert.equal(view.order[0].from, '1.0.0')
assert.equal(view.order[0].to, '1.1.0')
assert.deepEqual(view.runnable, ['b', 'a'], 'only selected ids that are in the order are sent, in Core\'s order')
assert.deepEqual(view.blocked, [{ id: 'x', name: 'X', message: 'This module comes from another source.' }])
assert.deepEqual(view.conflicts, ['A needs Dep 2.'])
assert.equal(view.canStart, true)
const sent = b.installBody(view.runnable)
assert.deepEqual(Object.keys(sent).sort(), ['modules', 'purpose'])
for (const key of ['order', 'version', 'licence_override_reason', 'disable_replaced']) assert.equal(key in sent, false, `${key} is never sent`)
// ok:false and empty order: no Yes
const refused = b.planView({ ok: false, state: 'licensing_unavailable', message: 'Licensing is not reachable.' }, ['a'])
assert.equal(refused.refused, true)
assert.equal(refused.message, 'Licensing is not reachable.')
assert.equal(refused.canStart, false)
const empty = b.planView({ ok: true, order: [], blocked: [{ id: 'x', message: 'No.' }] }, ['x'])
assert.equal(empty.empty, true)
assert.equal(empty.canStart, false)
assert.equal(empty.blocked.length, 1)
assert.equal(b.planView({ ...plan, will_disable: ['old'] }, ['a']).canStart, false, 'a run that switches modules off is not offered')
assert.deepEqual(b.planView({ ...plan, will_disable: ['old'] }, ['a']).willDisable, ['old'])
// ---- the confirm is the shell's plain Yes or No ----
const opts = b.confirmOptions(2, 1)
assert.equal(opts.question, 'Upgrade 2 modules now? Core upgrades them one after the other, in the order shown.')
assert.equal(opts.detail, '1 blocked module will not run.')
assert.equal(b.confirmOptions(1, 0).question.startsWith('Upgrade 1 module now?'), true)
assert.equal(b.confirmOptions(1, 0).detail, '')
const viewSrc = read('../src/views/ModulesView.vue')
const panelSrc = read('../src/components/modules/ModuleUpgradeRun.vue')
const stateSrc = read('../src/module-bulk-upgrade-state.js')
assert.match(stateSrc, /await deps\.confirm\(confirmOptions\(/, 'the handler asks through the shell confirm')
assert.match(viewSrc, /confirm: \(options\) => askConfirm\(options\)/, 'and the page gives it the shell confirm')
assert.doesNotMatch(panelSrc, /<input|<textarea|<select|v-model/, 'no typing in the plan or run panel')
// ---- errors ----
assert.deepEqual(b.bulkError({ status: 409, payload: { ok: false, state: 'run_in_progress', run_id: 'r1', message: 'x' } }), { kind: 'follow', runId: 'r1', message: 'Another upgrade run is going. Following it.' })
assert.equal(b.bulkError({ status: 409, payload: { state: 'run_in_progress', run_id: null } }).kind, 'message', 'no run id to follow')
assert.deepEqual(b.bulkError({ status: 400, payload: { state: 'nothing_to_install', message: 'None of the selected modules can be installed.' } }), { kind: 'message', message: 'None of the selected modules can be installed.' })
assert.deepEqual(b.bulkError({ status: 503, payload: { state: 'audit_not_saved', message: 'Core could not write the audit row, so nothing was started.' } }), { kind: 'message', message: 'Core could not write the audit row, so nothing was started.' })
assert.equal(b.bulkError({ status: 403, payload: { detail: 'You need module management rights.' } }).message, 'You need module management rights.')
assert.equal(b.bulkError({ status: 409, payload: { state: 'already_finished', message: 'This install run has finished.' } }).kind, 'stopped-done')
assert.equal(b.bulkError(new Error('boom')).message, 'boom')
// ---- progress view ----
const running = { run_id: 'r1', status: 'running', counts: { total: 3, succeeded: 1, failed: 0, skipped: 0 }, modules: [
  { id: 'a', name: 'A', version: '1.1.0', current_version: '1.0.0', state: 'succeeded', reason: null },
  { id: 'b', name: 'B', version: '1.1.0', current_version: '1.0.0', state: 'failed', reason: { code: 'install_failed', message: '<img src=x onerror=alert(1)>' } },
  { id: 'c', name: 'C', version: '2.0.0', current_version: '1.0.0', state: 'skipped', reason: { code: 'stopped', message: 'Stopped before this one.' } },
  { id: 'd', name: 'D', version: '1.0.1', state: 'downloading', reason: { message: 'ignored for a running row' } },
] }
const rv = b.runView(running)
assert.equal(rv.final, false)
assert.deepEqual(rv.counts, { total: 3, succeeded: 1, failed: 0, skipped: 0 })
assert.deepEqual(rv.modules.map((m) => m.state), ['succeeded', 'failed', 'skipped', 'downloading'])
assert.equal(rv.modules[0].change, '1.0.0 → 1.1.0')
assert.equal(rv.modules[3].reason, '', 'only failed or skipped rows carry a reason')
assert.equal(rv.anySucceeded, true)
assert.equal(b.runView({ status: 'stopping', stop_requested: true, modules: [] }).stopping, true)
for (const status of ['completed', 'stopped', 'interrupted']) assert.equal(b.runView({ status }).final, true)
assert.equal(b.runView({ status: 'running' }).final, false)
assert.equal(b.runView({ status: 'completed', counts: { failed: 2, total: 2 }, modules: [{ id: 'a', state: 'failed' }, { id: 'b', state: 'failed' }] }).anySucceeded, false, 'no reload prompt when nothing succeeded')
// text only: the panel escapes a hostile reason
const panelComp = (await import(new URL('../src/components/modules/ModuleUpgradeRun.vue', import.meta.url).href).catch(() => null))?.default
if (panelComp) {
  const html = await render(h(panelComp, { run: rv, plan: null }))
  assert.ok(!html.includes('<img'), 'a reason is escaped')
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.match(html, />Stop</, 'Stop shows while the run is going')
  assert.doesNotMatch(html, /Reload Tec-Tac/, 'no reload prompt while running')
  const done = await render(h(panelComp, { run: b.runView({ ...running, status: 'completed' }), plan: null }))
  assert.match(done, /Reload Tec-Tac to load the upgraded modules\./)
  assert.doesNotMatch(done, />Stop</)
  const none = await render(h(panelComp, { run: b.runView({ status: 'completed', counts: { failed: 1, total: 1 }, modules: [{ id: 'a', state: 'failed' }] }), plan: null }))
  assert.doesNotMatch(none, /Reload Tec-Tac/)
  const stopping = await render(h(panelComp, { run: b.runView({ status: 'stopping', stop_requested: true, modules: [] }), plan: null }))
  assert.match(stopping, /Stopping after the current module\./)
  const planHtml = await render(h(panelComp, { plan: view }))
  assert.match(planHtml, /A needs Dep 2\./)
  assert.match(planHtml, /This module comes from another source\./)
  assert.match(planHtml, /Upgrade 2 modules…/)
  assert.doesNotMatch(await render(h(panelComp, { plan: refused })), /Upgrade \d+ module/, 'ok:false has no Yes')
  assert.doesNotMatch(await render(h(panelComp, { plan: empty })), /Upgrade \d+ module/, 'an empty order has no Yes')
  assert.match(await render(h(panelComp, { plan: empty })), />Close</)
} else {
  // The SFC cannot be imported without the Vue plugin; check its source instead.
  assert.match(panelSrc, /\{\{ m\.reason \}\}/)
  assert.doesNotMatch(panelSrc, /v-html/)
}
assert.doesNotMatch(panelSrc + viewSrc, /v-html/, 'no v-html')

// ---- the poll ----
const fake = () => {
  const timers = new Map(); let n = 0
  return { timers, schedule: (fn) => { const id = ++n; timers.set(id, fn); return id }, cancel: (id) => timers.delete(id), async fire() { const [id, fn] = [...timers][0] || []; if (!fn) return false; timers.delete(id); await fn(); return true } }
}
async function pollWith(answers) {
  const clock = fake(); const seen = []; const finals = []; const gate = createLatestRequestGate(); let calls = 0
  const poller = b.createRunPoller({ gate, schedule: clock.schedule, cancel: clock.cancel, fetchRun: async () => { const a = answers[Math.min(calls++, answers.length - 1)]; if (a instanceof Error) throw a; return a }, onRun: (v) => seen.push(v.status), onFinal: (v) => finals.push(v.status) })
  return { poller, clock, seen, finals, calls: () => calls }
}
for (const last of ['completed', 'stopped', 'interrupted']) {
  const t = await pollWith([{ status: 'running' }, { status: 'stopping' }, { status: last }])
  t.poller.start('r1')
  await new Promise((r) => setTimeout(r, 0))
  while (await t.clock.fire()) await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(t.seen, ['running', 'stopping', last])
  assert.deepEqual(t.finals, [last], `the poll ends on ${last}`)
  assert.equal(t.clock.timers.size, 0, 'no timer is left')
  assert.equal(t.poller.active, false)
}
{
  const t = await pollWith([{ status: 'running' }])
  t.poller.start('r1')
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(t.clock.timers.size, 1, 'a timer waits for the next poll')
  t.poller.stop()
  assert.equal(t.clock.timers.size, 0, 'unmount clears the timer')
  assert.equal(t.poller.active, false)
}
{
  // a failed poll goes on; a late answer from a stopped poll is dropped
  const t = await pollWith([new Error('net'), { status: 'completed' }])
  t.poller.start('r1')
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(t.clock.timers.size, 1)
  await t.clock.fire(); await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(t.finals, ['completed'])
  let release; const gate = createLatestRequestGate(); const got = []
  const late = b.createRunPoller({ gate, fetchRun: () => new Promise((r) => { release = r }), onRun: (v) => got.push(v.status), onFinal: () => got.push('final') })
  late.start('r2'); late.stop(); release({ status: 'completed' }); await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(got, [], 'a late answer is dropped')
}
assert.equal(b.RUN_POLL_MS, 3000)

// ---- the api calls: routes and bodies ----
const modulesSrc = read('../src/modules.js')
for (const route of ['/api/tfd/modules/catalog/online/plan/', '/api/tfd/modules/catalog/online/install/', '/api/tfd/modules/catalog/online/install/${encodeURIComponent(runId)}/', '/api/tfd/modules/catalog/online/install/${encodeURIComponent(runId)}/stop/']) assert.ok(modulesSrc.includes(route), `modules.js calls ${route}`)
assert.match(modulesSrc, /export function stopOnlineUpgradeRun[^\n]*method:'POST'/)
assert.match(modulesSrc, /export function getOnlineUpgradeRun[^\n]*rejectErrorPayload:false/, 'a run answer with a message field is not read as an error')

// ---- the page wiring ----
assert.match(viewSrc, /bulkPoller\.stop\(\)/, 'the poll is stopped on unmount')
assert.match(viewSrc, /onBeforeUnmount\(\(\) => \{ bulkPoller\.stop\(\)/)
assert.match(viewSrc, /Select all upgradable/)
assert.match(viewSrc, /Clear selection/)
assert.match(viewSrc, /upgradeSelectedLabel\(bulkSelected\.length\)/)
assert.match(viewSrc, /stage: \(item\) => requestStageOnline\(item\)/, 'the single Download button is wired as before')
assert.match(viewSrc, /inspecting\.value \|\| bulkRunActive\.value/, 'the single Download is off while a run is active')
assert.match(viewSrc, /if \(bulkRunActive\.value\) return\n/, 'staging is refused while a run is active')
assert.doesNotMatch(stateSrc, /location|reload\(\)|reloadTecTac/, 'nothing reloads by itself after a run')
assert.equal((viewSrc.match(/reloadTecTac/g) || []).length >= 2, true)
assert.match(viewSrc, /@reload="reloadTecTac"/, 'the Reload button uses the existing reload')
assert.doesNotMatch(read('../src/module-bulk-upgrade.js') + stateSrc + modulesSrc.slice(modulesSrc.indexOf('0.13.1')), /localStorage|sessionStorage|Authorization|headers/, 'no storage, no hand-built headers')
assert.match(stateSrc, /onFinal: \(\) => \{.*deps\.reloadLists\(\)/, 'the lists reload after the run')
assert.match(viewSrc, /reloadLists: \(\) => Promise\.all\(\[refresh\(selectedId\.value\), loadOnlineCatalog\(\)\]\)/)

// ---- the table: the tick column, and the old call still draws the same ----
const hooks = { stage() {}, blocked: () => false }
const base = await render(h(DataTable, { columns: tables.ONLINE_COLUMNS, rows: catalog.slice(0, 2), rowKey: 'id', cell: tables.onlineCell(hooks) }))
const oldWithSelectColumn = await render(h(DataTable, { columns: tables.ONLINE_SELECT_COLUMNS, rows: catalog.slice(0, 2), rowKey: 'id', cell: tables.onlineCell(hooks) }))
assert.doesNotMatch(base, /mm-bulk-check/)
assert.doesNotMatch(oldWithSelectColumn, /mm-bulk-check/, 'without the hooks the tick column draws nothing')
assert.deepEqual(tables.ONLINE_SELECT_COLUMNS.map((c) => c.key), ['select', ...tables.ONLINE_COLUMNS.map((c) => c.key)])
const picked = []
const full = tables.onlineCell({ ...hooks, selectable: (item) => b.bulkEligibility(item, ctx), selected: (item) => item.id === 'a', select: (item, v) => picked.push([item.id, v]) })
const tableHtml = await render(h(DataTable, { columns: tables.ONLINE_SELECT_COLUMNS, rows: catalog.slice(0, 4), rowKey: 'id', cell: full }))
assert.equal((tableHtml.match(/mm-bulk-check/g) || []).length, 2, 'only a and b have a checkbox')
assert.match(tableHtml, /<input[^>]*checked[^>]*aria-label="Select A for upgrade"|<input[^>]*aria-label="Select A for upgrade"[^>]*checked/, 'a is ticked')
assert.match(tableHtml, /Needs Tec-Tac Core 1\.18\.40\./, 'a blocked row shows its reason')
assert.match(tableHtml, /Upgrade on its own/, 'a non-licensing row shows the short reason')
assert.equal((tableHtml.match(/>Download update<\/button>/g) || []).length, 4, 'the single Download update stays on every row (this call passes no update hook, so a blocked row keeps it too)')
const disabledHtml = await render(h(DataTable, { columns: tables.ONLINE_SELECT_COLUMNS, rows: catalog.slice(0, 2), rowKey: 'id', cell: tables.onlineCell({ ...hooks, selectable: (item) => b.bulkEligibility(item, ctx), selectDisabled: () => true }) }))
assert.match(disabledHtml, /<input[^>]*disabled/, 'the box is off during a run')
assert.equal(picked.length, 0)
console.log('bulk-upgrade-0.13.1: PASS')
