// 0.12.111 (Core 1.17.41, reviews/requests/ui.md): the Online catalog tab reads availability and installed_only.
// Pure helpers in src/module-repository-info.js; the view shows every Core string with {{ }} and never v-html.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { moduleManagerSource } from './helpers/module-manager-source.mjs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { onlineAvailability, installedOnlyRows, INSTALLED_ONLY_LIMIT } = await import(new URL('../src/module-repository-info.js', import.meta.url).href)

// (a) onlineAvailability for each state
for (const state of ['no_repository', 'not_synced', 'sync_failed', 'empty']) {
  const r = onlineAvailability({ availability: { state, enabled_repositories: 2, synced_repositories: 0, installed_only_count: 0, message: `Message for ${state}.` } })
  assert.deepEqual(r, { state, message: `Message for ${state}.`, repositoriesLine: '0 of 2 repositories synced' }, state)
}
assert.deepEqual(onlineAvailability({ availability: { state: 'ready', enabled_repositories: 3, synced_repositories: 3, message: '' } }), { state: 'ready', message: '', repositoriesLine: '3 of 3 repositories synced' }, 'ready has an empty message')
assert.equal(onlineAvailability({ availability: { state: 'empty', message: 42 } }).message, '', 'a non-string message is ignored')
assert.equal(onlineAvailability({ availability: { state: 'empty', message: '   ' } }).message, '', 'a blank message is ignored')
assert.equal(onlineAvailability({ modules: [] }), null, 'no availability key: null')
assert.equal(onlineAvailability(undefined), null)
assert.equal(onlineAvailability({ availability: 'ready' }), null)
assert.equal(onlineAvailability({ availability: [] }), null)
for (const bad of [{ enabled_repositories: '2', synced_repositories: 1 }, { enabled_repositories: 2.5, synced_repositories: 1 }, { enabled_repositories: 2 }, { enabled_repositories: null, synced_repositories: null }]) {
  assert.equal(onlineAvailability({ availability: { state: 'ready', ...bad } }).repositoriesLine, '', 'counts that are not integers show no line')
}
assert.equal(onlineAvailability({ availability: { state: 'ready', message: '<b>x</b>' } }).message, '<b>x</b>', 'markup stays text')

// (b) installedOnlyRows
const rows = installedOnlyRows({ installed_only: [
  { id: 'a', name: 'Alpha', installed_version: '1.0.0', installed_source: 'local' },
  { id: 'b', name: null, installed_version: null, installed_source: null },
  { id: '<img onerror=x>', name: '<b>n</b>', installed_version: '2', installed_source: undefined },
  null,
] })
assert.deepEqual(rows[0], { id: 'a', name: 'Alpha', installed_version: '1.0.0', installed_source: 'local' })
assert.deepEqual(rows[1], { id: 'b', name: '—', installed_version: '—', installed_source: '—' }, 'null fields are dashes')
assert.equal(rows[2].id, '<img onerror=x>')
assert.equal(rows[2].name, '<b>n</b>')
assert.equal(rows[2].installed_source, '—')
assert.deepEqual(rows[3], { id: '—', name: '—', installed_version: '—', installed_source: '—' })
assert.deepEqual(rows.map((r) => r.id), ['a', 'b', '<img onerror=x>', '—'], 'order kept')
assert.equal(INSTALLED_ONLY_LIMIT, 200)
assert.equal(installedOnlyRows({ installed_only: Array.from({ length: 450 }, (_, i) => ({ id: `m${i}` })) }).length, 200, 'capped at 200')
assert.deepEqual(installedOnlyRows({}), [], 'missing key')
assert.deepEqual(installedOnlyRows({ installed_only: 'x' }), [], 'not a list')
assert.deepEqual(installedOnlyRows(undefined), [])

// (c) the view
const view = moduleManagerSource()
const start = view.indexOf("activeTab==='online'")
const tabStart = view.indexOf('<template v-else-if="activeTab===\'online\'">')
const tabEnd = view.indexOf('<template v-else-if="activeTab===\'repositories\'">')
assert.ok(tabStart > 0 && tabEnd > tabStart && start > 0)
const tab = view.slice(tabStart, tabEnd)
assert.ok(tab.includes('{{ onlineInfo.message }}'), 'availability.message is shown with {{ }}')
assert.ok(tab.includes('installed_only') === false && tab.includes('installedOnly'), 'the installed-only note reads its own list')
assert.ok(tab.includes('Installed here, not in any repository'))
assert.ok(tab.includes('{{ row.installed_source }}') && tab.includes('{{ row.installed_version }}'))
assert.equal(/v-html/.test(tab), false, 'no v-html in the online tab')
assert.ok(view.includes('{{ onlineCatalog.length }} modules · {{ updatesAvailable }} updates'), 'the tab counter still reads onlineCatalog.length')
const note = tab.slice(tab.indexOf('online-installed-only'))
assert.equal(/<button/.test(note), false, 'installed-only rows have no button')
assert.ok(tab.includes('No modules match your search.'))
assert.ok(tab.includes('No repositories configured.'), 'an older Core keeps the old line')
assert.ok(tab.includes('onlineInfo && !filteredOnline.length'), 'the no-match line only follows a Core that sent availability')
const filtered = view.match(/const filteredOnline = computed\([^\n]*\n/)[0]
assert.equal(/installed_only|installedOnly|onlineInfo/.test(filtered), false, 'search does not read the installed-only list')
assert.ok(filtered.includes('selected_repository_name'), 'filteredOnline unchanged')
assert.equal(/installedOnly/.test(view.match(/const updatesAvailable[^\n]*\n/)[0]), false, 'updates counter unchanged')
assert.ok(view.includes('onlineInfo.value = onlineAvailability(payload)'))
assert.ok(view.includes("const onlineCatalog = ref([])"))
assert.equal(fs.readFileSync(new URL('../src/modules.js', import.meta.url), 'utf8').includes('availability'), false, 'src/modules.js is unchanged')

console.log('online-catalog-availability-0.12.111: PASS')
