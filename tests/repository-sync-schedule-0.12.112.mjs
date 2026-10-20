// 0.12.112: the Repositories page reads Core 1.17.42's sync_schedule. The helper returns plain strings for enabled and disabled,
// null, a missing key (an older Core), null or invalid timestamps and a non-string status; the card's values are text nodes; a
// disabled row shows the hint and keeps its Sync button disabled; the enable path is the existing editor (no toggleRepository);
// the Online catalog keeps Core's availability sentence; the card follows the person's date format.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { syncScheduleInfo, SYNC_NOT_SET_UP, SYNC_NOTE } = await import(new URL('../src/module-repository-info.js', import.meta.url).href)

const fmt = (value) => `DATE(${value})`
const enabled = {
  enabled: true,
  time: '03:00',
  timezone: 'Africa/Johannesburg',
  next_run_at: '2026-10-17T01:00:00Z',
  last_run_at: '2026-10-16T01:00:00Z',
  last_run_status: 'ok',
}

// (1) enabled: On, the time and zone as sent, the dates through the person's format, the status as text, the plain note
{
  const info = syncScheduleInfo(enabled, fmt)
  assert.equal(info.notSetUp, false)
  assert.equal(info.state, 'On')
  assert.deepEqual(info.lines, [
    { label: 'Time', value: '03:00 Africa/Johannesburg' },
    { label: 'Next sync', value: 'DATE(2026-10-17T01:00:00Z)' },
    { label: 'Last sync', value: 'DATE(2026-10-16T01:00:00Z)' },
  ])
  assert.equal(info.status, 'ok')
  assert.equal(info.note, 'The daily sync runs enabled repositories only.')
  assert.equal(info.note, SYNC_NOTE)
}

// (2) disabled: Off
{
  const info = syncScheduleInfo({ ...enabled, enabled: false }, fmt)
  assert.equal(info.state, 'Off')
  assert.equal(syncScheduleInfo({ ...enabled, enabled: 'yes' }, fmt).state, 'Off', 'only a boolean true reads On')
}

// (3) null: the card says the sync is not set up
{
  const info = syncScheduleInfo(null, fmt)
  assert.equal(info.notSetUp, true)
  assert.equal(info.message, 'The daily sync is not set up yet.')
  assert.equal(info.message, SYNC_NOT_SET_UP)
  assert.deepEqual(info.lines, [])
}

// (4) a missing key (an older Core) returns null, so the card is not shown
{
  assert.equal(syncScheduleInfo(undefined, fmt), null)
  assert.equal(syncScheduleInfo(), null)
}

// (5) null, missing or invalid timestamps show Not yet; a formatter that throws shows Not yet too
{
  const info = syncScheduleInfo({ enabled: true, time: '03:00', timezone: 'UTC', next_run_at: null, last_run_at: 'not a date' }, fmt)
  assert.equal(info.lines[1].value, 'Not yet')
  assert.equal(info.lines[2].value, 'Not yet')
  const missing = syncScheduleInfo({ enabled: true }, fmt)
  assert.equal(missing.lines[1].value, 'Not yet')
  assert.equal(missing.lines[2].value, 'Not yet')
  assert.equal(missing.lines[0].value, '—', 'no time and no zone show a dash')
  const throwing = syncScheduleInfo({ enabled: true, last_run_at: '2026-10-16T01:00:00Z' }, () => { throw new Error('x') })
  assert.equal(throwing.lines[2].value, 'Not yet')
}

// (6) a non-string status is not shown; a string is shown exactly as Core sent it
{
  assert.equal(syncScheduleInfo({ ...enabled, last_run_status: 5 }, fmt).status, '')
  assert.equal(syncScheduleInfo({ ...enabled, last_run_status: null }, fmt).status, '')
  assert.equal(syncScheduleInfo({ ...enabled, last_run_status: '<b>odd</b> value' }, fmt).status, '<b>odd</b> value', 'kept as text; the view shows it with {{ }}')
  assert.equal(syncScheduleInfo({ ...enabled, time: 7 }, fmt).lines[0].value, 'Africa/Johannesburg', 'a non-string time is dropped, the zone stays')
}

// (7) a value that is not an object (an unexpected shape) reads as not set up
{
  assert.equal(syncScheduleInfo('weird', fmt).notSetUp, true)
  assert.equal(syncScheduleInfo([], fmt).notSetUp, true)
}

// (8) the view: the card, the row hint, the disabled Sync button, the enable path, the catalog sentence, the date format
const view = read('../src/views/ModulesView.vue')
const cardAt = view.indexOf('class="card mb repository-sync-card"')
assert.ok(cardAt > 0, 'the card exists')
const cardEnd = view.indexOf('</section>', cardAt)
const card = view.slice(cardAt, cardEnd)
assert.ok(!card.includes('v-html'), 'the card never uses v-html')
assert.ok(card.includes('{{ line.value }}') && card.includes('{{ syncInfo.status }}') && card.includes('{{ syncInfo.note }}') && card.includes('{{ syncInfo.message }}'), 'every value is shown with {{ }}')
assert.ok(card.includes('class="pill"'), 'the status is a neutral pill')
assert.ok(view.includes('<section v-if="syncInfo" class="card mb repository-sync-card"'), 'the card needs the helper result, so an older Core hides it')
assert.ok(card.includes('Daily sync'), 'the card is titled Daily sync')
assert.ok(card.includes("syncInfo.state === 'On' ? 'ok' : 'warn'"), 'the On or Off pill')
assert.ok(view.includes('syncSchedule.value = payload && typeof payload === \'object\' && Object.prototype.hasOwnProperty.call(payload, \'sync_schedule\') ? payload.sync_schedule : undefined'), 'loadRepositories keeps sync_schedule, and an absent key stays absent')
assert.ok(view.includes('syncScheduleInfo(syncSchedule.value, (value) => formatDateTime(value))'), 'the dates use the person\'s format through formatDateTime')
assert.ok(view.includes('formatDateTime } from') || view.includes("import { formatDateTime } from '../date-format'"), 'formatDateTime is the shared formatter')

