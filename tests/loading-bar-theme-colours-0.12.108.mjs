// 0.12.108 (Johan, 14 Oct 2026, globalsettings 0.6.0): the top loading bar's default is the theme colour, not Tactical's red.
// A colour the person chose wins. Core sends only the value, so the name 'red', an empty value, a missing field and a value
// Tec-Tac cannot show all mean "not chosen" and the property is removed. The four figure colours are unchanged (always set).
// The theme tokens --loading-bar are defined in the three theme blocks, meet 3 to 1 against each page background, and the
// card, the design standards and the release notes say the same.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { applyTacticalColours, loadingBarUsesTheme, resolveTacticalColour, tacticalColourKey, TACTICAL_COLOUR_FIELDS } = await import(new URL('../src/tactical-ui-apply.js', import.meta.url).href)

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

const TACTICAL = { loading_bar_color: 'red', dash_info_color: 'info', dash_positive_color: 'positive', dash_negative_color: 'negative', dash_warning_color: 'warning' }
const FIGURE_PROPS = {
  '--tactical-dash-info-color': '#31CCEC',
  '--tactical-dash-positive-color': '#21BA45',
  '--tactical-dash-negative-color': '#C10015',
  '--tactical-dash-warning-color': '#F2C037',
}

// The loading bar field is marked as taking the theme colour; the other four are not.
assert.equal(TACTICAL_COLOUR_FIELDS.loading_bar_color.themeDefault, true)
for (const field of ['dash_info_color', 'dash_positive_color', 'dash_negative_color', 'dash_warning_color']) {
  assert.equal(TACTICAL_COLOUR_FIELDS[field].themeDefault, undefined, `${field} has no theme default`)
}
assert.equal(Object.keys(TACTICAL_COLOUR_FIELDS).length, 5)

// (1) The theme default: Tactical's name 'red', an empty value, a missing field, hostile and unresolvable values remove the property.
const themeDefaults = ['red', '', undefined, null, 5, ' red', 'Red', 'red;background:url(x)', '<b>', 'deep-purple-3', '#12', '#12345', 'constructor', '__proto__', 'a'.repeat(41)]
for (const value of themeDefaults) {
  const root = fakeRoot()
  applyTacticalColours(root, { ...TACTICAL, loading_bar_color: value })
  assert.equal(root.props.has('--tactical-loading-bar-color'), false, `the loading bar is not set for ${JSON.stringify(value)}`)
  assert.equal(loadingBarUsesTheme(value), true, `${JSON.stringify(value)} counts as not chosen`)
  assert.deepEqual(Object.fromEntries(root.props), FIGURE_PROPS, 'the four figure colours are still set')
}
{
  const root = fakeRoot()
  applyTacticalColours(root, { dash_info_color: 'info' })
  assert.equal(root.props.has('--tactical-loading-bar-color'), false, 'a missing loading bar field is the theme default')
  assert.equal(root.props.get('--tactical-dash-info-color'), '#31CCEC')
}

// (2) A chosen value is set and wins: a name, a # colour of 3, 6 or 8 digits. The figure colours are always set.
for (const [value, css] of [['teal', '#009688'], ['#F44336', '#F44336'], ['#123', '#123'], ['#abcdef', '#abcdef'], ['#11223380', '#11223380'], ['info', '#31CCEC'], ['pink', '#E91E63']]) {
  const root = fakeRoot()
  applyTacticalColours(root, { ...TACTICAL, loading_bar_color: value })
  assert.equal(root.props.get('--tactical-loading-bar-color'), css, `${value} is the chosen loading bar colour`)
  assert.equal(loadingBarUsesTheme(value), false, `${value} is a chosen colour`)
  assert.equal(root.props.get('--tactical-dash-negative-color'), '#C10015')
  assert.equal(root.props.size, 5)
}
// Tactical's own red, typed as its hex value, is the person's choice and is shown.
assert.equal(resolveTacticalColour('#F44336'), '#F44336')
assert.equal(loadingBarUsesTheme('#F44336'), false)

// (3) Signed out removes all five properties, the loading bar included; the theme colour shows.
for (const signedOut of [null, undefined]) {
  const root = fakeRoot()
  applyTacticalColours(root, { ...TACTICAL, loading_bar_color: 'teal' })
  assert.equal(root.props.size, 5)
  applyTacticalColours(root, signedOut)
  assert.equal(root.props.size, 0, 'signed out removes all five')
}

// (4) The watch key is unchanged: it still covers the five colours, so a theme switch needs no JavaScript.
assert.notEqual(tacticalColourKey({ loading_bar_color: 'teal' }), tacticalColourKey({ loading_bar_color: 'red' }))
assert.notEqual(tacticalColourKey(null), tacticalColourKey({}))

