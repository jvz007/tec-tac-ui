// 0.12.109 (Core 1.17.39, reviews/requests/ui.md): the Modules page shows the skipped entries of a repository index and the
// release fields of an online catalog row. Display only. The formatting lives in src/module-repository-info.js (pure, no Vue);
// the view shows every string with {{ }} and never v-html. No button state, filter, sort, search or install decision reads
// channel, lifecycle or recommended. src/modules.js is unchanged: the same two routes and the same api surface.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { skippedSummary, skippedRows, releaseLabels } = await import(new URL('../src/module-repository-info.js', import.meta.url).href)

// (a) the count line: 0 is shown, a short list says so, and a missing count shows nothing.
assert.equal(skippedSummary({ status: 'ok', skipped_count: 0, skipped: [] }), '0 skipped', 'a count of 0 with an empty list')
assert.equal(skippedSummary({ status: 'ok', skipped_count: 2, skipped: [{ index: 0 }, { index: 3 }] }), '2 skipped', 'a count that matches the list')
assert.equal(skippedSummary({ status: 'ok', skipped_count: 150, skipped: Array(100).fill({ index: 1 }) }), '150 skipped, first 100 listed', 'the list is capped at 100')
assert.equal(skippedSummary({ status: 'ok', skipped_count: 3, skipped: [] }), '3 skipped, first 0 listed', 'a count with no list says so')
assert.equal(skippedSummary({ status: 'ok' }), '', 'an older Core sends no count: nothing')
assert.equal(skippedSummary({ status: 'ok', skipped_count: null }), '', 'a null count: nothing')
assert.equal(skippedSummary(undefined), '', 'no sync object: nothing')
assert.equal(skippedSummary({ skipped_count: '4' }), '', 'a count that is not a number is not shown')

// (b) the rows: index, id, version and reason as sent; null id or version is a dash; markup stays text.
const sent = [
  { index: 2, id: 'scoutdns', version: '1.0.0', reason: 'Version is not a valid release.' },
  { index: 5, id: null, version: null, reason: 'Missing id.' },
  { index: 7, id: '<img onerror=x>', version: '2.1.0', reason: '<img onerror=x>' },
]
const rows = skippedRows({ skipped_count: 3, skipped: sent })
assert.equal(rows.length, 3, 'one row per record')
assert.deepEqual(rows[0], { index: 2, id: 'scoutdns', version: '1.0.0', reason: 'Version is not a valid release.' }, 'a normal record is kept as sent')
assert.equal(rows[1].id, '—', 'a null id shows as a dash')
assert.equal(rows[1].version, '—', 'a null version shows as a dash')
assert.equal(rows[1].index, 5, 'the index is kept')
assert.equal(rows[2].id, '<img onerror=x>', 'an id with markup stays the same string')
assert.equal(rows[2].reason, '<img onerror=x>', 'a reason with markup stays the same string')
assert.deepEqual(skippedRows({ skipped_count: 0, skipped: [] }), [], 'no rows for an empty list')
assert.deepEqual(skippedRows(undefined), [], 'no rows without a sync object')
assert.deepEqual(skippedRows({ skipped_count: 1 }), [], 'no rows for an older Core')

// (c) the release labels: only for values that are not null; recommended true and false read as text; null reads nothing.
assert.deepEqual(releaseLabels({ channel: 'stable', lifecycle: 'active', recommended: true }), ['stable', 'active', 'recommended'])
assert.deepEqual(releaseLabels({ channel: 'beta', lifecycle: null, recommended: false }), ['beta', 'not recommended'], 'an explicit false is shown')
assert.deepEqual(releaseLabels({ channel: null, lifecycle: null, recommended: null }), [], 'all null gives nothing')
assert.deepEqual(releaseLabels({ channel: 'stable' }), ['stable'], 'missing fields give nothing')
assert.deepEqual(releaseLabels({ recommended: 'yes' }), [], 'a recommended value that is not a boolean gives nothing')
assert.deepEqual(releaseLabels(undefined), [], 'no row gives nothing')
assert.deepEqual(releaseLabels({ channel: '<b>x</b>' }), ['<b>x</b>'], 'a label with markup stays text (the view interpolates it)')

