// 0.12.106: the Tactical UI form on My Account. The choices come from Core's answer, only changed fields are sent (one PUT,
// all or nothing), block_dashboard_login is never sent, booleans stay booleans, a refusal keeps the card open with Core's text
// and applies nothing, and a role without URL Actions is refused before any request. Source scans: no storage, no hand-built
// headers, every call goes through src/account.js (which goes through src/api.js).
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { changedFields, saveTacticalUiWorkflow, tacticalUiProblem } = await import(new URL('../src/my-account-workflows.js', import.meta.url).href)

// What Core's GET returns in tactical_ui (1.17.35), with the choice lists.
const core = {
  agent_dblclick_action: 'editagent',
  url_action_id: null,
  agent_dblclick_choices: [{ value: 'editagent', label: 'Edit agent' }, { value: 'urlaction', label: 'URL Action' }],
  url_actions: [{ id: 7, name: 'Open ticket' }],
  can_run_url_actions: true,
  dark_mode: false,
  show_community_scripts: true,
  clear_search_when_switching: true,
  default_agent_tbl_tab: 'mixed',
  default_agent_tbl_choices: [{ value: 'mixed', label: 'Mixed' }, { value: 'server', label: 'Servers' }],
  client_tree_sort: 'alpha_fail',
  client_tree_sort_choices: [{ value: 'alpha_fail', label: 'Alphabetical' }, { value: 'alpha', label: 'Alpha only' }],
  client_tree_splitter: 11,
  loading_bar_color: 'red',
  dash_info_color: 'info',
  dash_positive_color: 'positive',
  dash_negative_color: 'negative',
  dash_warning_color: 'warning',
  date_format: null,
}
const form = () => ({ ...core })

// No change: nothing is sent.
{
  let calls = 0
  const result = await saveTacticalUiWorkflow(form(), { original: core, saveMyTacticalUiPreferences: async () => { calls += 1; return {} } })
  assert.equal(result.unchanged, true)
  assert.equal(calls, 0, 'no request when nothing changed')
  assert.deepEqual(changedFields(form(), core), {})
}

// Only the changed fields are sent, in one PUT, with real booleans and a real number.
{
  const sent = []
  const edited = { ...form(), dark_mode: true, client_tree_splitter: '25', date_format: 'DD MMM YYYY' }
  const result = await saveTacticalUiWorkflow(edited, {
    original: core,
    saveMyTacticalUiPreferences: async (payload) => { sent.push(payload); return { preferences: { ...core, dark_mode: true, client_tree_splitter: 25, date_format: 'DD MMM YYYY' } } },
  })
  assert.equal(sent.length, 1, 'one request')
  assert.deepEqual(sent[0], { dark_mode: true, client_tree_splitter: 25, date_format: 'DD MMM YYYY' })
  assert.equal(typeof sent[0].dark_mode, 'boolean')
  assert.equal(typeof sent[0].client_tree_splitter, 'number')
  assert.equal(result.preferences.dark_mode, true)
}

// A URL Action choice and the double-click action go together, and the URL Action id is sent as a number.
{
  const sent = []
  await saveTacticalUiWorkflow({ ...form(), agent_dblclick_action: 'urlaction', url_action_id: '7' }, {
    original: core,
    saveMyTacticalUiPreferences: async (payload) => { sent.push(payload); return {} },
  })
  assert.deepEqual(sent[0], { agent_dblclick_action: 'urlaction', url_action_id: 7 })
}

// block_dashboard_login is not a UI preference: a form that carries it never sends it.
{
  const diff = changedFields({ ...form(), block_dashboard_login: true, dark_mode: true }, { ...core, block_dashboard_login: false })
  assert.deepEqual(diff, { dark_mode: true })
  assert.equal('block_dashboard_login' in diff, false)
}

// An empty date format is null in Core: no change, and an empty text is sent as an empty text when it is set.
{
  assert.deepEqual(changedFields({ ...form(), date_format: '' }, { ...core, date_format: null }), {})
  assert.deepEqual(changedFields({ ...form(), date_format: '' }, { ...core, date_format: 'DD' }), { date_format: '' })
}

// Local checks mirror Core and only disable Save early (AD-12: Core stays the authority).
{
  const problem = (patch) => tacticalUiProblem({ ...form(), ...patch }, changedFields({ ...form(), ...patch }, core), { canRunUrlActions: true })
  assert.match(problem({ client_tree_splitter: 0 }), /whole number from 1 to 99/)
  assert.match(problem({ client_tree_splitter: 100 }), /whole number from 1 to 99/)
  assert.match(problem({ client_tree_splitter: 1.5 }), /whole number from 1 to 99/)
  assert.equal(problem({ client_tree_splitter: 99 }), '')
  assert.match(problem({ date_format: 'x'.repeat(31) }), /up to 30/)
  assert.match(problem({ date_format: '<b>' }), /up to 30/)
  assert.equal(problem({ date_format: 'DD/MM [at] HH:mm, ss.SSS' }), '')
  assert.match(problem({ loading_bar_color: 'red;background:url(x)' }), /colour name/)
  assert.match(problem({ dash_info_color: '#12' }), /colour name/)
  assert.match(problem({ dash_info_color: '#abcde' }), /colour name/)
  assert.match(problem({ dash_info_color: 'a'.repeat(41) }), /colour name/)
  assert.equal(problem({ dash_info_color: '#12345678' }), '')
  assert.equal(problem({ dash_warning_color: 'deep-purple-3' }), '', 'a name Core accepts is sent; the shell only shows the names it knows')
  assert.equal(problem({ dash_warning_color: '#abc' }), '')
}