// (5) styles.css: one --loading-bar per theme block, the bar reads the saved colour then the theme token, High contrast is forced.
const css = read('../src/styles.css')
const lines = css.split('\n')
const themeLine = (prefix) => {
  const line = lines.find((l) => l.startsWith(prefix))
  assert.ok(line, `the theme block ${prefix} exists`)
  return line
}
const dark = themeLine(':root,:root[data-theme="dark"]{')
const light = themeLine(':root[data-theme="light"]{')
const highContrast = themeLine(':root[data-theme="high-contrast"]{')
assert.equal(css.split('--loading-bar:').length - 1, 3, 'exactly one --loading-bar per theme block')

// Resolves one custom property inside a theme block, following one var() reference.
function tokenIn(block, name) {
  const match = new RegExp(`(?:^|[{;])${name}:([^;}]+)`).exec(block)
  assert.ok(match, `${name} is set in the block`)
  const value = match[1].trim()
  const ref = /^var\((--[a-z-]+)\)$/.exec(value)
  return ref ? tokenIn(block, ref[1]) : value
}
const themes = [
  { name: 'dark', block: dark, bg: '#141517', bar: '#4dabf7' },
  { name: 'light', block: light, bg: '#f8f9fa', bar: '#2b5fd9' },
  { name: 'high-contrast', block: highContrast, bg: '#000', bar: '#00ff5f' },
]
// Three-digit hex (#000) is expanded first, so the high-contrast background is measured too.
const expandHex = (hex) => (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex)
const luminance = (value) => {
  const hex = expandHex(value)
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}
const contrast = (a, b) => {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
for (const theme of themes) {
  const bar = tokenIn(theme.block, '--loading-bar')
  assert.equal(bar.toLowerCase(), theme.bar, `${theme.name} --loading-bar resolves to ${theme.bar}`)
  const bg = tokenIn(theme.block, '--bg')
  assert.equal(bg.toLowerCase(), theme.bg, `${theme.name} page background is ${theme.bg}`)
  const ratio = contrast(theme.bar, theme.bg)
  assert.ok(ratio >= 3, `${theme.name} loading bar is at least 3 to 1 on its background (${ratio.toFixed(2)})`)
}
// The light value is a royal blue (near #2b5fd9): the ratio the design standards quote is 5.3 to 1.
assert.equal(contrast('#2b5fd9', '#f8f9fa').toFixed(1), '5.3')

assert.match(css, /\.app-loading-bar\{[^}]*background:var\(--tactical-loading-bar-color,var\(--loading-bar\)\)/, 'the saved colour wins over the theme token')
assert.match(css, /:root\[data-theme="high-contrast"\] \.app-loading-bar\{background:var\(--loading-bar\)\}/, 'High contrast forces the theme token, so a saved colour cannot override it')
assert.doesNotMatch(css, /app-loading-bar\{[^}]*var\(--accent\)/, 'the loading bar no longer reads the accent')
assert.doesNotMatch(css, /:root\[data-theme="high-contrast"\] \.app-loading-bar\{background:var\(--accent\)\}/, 'the old High contrast accent rule is gone')

// (6) The My Account card: the theme note, the swatch on the token, the figure wording, and the unresolvable wording.
const card = read('../src/components/TacticalUiPreferencesCard.vue')
assert.match(card, /'Using the theme colour\. Choose any other colour to use your own\.'/)
assert.match(card, /'Tec-Tac does not show this name, so the theme colour is used\.'/)
assert.match(card, /return 'var\(--loading-bar\)'/)
assert.match(card, /Tec-Tac always shows the figure colours, Tactical's defaults included\. The loading bar follows the theme colour until you choose one\. High contrast shows its own theme colours instead\./)
assert.match(card, /import \{ loadingBarUsesTheme, resolveTacticalColour, TACTICAL_COLOUR_FIELDS \} from '\.\.\/tactical-ui-apply'/)

// (7) The design standards: the 9.2 row, the section 11 paragraph and the contrast figure.
const standards = read('../docs/ui-design-standards.md')
assert.match(standards, /\| `loading_bar_color` \| `--tactical-loading-bar-color` \| `red` [^|]*\| `--loading-bar`/)
assert.match(standards, /soft blue in Dark \(`#4dabf7`\), royal blue in Light \(`#2b5fd9`, 5\.3 to 1 on the page background\) and green in High contrast \(`#00ff5f`/)
assert.match(standards, /a person who wants Tactical's red types `#F44336`/)
assert.doesNotMatch(standards, /`--accent` \(the loading bar, section 11\)/)

console.log('loading-bar-theme-colours-0.12.108: PASS')
