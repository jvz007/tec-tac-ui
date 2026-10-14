// 0.12.106: the Tactical colours and the context scalars. Colour names, brand names and # colours resolve; a default value removes
// the property; an unknown or hostile string sets nothing; a sign-out clears all five. context.tactical_ui keeps the scalars,
// loses the choice lists, and keeps the object identity a module holds. Source checks: one watch in App.vue, the dashboard
// metric cards read the properties with the theme token as the fallback.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const apply = await import(new URL('../src/tactical-ui-apply.js', import.meta.url).href)
const { applyTacticalUiPreferences } = await import(new URL('../src/my-account-workflows.js', import.meta.url).href)
const { resolveTacticalColour, applyTacticalColours, tacticalColourKey, TACTICAL_COLOUR_FIELDS, TACTICAL_UI_CONTEXT_KEYS } = apply

// Resolution.
assert.equal(resolveTacticalColour('red'), '#F44336')
assert.equal(resolveTacticalColour('deep-purple'), '#673AB7')
assert.equal(resolveTacticalColour('info'), 'var(--accent)')
assert.equal(resolveTacticalColour('positive'), 'var(--ok)')
assert.equal(resolveTacticalColour('negative'), 'var(--danger)')
assert.equal(resolveTacticalColour('warning'), 'var(--warn)')
for (const hex of ['#abc', '#abcd', '#aabbcc', '#aabbccdd', '#ABCDEF']) assert.equal(resolveTacticalColour(hex), hex, hex)
for (const bad of ['#12', '#abcde', '#gggggg', 'deep-purple-3', 'red;background:url(x)', '<img onerror=x>', 'constructor', '__proto__', 'toString', '', 'a'.repeat(41), 5, null, undefined, { a: 1 }]) {
  assert.equal(resolveTacticalColour(bad), null, `unknown or hostile: ${String(bad)}`)
}

// A fake root that records what is set and removed.
function fakeRoot() {
  const props = new Map()
  const log = []
  return {
    props,
    log,
    style: {
      setProperty(name, value) { log.push(['set', name, value]); props.set(name, value) },
      removeProperty(name) { log.push(['remove', name]); props.delete(name) },
    },
  }
}
const DEFAULTS = { loading_bar_color: 'red', dash_info_color: 'info', dash_positive_color: 'positive', dash_negative_color: 'negative', dash_warning_color: 'warning' }
const PROPS = Object.values(TACTICAL_COLOUR_FIELDS).map((f) => f.property)
assert.deepEqual(PROPS, ['--tactical-loading-bar-color', '--tactical-dash-info-color', '--tactical-dash-positive-color', '--tactical-dash-negative-color', '--tactical-dash-warning-color'])

// Defaults remove every property, so the theme tokens stay in charge.
{
  const root = fakeRoot()
  root.props.set('--tactical-dash-info-color', 'stale')
  applyTacticalColours(root, DEFAULTS)
  assert.equal(root.props.size, 0, 'defaults leave no property set')
  assert.ok(root.log.some(([kind, name]) => kind === 'remove' && name === '--tactical-dash-info-color'), 'the stale value is removed')
}

// Chosen colours are set, resolved, and a default in another field is still removed.
{
  const root = fakeRoot()
  applyTacticalColours(root, { ...DEFAULTS, dash_info_color: 'positive', dash_negative_color: '#ff0000', loading_bar_color: 'teal' })
  assert.equal(root.props.get('--tactical-dash-info-color'), 'var(--ok)')
  assert.equal(root.props.get('--tactical-dash-negative-color'), '#ff0000')
  assert.equal(root.props.get('--tactical-loading-bar-color'), '#009688')
  assert.equal(root.props.has('--tactical-dash-positive-color'), false)
  assert.equal(root.props.has('--tactical-dash-warning-color'), false)
}

// An unknown or hostile string sets nothing: the property is removed, never set to the raw text.
{
  const root = fakeRoot()
  applyTacticalColours(root, { dash_info_color: 'red;color:blue', dash_positive_color: 'deep-purple-3', dash_negative_color: 'url(http://x)', dash_warning_color: '<b>' })
  assert.equal(root.log.filter(([kind]) => kind === 'set').length, 0, 'nothing is set from a hostile or unknown value')
  assert.equal(root.props.size, 0)
}

// A sign-out (the empty context) clears all five, and the next person starts clean.
{
  const root = fakeRoot()
  applyTacticalColours(root, { ...DEFAULTS, dash_info_color: 'pink', loading_bar_color: '#123' })
  assert.ok(root.props.size >= 2)
  applyTacticalColours(root, {})
  assert.equal(root.props.size, 0, 'a sign-out clears all five properties')
  applyTacticalColours(root, undefined)
  assert.equal(root.props.size, 0)
}

// The key changes whenever a colour changes, so the one App.vue watch fires for each change and for a sign-out.
assert.notEqual(tacticalColourKey({ dash_info_color: 'pink' }), tacticalColourKey({}))
assert.equal(tacticalColourKey({ date_format: 'x' }), tacticalColourKey({}), 'only the colours are watched')

