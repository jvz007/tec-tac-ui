// 0.12.125 (Core 1.17.104, phase 1b of docs/planning/module-auto-update/PLAN-MODULE-UPDATES.md): the module update badge on the
// Modules menu entry (module managers only, hidden on 403, loaded with the shell and never on a timer), the highlighted rows with
// the "Update available x.y.z (level)" chip, the https-only release-notes link, a blocked update showing its reason and no
// download button, the "Updates available" filter, and Core's "Module update available" notice shown by the existing bell path.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { moduleManagerSource } from './helpers/module-manager-source.mjs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const u = await import(new URL('../src/module-updates.js', import.meta.url).href)
const tables = await import(new URL('../src/module-manager-tables.js', import.meta.url).href)
const { DataTable } = await import(new URL('../src/shared-kit.js', import.meta.url).href)
const { coreNavigation } = await import(new URL('../src/core-navigation.js', import.meta.url).href)
const { createNotificationService } = await import(new URL('../src/notifications.js', import.meta.url).href)
const render = (vnode) => renderToString(createSSRApp({ render: () => vnode }))
const quietWarn = console.warn
console.warn = () => {}

const manager = { capabilities: { manage_modules: true }, user: { superuser: false } }
const superuser = { capabilities: {}, user: { superuser: true } }
const plain = { capabilities: { manage_modules: false }, user: { superuser: false } }

// ---- the helpers ----
assert.equal(u.canSeeModuleUpdates(manager), true)
assert.equal(u.canSeeModuleUpdates(superuser), true)
assert.equal(u.canSeeModuleUpdates(plain), false)
assert.equal(u.canSeeModuleUpdates({}), false)
assert.equal(u.updateChipText({ available_version: '1.3.0', level: 'minor' }), 'Update available 1.3.0 (minor)')
assert.equal(u.updateChipText({ available_version: '1.3.1', level: 'patch' }), 'Update available 1.3.1 (patch)')
assert.equal(u.updateChipText({ available_version: '2.0.0', level: 'major' }), 'Update available 2.0.0 (major)')
assert.equal(u.updateChipText({ available_version: '1.3.0-2', level: 'other' }), 'Update available 1.3.0-2', 'no bracket for other')
assert.equal(u.updateChipText({ available_version: '1.3.0', level: 'weird' }), 'Update available 1.3.0', 'an unknown level reads as other')
assert.equal(u.safeReleaseNotesUrl('https://example.test/notes/1.3.0'), 'https://example.test/notes/1.3.0')
for (const bad of ['http://example.test/n', 'javascript:alert(1)', 'https://user:pw@example.test/n', '/relative', '', null, 42, `https://e.test/${'a'.repeat(600)}`]) {
  assert.equal(u.safeReleaseNotesUrl(bad), null, `no link for ${String(bad).slice(0, 30)}`)
}
assert.equal(u.blockedReasonText({ installable: true, blocked_reason: 'x' }), '', 'an installable update has no reason')
assert.equal(u.blockedReasonText({ installable: false, blocked_reason: 'Needs Tec-Tac Core 1.17.110 or later.' }), 'Needs Tec-Tac Core 1.17.110 or later.')
assert.equal(u.blockedReasonText({ installable: false, blocked_reasons: [{ code: 'dependency_missing', message: 'Needs Groups.' }] }), 'Needs Groups.')
assert.equal(u.blockedReasonText({ installable: false }), 'This update cannot be installed yet.')
assert.equal(u.badgeText(0), '')
assert.equal(u.badgeText(3), '3')
assert.equal(u.badgeText(120), '99+')
assert.equal(u.badgeText('x'), '')

// ---- the store: routes, quiet reads, 403 hides, no permission sends nothing ----
const calls = []
let answer = null
const fetchJson = async (path, options) => {
  calls.push({ path, options })
  if (answer instanceof Error) throw answer
  return answer
}
const store = u.createModuleUpdates({ fetchJson })
answer = { count: 2, installable_count: 1, levels: { patch: 1, minor: 1 } }
await store.loadCount(manager)
assert.deepEqual(calls[0], { path: '/api/tfd/modules/updates/count/', options: { quiet: true } })
assert.equal(store.state.allowed, true)
assert.equal(store.state.count, 2)
assert.equal(store.state.installableCount, 1)

