// 0.12.107 (Q48, Johan 14 Oct 2026): the five Tactical colours are always applied for a signed-in person, Tactical's own
// defaults included. Brand names resolve to Tactical's Quasar brand colours; a value Tec-Tac cannot show falls back to that
// field's default, so nothing hostile is ever set; a signed-out context (tactical_ui null) removes all five; the watch key
// tells a signed-out context from a signed-in one with empty fields; High contrast has its own rules in styles.css; the card
// text says the colours always show.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { resolveTacticalColour, applyTacticalColours, tacticalColourKey, TACTICAL_COLOUR_FIELDS } = await import(new URL('../src/tactical-ui-apply.js', import.meta.url).href)

// The four brand colours, and the Material base value of red.
assert.equal(resolveTacticalColour('info'), '#31CCEC')
assert.equal(resolveTacticalColour('positive'), '#21BA45')
assert.equal(resolveTacticalColour('negative'), '#C10015')
assert.equal(resolveTacticalColour('warning'), '#F2C037')
assert.equal(resolveTacticalColour('red'), '#F44336')
assert.equal(resolveTacticalColour('deep-purple-3'), null, 'a numbered shade is not resolved; the field default applies instead')

// The four brand values are Tactical's own (quasar.variables.sass in the read-only reference). Checked when that reference is present.
const reference = new URL('../../../reference/tacticalrmm-web/src/css/quasar.variables.sass', import.meta.url)
if (fs.existsSync(reference)) {
  const sass = fs.readFileSync(reference, 'utf8')
  assert.match(sass, /\$positive\s*:\s*#21BA45/)
  assert.match(sass, /\$negative\s*:\s*#C10015/)
  assert.match(sass, /\$info\s*:\s*#31CCEC/)
  assert.match(sass, /\$warning\s*:\s*#F2C037/)
}

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
// 0.12.108: the loading bar is not in the defaults; its default is the theme colour (removed, not set).
const DEFAULT_PROPS = {
  '--tactical-dash-info-color': '#31CCEC',
  '--tactical-dash-positive-color': '#21BA45',
  '--tactical-dash-negative-color': '#C10015',
  '--tactical-dash-warning-color': '#F2C037',
}
const TACTICAL_DEFAULTS = { loading_bar_color: 'red', dash_info_color: 'info', dash_positive_color: 'positive', dash_negative_color: 'negative', dash_warning_color: 'warning' }

// Default values set all five to Tactical's palette, so every person sees it.
{
  const root = fakeRoot()
  applyTacticalColours(root, TACTICAL_DEFAULTS)
  assert.deepEqual(Object.fromEntries(root.props), DEFAULT_PROPS)
  assert.deepEqual(root.log.filter(([kind]) => kind === 'remove').map(([, name]) => name), ['--tactical-loading-bar-color'], 'only the loading bar is removed for a signed-in person (0.12.108)')
}

// A signed-in person whose fields are empty (an older Core or a blank answer) gets Tactical's defaults too.
{
  const root = fakeRoot()
  applyTacticalColours(root, {})
  assert.deepEqual(Object.fromEntries(root.props), DEFAULT_PROPS)
}

// A chosen colour is set; the others keep their default.
{
  const root = fakeRoot()
  applyTacticalColours(root, { ...TACTICAL_DEFAULTS, dash_info_color: 'teal', dash_negative_color: '#ff0000' })
  assert.equal(root.props.get('--tactical-dash-info-color'), '#009688')
  assert.equal(root.props.get('--tactical-dash-negative-color'), '#ff0000')
  assert.equal(root.props.get('--tactical-dash-positive-color'), '#21BA45')
  assert.equal(root.props.has('--tactical-loading-bar-color'), false, 'the loading bar stays on the theme colour (0.12.108)')
}

// A numbered shade, a hostile string or an unknown name sets that field's Tactical default, never the raw text.
{
  const root = fakeRoot()
  applyTacticalColours(root, {
    loading_bar_color: 'red;background:url(x)',
    dash_info_color: 'deep-purple-3',
    dash_positive_color: 'url(http://x)',
    dash_negative_color: '<b>',
    dash_warning_color: '#12',
  })
  assert.deepEqual(Object.fromEntries(root.props), DEFAULT_PROPS)
  for (const [, , value] of root.log.filter(([kind]) => kind === 'set')) assert.ok(Object.values(DEFAULT_PROPS).includes(value), `only a resolved value is set: ${value}`)
}

// Signed out (tactical_ui null, or absent) removes all five and sets none.
for (const signedOut of [null, undefined]) {
  const root = fakeRoot()
  applyTacticalColours(root, { ...TACTICAL_DEFAULTS, dash_info_color: 'pink' })
  assert.ok(root.props.size === 4)
  applyTacticalColours(root, signedOut)
  assert.equal(root.props.size, 0, `signed out (${signedOut}) removes all five`)
  assert.equal(root.log.filter(([kind]) => kind === 'set' ).length, 4, 'only the earlier signed-in call set values')
}

// The watch key: a signed-out context differs from a signed-in one with empty fields; a colour change changes it.
assert.notEqual(tacticalColourKey(null), tacticalColourKey({}))
assert.equal(tacticalColourKey(undefined), tacticalColourKey(null), 'both are signed out')
assert.equal(tacticalColourKey({ date_format: 'x' }), tacticalColourKey({}), 'only the colours are in the key')
assert.notEqual(tacticalColourKey({ dash_info_color: 'pink' }), tacticalColourKey({}))
assert.equal(Object.keys(TACTICAL_COLOUR_FIELDS).length, 5)

// High contrast: one rule per tone class, each on the theme token, and the bar on the accent. Base rules keep the Tactical colour.
const styles = read('../src/styles.css')
assert.match(styles, /\.dashboard-core-metric\.tone-info strong\{color:var\(--tactical-dash-info-color,var\(--accent\)\)\}/)
assert.match(styles, /\.dashboard-core-metric\.tone-positive strong\{color:var\(--tactical-dash-positive-color,var\(--ok\)\)\}/)
assert.match(styles, /\.dashboard-core-metric\.tone-negative strong\{color:var\(--tactical-dash-negative-color,var\(--danger\)\)\}/)
assert.match(styles, /\.dashboard-core-metric\.tone-warning strong\{color:var\(--tactical-dash-warning-color,var\(--warn\)\)\}/)
assert.match(styles, /:root\[data-theme="high-contrast"\] \.dashboard-core-metric\.tone-info strong\{color:var\(--accent\)\}/)
assert.match(styles, /:root\[data-theme="high-contrast"\] \.dashboard-core-metric\.tone-positive strong\{color:var\(--ok\)\}/)
assert.match(styles, /:root\[data-theme="high-contrast"\] \.dashboard-core-metric\.tone-negative strong\{color:var\(--danger\)\}/)
assert.match(styles, /:root\[data-theme="high-contrast"\] \.dashboard-core-metric\.tone-warning strong\{color:var\(--warn\)\}/)
assert.match(styles, /:root\[data-theme="high-contrast"\] \.app-loading-bar\{background:var\(--loading-bar\)\}/)
assert.match(styles, /\.app-loading-bar\{[^}]*background:var\(--tactical-loading-bar-color,var\(--loading-bar\)\)/)

// The My Account card says the colours always show, and that High contrast shows the theme colours.
const card = read('../src/components/TacticalUiPreferencesCard.vue')
assert.doesNotMatch(card, /only when it differs/, 'the old rule is gone from the card')
assert.match(card, /Tec-Tac always shows the figure colours, Tactical's defaults included\. The loading bar follows the theme colour until you choose one\. High contrast shows its own theme colours instead\./)

// The design standards say the same, and no longer describe the old rule.
const standards = read('../docs/ui-design-standards.md')
assert.doesNotMatch(standards, /sets a property only when the person's choice differs/)
assert.doesNotMatch(standards, /only when the person's choice differs/)
assert.match(standards, /High contrast does not read the Tactical colours/)
assert.match(standards, /`info` `#31CCEC`, `positive` `#21BA45`, `negative` `#C10015`, `warning` `#F2C037`/)

console.log('tactical-colours-always-0.12.107: PASS')