// (d) the view: no v-html; the Repositories tab has the count and the editor block; the Online catalog has the labels; the
// Download button and filteredOnline never read channel, lifecycle or recommended.
const view = read('../src/views/ModulesView.vue')
assert.doesNotMatch(view, /v-html/, 'the Modules page never uses v-html')
assert.match(view, /from '\.\.\/module-repository-info'/, 'the view imports the helpers')

const onlineStart = view.indexOf(`<template v-else-if="activeTab==='online'">`)
const reposStart = view.indexOf(`<template v-else-if="activeTab==='repositories'">`)
const hotfixStart = view.indexOf(`<template v-else-if="activeTab==='hotfixes'">`)
assert.ok(onlineStart > 0 && reposStart > onlineStart && hotfixStart > reposStart, 'the tab templates are in the expected order')
const online = view.slice(onlineStart, reposStart)
const repos = view.slice(reposStart, hotfixStart)

assert.match(repos, /skippedSummary\(repo\.sync\)/, 'the Sync column shows the count under the status')
assert.match(repos, /Skipped entries/, 'the editor has a Skipped entries block')
assert.match(repos, /skippedRows\(selectedRepository\.sync\)/, 'the editor lists each skipped record')
assert.doesNotMatch(online, /skippedSummary|skippedRows/, 'the skipped block is on the Repositories tab only')
assert.match(online, /releaseLabels\(item\)/, 'the Online catalog shows the release labels')
assert.doesNotMatch(repos, /releaseLabels/, 'the Repositories tab shows no release labels')

// The labels are pills with no click handler.
const labelLine = online.split('\n').find((line) => line.includes('releaseLabels(item)') && line.includes('class="pill"'))
assert.ok(labelLine, 'the label pills are plain pills')
assert.doesNotMatch(labelLine, /@click/, 'the label pills have no click handler')

// The Download button's disabled expression and filteredOnline do not read the release fields.
const buttonMatch = /<button class="btn sm"[^>]*:disabled="([^"]*)"[^>]*@click="requestStageOnline\(item\)"/.exec(online)
assert.ok(buttonMatch, 'the Download button is in the Online catalog')
assert.doesNotMatch(buttonMatch[1], /channel|lifecycle|recommended/, 'the Download button does not read the release fields')
const filteredLine = view.split('\n').find((line) => line.trimStart().startsWith('const filteredOnline = computed('))
assert.ok(filteredLine, 'filteredOnline is found')
assert.doesNotMatch(filteredLine, /channel|lifecycle|recommended/, 'filteredOnline does not read the release fields')
assert.doesNotMatch(view, /\b(sort|filter|search)[A-Za-z]*\b[^\n]*(channel|lifecycle|recommended)/i, 'no sort, filter or search reads the release fields')

// The helper module is pure: no Vue, no api, no imports.
const helperSource = read('../src/module-repository-info.js')
assert.doesNotMatch(helperSource, /^import /m, 'the helper has no imports')
const helperCode = helperSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
assert.doesNotMatch(helperCode, /v-html|innerHTML/, 'the helper never builds markup')

// (e) src/modules.js: the same two routes, and the same api functions.
const modules = read('../src/modules.js')
assert.ok(modules.includes("apiFetch('/api/tfd/modules/repositories/')"), 'the repositories route is unchanged')
assert.ok(modules.includes("apiFetch('/api/tfd/modules/catalog/online/')"), 'the online catalog route is unchanged')
for (const name of ['listModuleRepositories', 'addModuleRepository', 'updateModuleRepository', 'deleteModuleRepository', 'syncModuleRepository', 'syncAllModuleRepositories', 'listOnlineModuleCatalog', 'stageOnlineModulePackage']) {
  assert.match(modules, new RegExp(`export (async )?function ${name}\\(`), `modules.js still exports ${name}`)
}
assert.doesNotMatch(modules, /channel|lifecycle|recommended/, 'modules.js reads no release field')

// The styles use the existing repository block and existing tokens.
const styles = read('../src/styles.css')
assert.match(styles, /\.release-labels\{/, 'the label rule is in styles.css')
assert.match(styles, /\.repo-skipped-row\{/, 'the skipped row rule is in styles.css')
assert.match(styles, /\.module-source\{overflow-wrap:anywhere\}\.release-labels/, 'the rules sit in the repository block')

console.log('module-repository-skipped-0.12.109: PASS')
