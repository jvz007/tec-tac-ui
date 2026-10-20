// 0.12.118: the Module Manager on the brand board's patterns (docs/ui-brand-board). Installed, Online catalog, Repositories and History
// are P1 list pages on the shared kit DataTable; repository add and edit is a P4 input dialog; the confirmations stay the plain shell
// Yes or No. No behaviour changed: every handler the old template wired is still wired. Only tokens, no hex colour, no raw px font size.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const view = read('../src/views/ModulesView.vue')
const tables = await import(new URL('../src/module-manager-tables.js', import.meta.url).href)
const { DataTable } = await import(new URL('../src/shared-kit.js', import.meta.url).href)
const tablesSource = read('../src/module-manager-tables.js')

// ---- each tab renders the kit DataTable (P1) or the P4 dialog ----
const sections = {
  installed: view.slice(view.indexOf(`<template v-if="activeTab==='installed'">`), view.indexOf(`<template v-else-if="activeTab==='online'">`)),
  online: view.slice(view.indexOf(`<template v-else-if="activeTab==='online'">`), view.indexOf(`<template v-else-if="activeTab==='repositories'">`)),
  repositories: view.slice(view.indexOf(`<template v-else-if="activeTab==='repositories'">`), view.indexOf(`<template v-else-if="activeTab==='hotfixes'">`)),
}
assert.match(sections.installed, /<DataTable :columns="INSTALLED_COLUMNS" :rows="installedRows" row-key="id"/, 'Installed is a P1 table')
assert.match(sections.online, /<DataTable v-else :columns="ONLINE_COLUMNS" :rows="onlineRows" row-key="id"/, 'Online catalog is a P1 table')
assert.match(sections.repositories, /<DataTable v-else :columns="REPOSITORY_COLUMNS" :rows="repositoryRows" row-key="id"/, 'Repositories is a P1 table')
assert.match(read('../src/components/modules/ModuleJobHistory.vue'), /<DataTable\s+v-else\s+:columns="columns"/, 'History is a P1 table')
for (const [name, section] of Object.entries(sections)) assert.ok(!/<table>/.test(section), `${name} has no hand-built table`)
assert.match(view, /import \{ DataTable \} from '\.\.\/shared-kit'/)
// P1 parts: search box, category filter, count and paging footer, sortable headers, Enter or right-click to open
assert.match(sections.installed, /placeholder="Search modules…"/)
assert.match(sections.installed, /aria-label="Filter by category"/)
assert.match(sections.installed, /:footer="installedFooter"/)
assert.match(sections.installed, /@activate="\(row\) => selectedId = row\.id" @rowmenu="\(row\) => selectedId = row\.id"/, 'Enter, double-click and right-click open the detail')
assert.match(sections.installed, /@sort="\(key, dir\) => setSort\(installedSort, key, dir\)"/)
assert.match(sections.online, /placeholder="Search online catalog…"/)
assert.match(sections.online, /:footer="onlineFooter"/)
assert.match(sections.repositories, /@activate="editRepository" @rowmenu="editRepository"/)
assert.ok(tables.INSTALLED_COLUMNS.filter((c) => c.sortable).length >= 6, 'sortable headers')
assert.match(read('../src/components/modules/ModuleJobHistory.vue'), /Module id…/)
assert.match(read('../src/components/modules/ModuleJobHistory.vue'), /Page \{\{ meta\.page \}\} \/ \{\{ meta\.pages \}\}/, 'a paging footer on History')

// P4: repository add and edit is an input dialog, not an inline card
assert.match(sections.repositories, /<div v-if="editingRepository" class="modal-backdrop" @click\.self="cancelRepositoryEdit" @keydown\.esc\.stop\.prevent="cancelRepositoryEdit"><section class="modal-panel repository-editor" role="dialog" aria-modal="true" aria-labelledby="repository-dialog-title">/)
assert.ok(!/<aside v-if="editingRepository"/.test(view), 'the inline repository card is gone')
for (const field of ['repositoryDraft.name', 'repositoryDraft.url', 'repositoryDraft.priority', 'repositoryDraft.trust', 'repositoryDraft.enabled']) assert.ok(sections.repositories.includes(`v-model="${field}"`) || sections.repositories.includes(`v-model.number="${field}"`), `${field} is still edited`)
assert.match(sections.repositories, /<button class="btn primary" :disabled="!canManage \|\| repositoryBusy \|\| !repositoryDraft\.name \|\| !repositoryDraft\.url" @click="saveRepository">Save<\/button><button class="btn" @click="cancelRepositoryEdit">Cancel<\/button><button v-if="selectedRepository" class="btn danger" :disabled="!canManage \|\| repositoryBusy" @click="removeRepository\(selectedRepository\)">Remove<\/button>/)
assert.match(sections.repositories, /Skipped entries/, 'the skipped entries stay in the dialog')