// A role without URL Actions keeps the existing refusal, before any request, when a URL Action is chosen.
{
  const limited = { ...core, can_run_url_actions: false }
  const edited = { ...form(), can_run_url_actions: false, agent_dblclick_action: 'urlaction' }
  assert.equal(tacticalUiProblem(edited, changedFields(edited, limited), { canRunUrlActions: false }), 'Your Tactical role does not permit URL Actions.')
  let calls = 0
  await assert.rejects(
    saveTacticalUiWorkflow(edited, { original: limited, canRunUrlActions: false, saveMyTacticalUiPreferences: async () => { calls += 1; return {} } }),
    /does not permit URL Actions/,
  )
  assert.equal(calls, 0, 'refused before any request')
  // Changing only a switch is still allowed for that role: Core checks a URL Action only when it is sent.
  const switchOnly = { ...edited, agent_dblclick_action: 'editagent', dark_mode: true }
  assert.equal(tacticalUiProblem(switchOnly, changedFields(switchOnly, limited), { canRunUrlActions: false }), '')
}

// Core's refusal: the call rejects with Core's text as sent, so the card can show it and keep the form open.
{
  const core400 = Object.assign(new Error('Unsupported value for default_agent_tbl_tab.'), { status: 400, payload: { detail: 'Unsupported value for default_agent_tbl_tab.' } })
  await assert.rejects(
    saveTacticalUiWorkflow({ ...form(), default_agent_tbl_tab: 'nope' }, { original: core, saveMyTacticalUiPreferences: async () => { throw core400 } }),
    (err) => err.message === 'Unsupported value for default_agent_tbl_tab.' && err.status === 400,
  )
}

// Source checks on the card and the view.
const card = read('../src/components/TacticalUiPreferencesCard.vue')
const view = read('../src/views/MyAccountView.vue')
assert.match(card, /v-for="item in tacticalUi\.default_agent_tbl_choices/, 'the agent tab choices come from Core')
assert.match(card, /v-for="item in tacticalUi\.client_tree_sort_choices/, 'the client tree sort choices come from Core')
assert.match(card, /v-for="item in tacticalUi\.agent_dblclick_choices/, 'the double-click choices come from Core')
assert.match(card, /v-for="item in tacticalUi\.url_actions/, 'the URL Action list comes from Core')
assert.doesNotMatch(card, /<option value="(mixed|server|alpha_fail|alpha|editagent|urlaction)"/, 'no option list is written by hand')
for (const field of ['dark_mode', 'show_community_scripts', 'clear_search_when_switching']) {
  assert.match(card, new RegExp(`v-model="form\\.${field}" type="checkbox"`), `${field} is a switch`)
}
assert.match(card, /client_tree_splitter[\s\S]{0,200}type="number" min="1" max="99"/, 'the splitter is a whole number 1 to 99')
assert.match(card, /class="auth-error" role="alert">\{\{ error \}\}/, "Core's text shows in the card as sent")
assert.match(card, /<router-link to="\/preferences">Tec-Tac preferences<\/router-link>/, 'the note links to Tec-Tac preferences')
assert.match(card, /Tec-Tac header theme is separate/, 'the note says the two themes are separate')
assert.match(card, /import \{ saveMyTacticalUiPreferences \} from '\.\.\/account'/, 'the card saves through src/account.js')
assert.match(card, /if \(busy\.value \|\| !hasChanges\.value \|\| problem\.value\) return/, 'Save is refused while nothing changed or a check fails')
// 0.12.107 (held Medium): the saved URL Action choice does not hold Save for other fields; a URL Action change is still refused by the local check.
assert.match(card, /<button class="btn primary" :disabled="busy \|\| !hasChanges \|\| !!problem" @click="save">/, 'Save is not held by the URL Action choice')
assert.doesNotMatch(card, /<button class="btn primary" :disabled="[^"]*urlActionBlocked/, 'no URL Action term on the Save button')
// 0.12.107 (Q48): the colours always show, and the card says so.
assert.doesNotMatch(card, /only when it differs/, 'the card no longer says the colours show only when they differ')
assert.match(card, /Tec-Tac always shows these colours, Tactical's defaults included\. High contrast shows its own theme colours instead\./)
// The parent applies only after Core accepted the change: the emit comes after the awaited save, inside the try.
assert.match(card, /try \{\s*const result = await saveTacticalUiWorkflow\([\s\S]*?emit\('saved'[\s\S]*?\} catch \(err\)/, 'emit only after Core accepted the save')
assert.doesNotMatch(card, /block_dashboard_login/, 'block_dashboard_login is never named by the form')
assert.match(view, /<TacticalUiPreferencesCard :tactical-ui="tacticalUi" @saved="onTacticalUiSaved" \/>/)
assert.match(view, /applyTacticalUiPreferences\(state\.context, preferences\)/)
assert.doesNotMatch(view, /saveTacticalUiWorkflow|saveMyTacticalUiPreferences/, 'the view no longer saves the Tactical form itself')

// Source scan: no browser storage, no hand-built headers, no direct fetch in the new Tactical UI files.
for (const file of ['../src/components/TacticalUiPreferencesCard.vue', '../src/my-account-workflows.js', '../src/tactical-ui-apply.js', '../src/date-format.js', '../src/module-preferences.js', '../src/views/MyAccountView.vue']) {
  const text = read(file)
  assert.doesNotMatch(text, /localStorage|sessionStorage/, `${file} uses no browser storage`)
  assert.doesNotMatch(text, /Authorization|new Headers|headers\s*:/, `${file} builds no auth header`)
  assert.doesNotMatch(text, /\bfetch\(/, `${file} calls no fetch directly`)
}

console.log('tactical-ui-preferences-0.12.106: PASS')
