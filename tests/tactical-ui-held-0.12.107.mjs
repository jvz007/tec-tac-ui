// 0.12.107, held findings from UI 0.12.106 (the review). Part 1 (Medium): Save is not held for every field when the saved
// double-click action is URL Action and the person cannot run URL Actions; a change that sets URL Action is still refused.
// Part 2 (Low): the date formatter's letters that it does not recognise are listed on the card; formatting is unchanged.
// Part 3 (Low): modulePreferences.forModule fails at creation with a clear message when it gets no api() helper.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { changedFields, saveTacticalUiWorkflow, tacticalUiProblem } = await import(new URL('../src/my-account-workflows.js', import.meta.url).href)
// src/state.js reads localStorage when it loads, and its relative imports do not resolve in Node. As the date-format test does,
// a memory stand-in lets it load and its imports are rewritten to absolute data URLs; date-format.js then reads that state.
const store = new Map()
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const stateUrl = dataUrl(read('../src/state.js')
  .replace("import { reactive } from 'vue'", 'const reactive = (value) => value')
  .replace("from './api'", `from '${new URL('../src/api.js', import.meta.url).href}'`)
  .replace("from './runtime-context'", `from '${new URL('../src/runtime-context.js', import.meta.url).href}'`))
const { unknownDateFormatLetters, formatWithPattern } = await import(dataUrl(read('../src/date-format.js').replace("from './state.js'", `from '${stateUrl}'`)))
const { createModulePreferencesService } = await import(new URL('../src/module-preferences.js', import.meta.url).href)

// Part 1. A role that cannot run URL Actions, with URL Action already saved as the double-click action.
const core = {
  agent_dblclick_action: 'urlaction',
  url_action_id: 7,
  agent_dblclick_choices: [{ value: 'editagent', label: 'Edit agent' }, { value: 'urlaction', label: 'URL Action' }],
  url_actions: [{ id: 7, name: 'Open ticket' }],
  can_run_url_actions: false,
  dark_mode: false,
  show_community_scripts: false,
  clear_search_when_switching: false,
  default_agent_tbl_tab: 'mixed',
  client_tree_sort: 'alpha_fail',
  client_tree_splitter: 11,
  loading_bar_color: 'red',
  dash_info_color: 'info',
  dash_positive_color: 'positive',
  dash_negative_color: 'negative',
  dash_warning_color: 'warning',
  date_format: null,
}
{
  // A change to the date format alone is allowed: the saved URL Action is not changed.
  const edited = { ...core, date_format: 'DD MMM YYYY' }
  const changed = changedFields(edited, core)
  assert.deepEqual(changed, { date_format: 'DD MMM YYYY' })
  assert.equal(tacticalUiProblem(edited, changed, { canRunUrlActions: false }), '')
  const sent = []
  const result = await saveTacticalUiWorkflow(edited, {
    original: core,
    canRunUrlActions: false,
    saveMyTacticalUiPreferences: async (payload) => { sent.push(payload); return { preferences: { ...core, date_format: 'DD MMM YYYY' } } },
  })
  assert.deepEqual(sent, [{ date_format: 'DD MMM YYYY' }], 'the date change is sent, the saved URL Action is not')
  assert.equal(result.preferences.date_format, 'DD MMM YYYY')
  // A colour change is allowed too.
  const colour = { ...core, dash_warning_color: '#123456' }
  assert.equal(tacticalUiProblem(colour, changedFields(colour, core), { canRunUrlActions: false }), '')
  // Setting URL Action (or a URL Action id) is still refused before any request.
  const switching = { ...core, agent_dblclick_action: 'urlaction', url_action_id: 9, date_format: 'DD' }
  const switchedOff = { ...core, agent_dblclick_action: 'editagent', url_action_id: null }
  assert.equal(tacticalUiProblem(switching, changedFields(switching, switchedOff), { canRunUrlActions: false }), 'Your Tactical role does not permit URL Actions.')
  // The URL Action id alone (the double-click action stays as it is) is refused too.
  const idOnly = { ...core, agent_dblclick_action: 'editagent', url_action_id: 9 }
  const idOnlyOriginal = { ...core, agent_dblclick_action: 'editagent', url_action_id: null }
  assert.deepEqual(changedFields(idOnly, idOnlyOriginal), { url_action_id: 9 })
  assert.equal(tacticalUiProblem(idOnly, changedFields(idOnly, idOnlyOriginal), { canRunUrlActions: false }), 'Your Tactical role does not permit URL Actions.')
  let calls = 0
  await assert.rejects(saveTacticalUiWorkflow(switching, { original: switchedOff, canRunUrlActions: false, saveMyTacticalUiPreferences: async () => { calls += 1; return {} } }), /does not permit URL Actions/)
  assert.equal(calls, 0, 'refused before any request')
}