const forbidden = Object.assign(new Error('Forbidden'), { status: 403 })
answer = forbidden
await store.loadCount(manager)
assert.equal(store.state.allowed, false, 'a 403 hides the badge')
assert.equal(store.state.count, 0)

calls.length = 0
await store.loadCount(plain)
assert.equal(calls.length, 0, 'a person without module management sends nothing')
assert.equal(store.state.allowed, false)

answer = { count: 5 }
await store.loadCount(manager)
answer = Object.assign(new Error('Service unavailable'), { status: 503 })
await store.loadCount(manager)
assert.equal(store.state.count, 5, 'another failure keeps the last count')

const rows = [
  { module_id: 'wapm', name: 'WAPM', installed_version: '0.4.21', available_version: '0.4.22', level: 'patch', installable: true, blocked_reasons: [], blocked_reason: '', release_notes_url: 'https://modules.example.test/wapm/0.4.22', source_current: true },
  { module_id: 'groups', name: 'Groups', installed_version: '0.6.0', available_version: '0.7.0', level: 'minor', installable: false, blocked_reasons: [{ code: 'core_required', message: 'Needs Tec-Tac Core 1.17.110 or later.' }], blocked_reason: 'Needs Tec-Tac Core 1.17.110 or later.', release_notes_url: null, source_current: true },
  { module_id: '', name: 'bad row' },
]
calls.length = 0
answer = { updates: rows, count: 2, installable_count: 1, levels: { patch: 1, minor: 1 }, availability: {}, last_detection: null }
await store.loadList(manager)
assert.deepEqual(calls[0], { path: '/api/tfd/modules/updates/', options: { quiet: true } })
assert.equal(store.state.updates.length, 2, 'a row without module_id is dropped')
assert.equal(store.state.count, 2)
assert.equal(store.updateFor('groups').available_version, '0.7.0')
assert.equal(store.updateFor('missing'), null)
answer = forbidden
await store.loadList(manager)
assert.equal(store.state.updates.length, 0, 'a 403 empties the list')
assert.equal(store.state.error, '', 'a 403 is not an error message')
answer = { updates: rows.slice(0, 2), count: 2 }
await store.loadList(manager)
store.reset()
assert.equal(store.state.allowed, null)
assert.equal(store.state.updates.length, 0, 'sign-out clears the list')

// ---- the badge on the Modules entry ----
const modulesItem = (ctx, extras) => coreNavigation(ctx, extras).find((item) => item.to === '/modules')
assert.equal(modulesItem(manager, { moduleUpdateCount: 3 }).badge, '3')
assert.equal(modulesItem(manager, { moduleUpdateCount: 3 }).badgeTitle, '3 module updates available')
assert.equal(modulesItem(manager, { moduleUpdateCount: 1 }).badgeTitle, '1 module update available')
assert.equal(modulesItem(superuser, { moduleUpdateCount: 1 }).badge, '1')
assert.equal(modulesItem(plain, { moduleUpdateCount: 3 }).badge, undefined, 'no badge without module management')
assert.equal(modulesItem(manager, { moduleUpdateCount: 0 }).badge, undefined, 'no badge at 0')
assert.equal(modulesItem(manager).badge, undefined, 'the old call shape still works')
assert.equal(modulesItem(manager).visible, true)