// The context keeps the scalars, loses the choice lists and the URL Action catalogue, and keeps the object identity.
{
  const moduleHeld = { agent_dblclick_action: 'editagent', url_action_id: null, can_run_url_actions: true }
  const context = { permissions: ['x'], tactical_ui: moduleHeld }
  const full = {
    agent_dblclick_action: 'urlaction',
    url_action_id: 77,
    agent_dblclick_choices: [{ value: 'editagent', label: 'Edit agent' }],
    url_actions: [{ id: 77, name: 'Open' }],
    can_run_url_actions: true,
    dark_mode: true,
    show_community_scripts: false,
    clear_search_when_switching: true,
    default_agent_tbl_tab: 'server',
    default_agent_tbl_choices: [{ value: 'server', label: 'Servers' }],
    client_tree_sort: 'alpha',
    client_tree_sort_choices: [{ value: 'alpha', label: 'Alpha' }],
    client_tree_splitter: 30,
    loading_bar_color: 'red',
    dash_info_color: 'info',
    dash_positive_color: 'positive',
    dash_negative_color: 'negative',
    dash_warning_color: 'warning',
    date_format: 'DD MMM YYYY',
  }
  applyTacticalUiPreferences(context, full)
  assert.equal(context.tactical_ui, moduleHeld, 'the object a module holds survives')
  assert.equal(moduleHeld.agent_dblclick_action, 'urlaction')
  assert.equal(moduleHeld.client_tree_splitter, 30)
  assert.equal(moduleHeld.date_format, 'DD MMM YYYY')
  assert.equal(moduleHeld.dark_mode, true)
  for (const dropped of ['agent_dblclick_choices', 'url_actions', 'default_agent_tbl_choices', 'client_tree_sort_choices']) {
    assert.equal(dropped in moduleHeld, false, `${dropped} is not kept in the context`)
  }
  for (const key of Object.keys(moduleHeld)) assert.ok(TACTICAL_UI_CONTEXT_KEYS.includes(key), `${key} is a hot-path key`)
}
{
  const context = {}
  applyTacticalUiPreferences(context, { dark_mode: false, url_actions: [{ id: 1 }] })
  assert.deepEqual(context.tactical_ui, { dark_mode: false })
}
assert.equal(TACTICAL_UI_CONTEXT_KEYS.includes('block_dashboard_login'), false)

// Source checks.
const app = read('../src/App.vue')
assert.match(app, /watch\(\(\) => tacticalColourKey\(state\.context\?\.tactical_ui\), \(\) => \{\s*applyTacticalColours\(document\.documentElement, state\.context\?\.tactical_ui\)\s*\}, \{ immediate: true \}\)/, 'one watch sets and clears the colours')
assert.match(app, /import \{ applyTacticalColours, tacticalColourKey \} from '\.\/tactical-ui-apply'/)
const widgets = read('../src/dashboard-core-widgets.js')
assert.match(widgets, /metricCard\('Loaded', state\.moduleLoad\?\.loaded\?\.length \|\| 0, undefined, 'positive'\)/)
assert.match(widgets, /metricCard\('Failed', state\.moduleLoad\?\.failed\?\.length \|\| 0, undefined, 'negative'\)/)
assert.match(widgets, /metricCard\('Skipped', state\.moduleLoad\?\.skipped\?\.length \|\| 0, undefined, 'warning'\)/)
assert.match(widgets, /metricCard\('User'[\s\S]*?'info'\)/)
assert.match(widgets, /metricCard\('Permissions'[\s\S]*?'info'\)/)
assert.match(widgets, /metricCard\('Modules'[\s\S]*?'info'\)/)
const styles = read('../src/styles.css')
assert.match(styles, /\.dashboard-core-metric\.tone-info strong\{color:var\(--tactical-dash-info-color,var\(--accent\)\)\}/)
assert.match(styles, /\.dashboard-core-metric\.tone-positive strong\{color:var\(--tactical-dash-positive-color,var\(--ok\)\)\}/)
assert.match(styles, /\.dashboard-core-metric\.tone-negative strong\{color:var\(--tactical-dash-negative-color,var\(--danger\)\)\}/)
assert.match(styles, /\.dashboard-core-metric\.tone-warning strong\{color:var\(--tactical-dash-warning-color,var\(--warn\)\)\}/)
// Only tactical-ui-apply.js sets the properties, so nothing else writes a parallel palette.
for (const file of ['../src/App.vue', '../src/dashboard-core-widgets.js', '../src/views/MyAccountView.vue', '../src/components/TacticalUiPreferencesCard.vue', '../src/my-account-workflows.js']) {
  assert.doesNotMatch(read(file), /--tactical-/, `${file} names no Tactical property`)
}
assert.match(read('../src/tactical-ui-apply.js'), /root\.style\.setProperty\(property, css\)/)

console.log('tactical-ui-apply-0.12.106: PASS')