// ---- the cells are text or small elements: markup in Core's data stays text ----
const render = (vnode) => renderToString(createSSRApp({ render: () => vnode }))
const diagnose = () => ({ state: 'loaded', label: 'loaded' })
const evilRow = { id: '<img src=x onerror=alert(1)>', extension_version: '1.0.0', enabled: true, visible: true, status: 'enabled', dependencies: { a: '>=1' }, dependants: [{ id: 'b' }], category: 'core', replaces: '<b>old</b>' }
const cell = tables.installedCell(diagnose)
const html = await render(h(DataTable, { columns: tables.INSTALLED_COLUMNS, rows: [evilRow], rowKey: 'id', cell }))
assert.ok(!html.includes('<img'), 'a module id with markup is escaped')
assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
assert.ok(!html.includes('<b>old</b>'), 'the replaces label is escaped')
assert.match(html, /<span class="pill ok">enabled<\/span>/)
assert.match(html, /<span class="pill ">Core<\/span>|<span class="pill">Core<\/span>/, 'the category pill')
assert.match(html, /<th[^>]*scope="col"[^>]*>Module<\/th>/)
assert.match(html, /aria-sort|class="sortable/, 'sortable headers are marked')
const onlineHtml = await render(h(DataTable, { columns: tables.ONLINE_COLUMNS, rows: [{ id: 'agents', name: 'Agents', installed: true, installed_version: '1', latest_version: '2', update_available: true, compatible: true, selected_repository_name: 'Official', channel: 'stable' }], rowKey: 'id', cell: tables.onlineCell({ stage() {}, blocked: () => false }) }))
assert.match(onlineHtml, /Download update/)
assert.match(onlineHtml, /update available/)
assert.match(onlineHtml, />stable</)
const repoHtml = await render(h(DataTable, { columns: tables.REPOSITORY_COLUMNS, rows: [{ id: 'r1', name: 'Main', trust: 'official', priority: 10, enabled: false, sync: { status: 'error', error: 'bad index', module_count: 3 } }], rowKey: 'id', cell: tables.repositoryCell({ sync() {}, disabled: () => true }) }))
assert.match(repoHtml, /Enable it to sync\./)
assert.match(repoHtml, /bad index/)
assert.match(repoHtml, /<button[^>]*disabled[^>]*>Sync<\/button>/)
// sorting never changes the input and respects the direction
const rowsIn = [{ id: 'b', dependants: [1, 2] }, { id: 'a', dependants: [] }, { id: 'c', dependants: [1] }]
assert.deepEqual(tables.sortRows(rowsIn, 'id', 'ascending').map((r) => r.id), ['a', 'b', 'c'])
assert.deepEqual(tables.sortRows(rowsIn, 'dependants', 'descending').map((r) => r.id), ['b', 'c', 'a'])
assert.deepEqual(tables.sortRows(rowsIn, 'id', null).map((r) => r.id), ['b', 'a', 'c'], 'no direction keeps the order')
assert.deepEqual(rowsIn.map((r) => r.id), ['b', 'a', 'c'], 'the input is not changed')
assert.deepEqual(tables.sortRows(rowsIn, 'unknown-key', 'ascending').map((r) => r.id), ['b', 'a', 'c'])

// ---- every handler the old template wired is still wired ----
const wired = [
  `@click="install"`, `@click="clearStaged"`, `@click="inspectPending"`, `@click="clearPending"`, `@click="pick"`,
  `@click="setVisibility(selected,false)"`, `@click="setVisibility(selected,true)"`, `@click="ask(selected,'disable')"`, `@click="ask(selected,'enable')"`, `@click="ask(selected,'remove')"`,
  `@click="openSelectedModule"`, `@click="refresh(selectedId)"`,
  `@click="syncAllRepositories"`, `@click="newRepository"`, `@click="saveRepository"`, `@click="cancelRepositoryEdit"`, `@click="removeRepository(selectedRepository)"`, `@click="loadOnlineCatalog"`,
  `@click="inspectHotfix"`, `@click="applyHotfix"`, `@click="discardHotfixStage"`, `@click="rollbackHotfix(row)"`,
  `@click="confirmAction"`, `@click="confirmHandBack"`, `@click="confirmSwitchAction"`, `@click="confirmInstall"`, `@click="confirmReinstall"`, `@click="closeConfirm"`, `@click="reloadTecTac"`,
  `@click="moveInspected(row.id,-1)"`, `@click="moveInspected(row.id,1)"`,
]
for (const handler of wired) assert.ok(view.includes(handler), `${handler} is still wired`)
for (const fn of ['stage: (item) => requestStageOnline(item)', 'sync: (repo) => syncRepository(repo)', '@select="editRepository"']) assert.ok(view.includes(fn), `${fn} is wired through the table`)
// each table action reaches the same page function the old button called
assert.match(tablesSource, /onClick: \(event\) => \{ event\.stopPropagation\(\); stage\(item\) \}/)
assert.match(tablesSource, /onClick: \(event\) => \{ event\.stopPropagation\(\); sync\(repo\) \}/)
for (const fn of ['async function setVisibility', 'async function confirmAction', 'async function stageOnline', 'async function syncRepository', 'async function saveRepository', 'async function removeRepository', 'async function applyHotfix', 'async function rollbackHotfix', 'function ask(']) assert.ok(view.includes(fn), `${fn} is still defined`)
assert.match(view, /import \{[^}]*setModuleEnabled[^}]*setModuleVisible[^}]*\} from '\.\.\/modules'|setModuleEnabled,\n  setModuleVisible,/, 'enable, disable and visibility still go through src/modules.js')
for (const call of ['removeModule(item.id)', 'setModuleEnabled(item.id, true, false, willDisableIds(item.will_disable))', 'setModuleEnabled(item.id, false, cascade.value)', 'syncModuleRepository(item.id)', 'syncAllModuleRepositories()', 'updateModuleRepository(selectedRepositoryId.value, repositoryDraft.value)', 'addModuleRepository(repositoryDraft.value)', 'rollbackModuleHotfix(moduleId,row.id)', 'applyModuleHotfix(id)']) assert.ok(view.includes(call), `${call} is still called`)