// Part 2. The letters the formatter does not recognise.
assert.deepEqual(unknownDateFormatLetters('YYYY-MM-DD HH:mm'), [])
assert.deepEqual(unknownDateFormatLetters('DD MMM YYYY [at] h:mm A'), [])
assert.deepEqual(unknownDateFormatLetters('[Q E x]'), [], 'text in brackets is shown as written, so it is not listed')
assert.deepEqual(unknownDateFormatLetters('Q E x'), ['Q', 'E', 'x'])
assert.deepEqual(unknownDateFormatLetters('DD [Q] x Q'), ['x', 'Q'], 'each letter once, in order of appearance')
assert.deepEqual(unknownDateFormatLetters('Dx'), ['x'], 'a recognised token next to an unknown letter is split correctly')
assert.deepEqual(unknownDateFormatLetters(''), [])
assert.deepEqual(unknownDateFormatLetters(null), [])
// Formatting itself is unchanged: an unknown letter is written as it is.
const sample = new Date(2026, 9, 14, 9, 5, 7)
assert.equal(formatWithPattern(sample, 'YYYY-MM-DD HH:mm:ss'), '2026-10-14 09:05:07')
assert.equal(formatWithPattern(sample, 'Q E x'), 'Q E x')

const card = read('../src/components/TacticalUiPreferencesCard.vue')
assert.match(card, /const unknownLetters = computed\(\(\) => unknownDateFormatLetters\(form\.date_format\)\)/)
assert.match(card, /<template v-if="unknownLetters\.length"> Tec-Tac shows \{\{ unknownLetters\.join\(', '\) \}\} as written\. Tactical may read them as date parts\.<\/template>/)

// Part 1 source: the Save button no longer names the URL Action refusal; the picker and the note stay.
const saveButton = /<button class="btn primary" :disabled="([^"]*)" @click="save">/.exec(card)
assert.ok(saveButton, 'the Save button is found')
assert.equal(saveButton[1], 'busy || !hasChanges || !!problem', 'Save is disabled only while busy, unchanged or refused by a local check')
assert.doesNotMatch(saveButton[1], /urlActionBlocked/)
assert.match(card, /<p v-if="urlActionBlocked" class="muted smalltext">Your Tactical role does not permit URL Actions\.<\/p>/)
assert.match(card, /<select v-model="form\.url_action_id" :disabled="canRunUrlActions === false">/)

// Part 3. forModule needs the api helper, and names the problem when it is missing.
const service = createModulePreferencesService()
const message = "modulePreferences needs the module's api helper"
for (const options of [{}, { api: 5 }, { api: null }, { api: 'apiFetch' }]) {
  assert.throws(() => service.forModule('x', options), (error) => error instanceof Error && error.message === message, `refused for ${JSON.stringify(options)}`)
}
assert.throws(() => service.forModule('x'), (error) => error.message === message, 'refused with no options at all')
const helper = service.forModule('x', { api: async () => ({ preferences: {} }), isSignedOut: () => false, isAbandoned: () => false })
assert.equal(typeof helper.get, 'function', 'a function still works')
assert.deepEqual(await helper.getAll(), {})

const preferencesSource = read('../src/module-preferences.js')
assert.match(preferencesSource, /if \(typeof api !== 'function'\) throw new Error\("modulePreferences needs the module's api helper"\)/)

console.log('tactical-ui-held-0.12.107: PASS')