const app = read('../src/App.vue')
assert.match(app, /coreNavigation\(state\.context, \{ moduleUpdateCount: moduleUpdates\?\.state\?\.allowed === false \? 0 : moduleUpdates\?\.state\?\.count \}\)/)
assert.match(app, /void moduleUpdates\?\.loadCount\?\.\(state\.context\)/, 'the count is loaded when the shell is ready')
assert.match(app, /moduleUpdates\?\.reset\?\.\(\)/, 'sign-out resets the count')
assert.doesNotMatch(app, /setInterval\([^)]*loadCount/, 'never on a timer')
assert.doesNotMatch(read('../src/module-updates.js'), /setInterval|setTimeout|localStorage|sessionStorage|Authorization/, 'no timer, no storage, no hand-built header')
const main = read('../src/main.js')
assert.match(main, /createModuleUpdates\(\{ fetchJson: apiFetch \}\)/, 'all calls go through api.js')
assert.match(main, /app\.provide\('tecTacModuleUpdates', moduleUpdates\)/)

// ---- the rows: chip, link, blocked reason, highlight ----
const diagnose = () => ({ state: 'loaded', label: 'loaded' })
const byId = new Map(rows.slice(0, 2).map((row) => [row.module_id, row]))
const installed = [
  { id: 'wapm', extension_version: '0.4.21', enabled: true, visible: true, status: 'enabled' },
  { id: 'groups', extension_version: '0.6.0', enabled: true, visible: true, status: 'enabled' },
  { id: 'agents', extension_version: '1.0.0', enabled: true, visible: true, status: 'enabled' },
]
const rowClass = (row) => (byId.has(row.id) ? 'mm-update-row' : '')
const html = await render(h(DataTable, { columns: tables.INSTALLED_COLUMNS, rows: installed, rowKey: 'id', rowClass, cell: tables.installedCell(diagnose, (item) => byId.get(item.id) || null) }))
assert.match(html, /Update available 0\.4\.22 \(patch\)/)
assert.match(html, /Update available 0\.7\.0 \(minor\)/)
assert.match(html, /<a class="mm-update-notes" href="https:\/\/modules\.example\.test\/wapm\/0\.4\.22" target="_blank" rel="noopener noreferrer">Release notes<\/a>/)
assert.equal((html.match(/Release notes/g) || []).length, 1, 'a null link shows no link')
assert.match(html, /<span class="sub mm-update-blocked">Needs Tec-Tac Core 1\.17\.110 or later\.<\/span>/)
assert.equal((html.match(/class="mm-update-row"/g) || []).length, 2, 'two rows highlighted')
assert.match(html, /<tr[^>]*data-row="agents"(?![^>]*mm-update-row)[^>]*>/, 'a module without an update is not highlighted')
// without the new argument the cell is what it was
const plainHtml = await render(h(DataTable, { columns: tables.INSTALLED_COLUMNS, rows: installed, rowKey: 'id', cell: tables.installedCell(diagnose) }))
assert.doesNotMatch(plainHtml, /Update available|mm-update/)
// markup in Core's data stays text
const evil = { module_id: 'wapm', available_version: '<img src=x onerror=alert(1)>', level: 'patch', installable: false, blocked_reason: '<b>no</b>', release_notes_url: 'javascript:alert(1)' }
const evilHtml = await render(h(DataTable, { columns: tables.INSTALLED_COLUMNS, rows: installed.slice(0, 1), rowKey: 'id', cell: tables.installedCell(diagnose, () => evil) }))
assert.ok(!evilHtml.includes('<img') && !evilHtml.includes('<b>no</b>') && !evilHtml.includes('javascript:'), 'escaped, no unsafe link')
// a bad class from rowClass is ignored, a throwing one too
const oddHtml = await render(h(DataTable, { columns: tables.INSTALLED_COLUMNS, rows: installed, rowKey: 'id', rowClass: (row) => (row.id === 'wapm' ? 'x" onclick="y' : (() => { throw new Error('no') })()), cell: tables.installedCell(diagnose) }))
assert.doesNotMatch(oddHtml, /onclick/)

