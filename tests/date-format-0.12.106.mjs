// 0.12.106: the one date formatter for Core's pages. Each token against fixed dates, escaped text, unknown letters pass through,
// an empty format falls back to toLocaleString(), an invalid date shows the raw value, and context.dateTimeFormat is untouched.
// Every Core page that formatted a date now calls formatDateTime, and none calls toLocaleString() on a date any more.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
// src/state.js reads localStorage when it loads; a memory stand-in lets it load in Node. Like the other tests, the
// relative imports of state.js and date-format.js are rewritten to absolute URLs, so both load from source, and the
// formatter reads the same state object the test sets.
const store = new Map()
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const apiUrl = new URL('../src/api.js', import.meta.url).href
const runtimeUrl = new URL('../src/runtime-context.js', import.meta.url).href
const stateUrl = dataUrl(read('../src/state.js')
  .replace("import { reactive } from 'vue'", 'const reactive = (value) => value')
  .replace("from './api'", `from '${apiUrl}'`)
  .replace("from './runtime-context'", `from '${runtimeUrl}'`))
const { state } = await import(stateUrl)
const { formatDateTime, formatWithPattern } = await import(dataUrl(read('../src/date-format.js').replace("from './state.js'", `from '${stateUrl}'`)))

// 14 October 2026 15:04:05.006, a Wednesday, in local time.
const d = new Date(2026, 9, 14, 15, 4, 5, 6)
const pad = (n, size = 2) => String(n).padStart(size, '0')
const off = -d.getTimezoneOffset()
const offsetPlain = `${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}${pad(Math.abs(off) % 60)}`
const offsetColon = `${offsetPlain.slice(0, 3)}:${offsetPlain.slice(3)}`

const f = (pattern, date = d) => formatWithPattern(date, pattern)
assert.equal(f('YYYY-MM-DD'), '2026-10-14')
assert.equal(f('YY M D'), '26 10 14')
assert.equal(f('MMMM MMM MM M'), 'October Oct 10 10')
assert.equal(f('dddd ddd'), 'Wednesday Wed')
assert.equal(f('DD MMM YYYY, HH:mm'), '14 Oct 2026, 15:04')
assert.equal(f('HH H hh h'), '15 15 03 3')
assert.equal(f('mm m ss s'), '04 4 05 5')
assert.equal(f('SSS'), '006')
assert.equal(f('A a'), 'PM pm')
assert.equal(f('h:mm A'), '3:04 PM')
assert.equal(f('Z'), offsetPlain)
assert.equal(f('ZZ'), offsetColon)

// Day ordinals.
const ordinals = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 11: '11th', 12: '12th', 13: '13th', 21: '21st', 22: '22nd', 23: '23rd', 31: '31st' }
for (const [day, text] of Object.entries(ordinals)) assert.equal(f('Do', new Date(2026, 0, Number(day))), text, `ordinal ${day}`)

// Midnight and noon in 12-hour time.
assert.equal(formatWithPattern(new Date(2026, 9, 14, 0, 30), 'hh:mm A'), '12:30 AM')
assert.equal(formatWithPattern(new Date(2026, 9, 14, 12, 0), 'h A'), '12 PM')

// Escaped text is shown as written, and tokens inside it are not replaced. Unknown letters pass through.
assert.equal(f('[at] HH:mm'), 'at 15:04')
assert.equal(f('[YYYY] YYYY'), 'YYYY 2026')
assert.equal(f('[Do] Do'), 'Do 14th')
assert.equal(f('Q dd W G'), 'Q dd W G')
assert.equal(f('d'), 'd')

// A pattern with no token letters comes back unchanged. (The letters s and h are tokens, so they are replaced.)
assert.equal(f('Week of'), 'Week of')
assert.equal(f('no tokens here'), 'no token5 3ere')

// An invalid date shows the raw value, both from the pattern function and from formatDateTime.
assert.equal(formatWithPattern('not a date', 'YYYY'), 'not a date')
assert.equal(formatWithPattern(undefined, 'YYYY'), '')

// formatDateTime: the person's format when set, the browser default when empty or blank.
state.context.tactical_ui = { date_format: 'DD MMM YYYY HH:mm' }
assert.equal(formatDateTime(d), '14 Oct 2026 15:04')
assert.equal(formatDateTime(d.toISOString()), formatWithPattern(new Date(d.toISOString()), 'DD MMM YYYY HH:mm'), 'an ISO text is read as a date')
assert.equal(formatDateTime(d), formatWithPattern(d, 'DD MMM YYYY HH:mm'))
assert.equal(formatDateTime('not a date'), 'not a date')
state.context.tactical_ui = { date_format: '' }
assert.equal(formatDateTime(d), d.toLocaleString(), 'an empty format falls back to toLocaleString()')
state.context.tactical_ui = { date_format: '   ' }
assert.equal(formatDateTime(d), d.toLocaleString(), 'a blank format falls back too')
state.context.tactical_ui = { date_format: null }
assert.equal(formatDateTime(d), d.toLocaleString())
state.context.tactical_ui = {}
assert.equal(formatDateTime(d), d.toLocaleString(), 'no tactical_ui at all falls back')
state.context.tactical_ui = { date_format: 'YYYY' }
assert.equal(formatDateTime(d), '2026')

// Modules keep the server default: context.dateTimeFormat is neither read nor changed by the formatter.
const formatterSource = read('../src/date-format.js')
assert.doesNotMatch(formatterSource, /state\.context\.dateTimeFormat|dateTimeFormat\s*=/, 'the formatter does not touch context.dateTimeFormat')
const workflowsSource = read('../src/my-account-workflows.js')
assert.doesNotMatch(workflowsSource, /dateTimeFormat/)
assert.match(read('../src/runtime-context.js'), /dateTimeFormat/, 'runtime-context still carries dateTimeFormat')

// The twelve Core pages (plus ContractsView, which formats the framework time the same way) use formatDateTime, and none calls toLocaleString().
const pages = [
  'src/components/access/AdminSessionsPanel.vue',
  'src/components/access/ApiKeysPanel.vue',
  'src/components/access/SessionSecurityPanel.vue',
  'src/components/NoticeDrawer.vue',
  'src/components/RuntimeSettingsCard.vue',
  'src/views/BackupRestoreView.vue',
  'src/views/ContractsView.vue',
  'src/views/DiagnosticsView.vue',
  'src/views/ModulesView.vue',
  'src/views/SchedulerSettingsView.vue',
  'src/views/SchedulesView.vue',
  'src/views/SystemUpdatesView.vue',
]
assert.equal(pages.length, 12)
for (const page of pages) {
  const text = read(`../${page}`)
  const depth = page.split('/').length - 2
  const importPath = `${'../'.repeat(depth)}date-format`
  assert.ok(text.includes(`import { formatDateTime } from '${importPath}'`), `${page} imports formatDateTime from ${importPath}`)
  assert.ok(text.includes('formatDateTime('), `${page} calls formatDateTime`)
  assert.doesNotMatch(text, /\.toLocaleString\(/, `${page} has no toLocaleString() call left`)
}

// The shared helper is the only place that formats with toLocaleString() for Core's pages (the empty-format fallback).
assert.equal((formatterSource.match(/date\.toLocaleString\(\)/g) || []).length, 1)

console.log('date-format-0.12.106: PASS')