// ---- confirmations: the shell Yes or No, nothing typed ----
assert.match(view, /askConfirm\(\{ question: `Remove repository \$\{item\.name\}\?`/)
assert.match(view, /askConfirm\(\{ question: `Roll back hotfix \$\{row\.id\} from \$\{moduleId\}\?`/)
const confirmModal = view.slice(view.indexOf('<div v-if="confirmTarget" class="modal-backdrop"'))
assert.match(confirmModal, /<button class="btn" @click="closeConfirm">No<\/button><button class="btn" :class="confirmMode==='enable'\?'primary':'danger'" @click="confirmAction">Yes<\/button>/, 'a plain No and Yes')
assert.ok(!/type="text"|<textarea|type="password"/.test(confirmModal), 'no typed confirmation in the lifecycle dialogs')
assert.match(confirmModal, /<input v-model="switchAck" type="checkbox">/, 'the second step stays a tick box and a button (Q26), unchanged')
const installConfirmModal = view.slice(view.indexOf('<div v-if="installConfirm" class="modal-backdrop"'), view.indexOf('<div v-if="confirmTarget" class="modal-backdrop"'))
assert.ok(!/type="text"|<textarea/.test(installConfirmModal))

// ---- tokens only: no hex colour, no raw px font size in what this release changed ----
const css = read('../src/styles.css')
const block = css.slice(css.indexOf('/* 0.12.118: floating window layer 1050'), css.indexOf('.tt-steps{display:flex'))
const block2 = css.slice(css.indexOf('/* 0.12.118: Module Manager.'), css.indexOf('.mm-licence-reason .count{') + 200)
const changed = {
  'styles.css (0.12.118 blocks)': block + block2,
  'module-manager-tables.js': tablesSource,
  'ModuleJobHistory.vue': read('../src/components/modules/ModuleJobHistory.vue'),
  'ModuleJobLogWindow.vue': read('../src/components/modules/ModuleJobLogWindow.vue'),
  'LicenceOverride.vue': read('../src/components/modules/LicenceOverride.vue'),
  'LicensingCard.vue': read('../src/components/LicensingCard.vue'),
}
assert.ok(block.length > 100 && block2.length > 100, 'the 0.12.118 CSS blocks were found')
for (const [name, text] of Object.entries(changed)) {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(text.replace(/&#\d+;/g, '')), `${name}: no hex colour`)
  assert.ok(!/font-size:\s*\d+(\.\d+)?px/.test(text), `${name}: no raw px font size`)
  assert.ok(!/font:\s*\d+(\.\d+)?px/.test(text), `${name}: no raw px in a font shorthand`)
}
assert.ok(!/<style/.test(changed['ModuleJobHistory.vue'] + changed['ModuleJobLogWindow.vue'] + changed['LicenceOverride.vue'] + changed['LicensingCard.vue']), 'the new components add no private styles')
assert.ok(!/v-html|innerHTML/.test(view), 'ModulesView never uses v-html')

// ---- ModulesView does not grow: the new markup lives in components ----
const lines = view.split('\n').length
assert.ok(lines < 1400, `ModulesView.vue is ${lines} lines`)
for (const file of ['ModuleJobHistory.vue', 'ModuleJobLogWindow.vue', 'LicenceOverride.vue']) assert.ok(fs.existsSync(new URL(`../src/components/modules/${file}`, import.meta.url)), file)

// ---- the design standards name the Module Manager as an adopter ----
assert.match(read('../docs/ui-design-standards.md'), /Module Manager/)
console.log('module-manager-brand-board-0.12.118: ok')