// ---- the Online catalogue: a blocked update shows its reason and no button ----
const online = [
  { id: 'wapm', name: 'WAPM', installed: true, installed_version: '0.4.21', latest_version: '0.4.22', update_available: true, compatible: true },
  { id: 'groups', name: 'Groups', installed: true, installed_version: '0.6.0', latest_version: '0.7.0', update_available: true, compatible: true },
]
const onlineHtml = await render(h(DataTable, { columns: tables.ONLINE_COLUMNS, rows: online, rowKey: 'id', cell: tables.onlineCell({ stage() {}, blocked: () => false, update: (item) => byId.get(item.id) || null }) }))
assert.equal((onlineHtml.match(/>Download update<\/button>/g) || []).length, 1, 'only the installable update has a button')
assert.match(onlineHtml, /<span class="sub mm-update-blocked" title="Needs Tec-Tac Core 1\.17\.110 or later\.">Blocked<\/span>/)
assert.match(onlineHtml, /Update available 0\.7\.0 \(minor\)/)
const onlineOld = await render(h(DataTable, { columns: tables.ONLINE_COLUMNS, rows: online, rowKey: 'id', cell: tables.onlineCell({ stage() {}, blocked: () => false }) }))
assert.equal((onlineOld.match(/>Download update<\/button>/g) || []).length, 2, 'without update() the cell is what it was')

// ---- the page: the filter, the list load and the stage guard ----
const view = moduleManagerSource()
assert.match(view, /<label v-if="updatesVisible" class="compact-input mm-update-filter"><select v-model="updateFilter" aria-label="Filter by update"><option value="all">All modules<\/option><option value="updates">Updates available \(\{\{ updateRows\.length \}\}\)<\/option><\/select><\/label>/)
assert.match(view, /\.filter\(\(x\) => !updatesVisible\.value \|\| updateFilter\.value !== 'updates' \|\| updateById\.value\.has\(x\.id\)\)/)
assert.match(view, /:row-class="updateRowClass"/)
assert.match(view, /void moduleUpdates\?\.loadList\?\.\(state\.context\)/)
assert.match(view, /if \(item\?\.update_available && updateBlocked\(updateFor\(item\.id\)\)\) return/, 'a blocked update is never staged')
const filterRule = (updates, filter, list) => list.filter((x) => filter !== 'updates' || updates.has(x.id)).map((x) => x.id)
assert.deepEqual(filterRule(byId, 'updates', installed), ['wapm', 'groups'])
assert.deepEqual(filterRule(byId, 'all', installed), ['wapm', 'groups', 'agents'])

// ---- styles: tokens only ----
const css = read('../src/styles.css')
const block = css.slice(css.indexOf('/* 0.12.125: module updates'))
assert.ok(block.includes('.tt-table tbody tr.mm-update-row td'))
assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, 'no hex colour')

// ---- Core's notice uses the existing bell path: toast with "Open Modules" to /modules ----
globalThis.window = undefined
const pushed = []
let noticeRows = []
const notices = createNotificationService({
  api: async () => ({ notices: noticeRows, unread_count: noticeRows.length }),
  router: { push: async (to) => { pushed.push(to) } },
  userKey: () => 'u1',
})
// The first check of a page records the backlog; the notice arrives on the next check, as on a live page.
await notices.pollServerNotices()
noticeRows = [{ id: 'n1', source: 'core', level: 'info', title: 'Module update available', message: 'WAPM 0.4.21 to 0.4.22 (patch).', action: { label: 'Open Modules', route: '/modules' }, created_at: new Date().toISOString() }]
await notices.pollServerNotices()
const toast = notices.toasts.find((item) => item.title === 'Module update available')
assert.ok(toast, 'the Core module update notice toasts through the existing path')
assert.equal(toast.moduleId, 'core')
assert.equal(toast.level, 'info')
assert.equal(toast.action.route, '/modules')
assert.equal(toast.action.label, 'Open Modules')
assert.equal(notices.history.unreadCount, 1, 'the bell counts the notice')
await notices.invoke(toast.id)
assert.deepEqual(pushed, ['/modules'], 'Open Modules goes to the Modules page')
notices.stopServerNoticePolling?.()
notices.clearAll?.()

console.warn = quietWarn
console.log('module-updates-0.12.125: PASS')