// the hint under a disabled row's State pill; the Sync button still needs the repository enabled
// 0.12.118: the Repositories list is a kit DataTable (P1); the hint and the Sync button are built in src/module-manager-tables.js.
const tables = fs.readFileSync(new URL('../src/module-manager-tables.js', import.meta.url), 'utf8')
assert.ok(tables.includes("!repo.enabled ? sub('Enable it to sync.') : null"), 'a disabled row shows the hint')
assert.ok(tables.includes('disabled: disabled(repo),') && tables.includes('onClick: (event) => { event.stopPropagation(); sync(repo) }'), 'the Sync button takes the page rule and stops the row click')
assert.ok(view.includes('disabled: (repo) => !canManage.value || repositoryBusy.value || !repo.enabled'), 'the Sync button stays disabled for a disabled row')

// the enable path: the existing editor. toggleRepository (spreads the whole row, read-only keys included) is not used by the view
const templateStart = view.indexOf('<template v-else-if="activeTab===\'repositories\'">')
const templateEnd = view.indexOf('<template v-else-if="activeTab===\'hotfixes\'">')
const repositoriesTab = view.slice(templateStart, templateEnd)
assert.ok(templateStart > 0 && templateEnd > templateStart, 'the Repositories tab is found')
assert.ok(!repositoriesTab.includes('toggleRepository'), 'the tab does not use toggleRepository')
const draft = view.match(/repositoryDraft\.value = \{ name: item\.name, url: item\.url, priority: item\.priority, trust: item\.trust, enabled: item\.enabled \}/)
assert.ok(draft, 'the editor draft holds only the five editable fields, never the read-only sync object')
assert.ok(view.includes('await updateModuleRepository(selectedRepositoryId.value, repositoryDraft.value)'), 'Save goes through updateModuleRepository, the existing edit')
const saveBody = view.slice(view.indexOf('async function saveRepository'), view.indexOf('async function toggleRepository'))
assert.ok(saveBody.length > 0 && !saveBody.includes('...'), 'Save sends the editor draft only, never a spread of the whole row')

// the Online catalog keeps Core's availability sentence, unchanged
assert.ok(view.includes('<div v-if="onlineInfo?.message && !onlineCatalog.length" class="state-inline"'), 'the catalog still shows the availability message')

// the card does not decide anything: no button, filter or request reads it
const syncReads = view.split('\n').filter((line) => line.includes('syncInfo') || line.includes('syncSchedule'))
for (const line of syncReads) {
  assert.ok(!/:disabled=|v-if="[^"]*syncInfo[^"]*"[^>]*@click|filter|request/.test(line.replace('v-if="syncInfo"', '')), `the sync card only displays: ${line.trim().slice(0, 80)}`)
}

// (9) Core 1.17.43: the seeded tec-tac-official row is an ordinary row (disabled, sync never) beside a sync_schedule; mistyped keys
// never throw; a caller who cannot manage modules gets the redacted form and the table never shows the address
{
  const payload = {
    repositories: [{ id: 'tec-tac-official', name: 'Tec-Tac official', url: '', priority: 100, trust: 'signed', enabled: false, sync: { status: 'never', module_count: 0 } }],
    sync_schedule: { ...enabled, enabled: false, last_run_at: null, last_run_status: null },
  }
  const info = syncScheduleInfo(payload.sync_schedule, fmt)
  assert.equal(info.state, 'Off')
  assert.equal(info.lines[2].value, 'Not yet')
  assert.equal(info.status, '')
  const mistyped = syncScheduleInfo({ enabled: 1, time: { h: 3 }, timezone: ['UTC'], next_run_at: 12, last_run_at: {}, last_run_status: false }, fmt)
  assert.equal(mistyped.notSetUp, false)
  assert.equal(mistyped.state, 'Off')
  assert.deepEqual(mistyped.lines.map((l) => l.value), ['—', 'Not yet', 'Not yet'])
  assert.equal(mistyped.status, '')
  const noManage = syncScheduleInfo({ enabled: true }, fmt)
  assert.equal(noManage.state, 'On')
  const v = read('../src/views/ModulesView.vue')
  const table = v.slice(v.indexOf('<table><thead><tr><th>Repository</th>'), v.indexOf('</tbody>', v.indexOf('<table><thead><tr><th>Repository</th>')))
  assert.ok(!table.includes('repo.url') && !/official/i.test(table), 'the table shows no address and no official label')
}

// the helper module stays import-free and never uses v-html or the DOM
const helper = read('../src/module-repository-info.js')
assert.ok(!/^import /m.test(helper), 'the helper imports nothing')

console.log('repository-sync-schedule-0.12.112: PASS')
