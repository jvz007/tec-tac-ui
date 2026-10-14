// 0.12.106: applies the Tactical UI preferences Core returns (Core 1.17.35). Two jobs:
// (1) the small scalars stay in context.tactical_ui, which the module runtime reads (the choice lists are dropped);
// (2) the five colours become CSS custom properties on the document root. 0.12.107: they are always set for a signed-in
// person, Tactical's defaults included, so Tec-Tac shows Tactical's palette. A colour Tec-Tac cannot show (such as a
// numbered shade, deep-purple-3) is replaced by that field's Tactical default, so nothing hostile or unknown is ever set.
// Signed out (no tactical_ui object) all five properties are removed. High contrast does not read them: src/styles.css
// gives that theme its own rules, so a theme switch needs no JavaScript.

// Field, CSS property and Tactical's default for each colour (Tactical 1.5.2 accounts.User defaults).
export const TACTICAL_COLOUR_FIELDS = Object.freeze({
  loading_bar_color: Object.freeze({ property: '--tactical-loading-bar-color', fallback: 'red' }),
  dash_info_color: Object.freeze({ property: '--tactical-dash-info-color', fallback: 'info' }),
  dash_positive_color: Object.freeze({ property: '--tactical-dash-positive-color', fallback: 'positive' }),
  dash_negative_color: Object.freeze({ property: '--tactical-dash-negative-color', fallback: 'negative' }),
  dash_warning_color: Object.freeze({ property: '--tactical-dash-warning-color', fallback: 'warning' }),
})

// The keys the hot-path context carries (Core's tactical_ui_context). The choice lists and URL Action catalogue are not here.
export const TACTICAL_UI_CONTEXT_KEYS = Object.freeze([
  'agent_dblclick_action',
  'url_action_id',
  'can_run_url_actions',
  'dark_mode',
  'show_community_scripts',
  'clear_search_when_switching',
  'default_agent_tbl_tab',
  'client_tree_sort',
  'client_tree_splitter',
  ...Object.keys(TACTICAL_COLOUR_FIELDS),
  'date_format',
])

// Brand names are Tactical's own Quasar brand colours (the four hex values of Tactical's quasar.variables.sass, the read-only
// reference). Only these values are taken; no code is copied.
const BRAND_COLOURS = Object.freeze({
  info: '#31CCEC',
  positive: '#21BA45',
  negative: '#C10015',
  warning: '#F2C037',
})
// Base names are the Material 500 values Quasar uses for them.
const BASE_COLOURS = Object.freeze({
  red: '#F44336',
  pink: '#E91E63',
  purple: '#9C27B0',
  'deep-purple': '#673AB7',
  indigo: '#3F51B5',
  blue: '#2196F3',
  'light-blue': '#03A9F4',
  cyan: '#00BCD4',
  teal: '#009688',
  green: '#4CAF50',
  'light-green': '#8BC34A',
  lime: '#CDDC39',
  yellow: '#FFEB3B',
  amber: '#FFC107',
  orange: '#FF9800',
  'deep-orange': '#FF5722',
  brown: '#795548',
  grey: '#9E9E9E',
  'blue-grey': '#607D8B',
  black: '#000000',
  white: '#FFFFFF',
})
const HEX_COLOUR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

function own(table, key) {
  return Object.prototype.hasOwnProperty.call(table, key)
}

// The CSS colour for one Tactical colour value, or null when Tec-Tac cannot show it. Never returns the raw input
// unless it is a # colour of 3, 4, 6 or 8 digits.
export function resolveTacticalColour(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40) return null
  if (HEX_COLOUR.test(value)) return value
  if (own(BRAND_COLOURS, value)) return BRAND_COLOURS[value]
  if (own(BASE_COLOURS, value)) return BASE_COLOURS[value]
  return null
}

// A key that changes whenever a colour changes, and whenever the person signs in or out. A signed-out context (null) and a
// signed-in one with empty fields differ, so the App.vue watch applies Tactical's defaults on sign-in.
export function tacticalColourKey(tacticalUi) {
  if (!tacticalUi || typeof tacticalUi !== 'object') return 'signed-out'
  return ['signed-in', ...Object.keys(TACTICAL_COLOUR_FIELDS).map((field) => (typeof tacticalUi[field] === 'string' ? tacticalUi[field] : ''))].join('|')
}

// Sets the five custom properties on root for a signed-in person, each to the chosen colour or, when Tec-Tac cannot show
// the choice, to that field's Tactical default. Without a tactical_ui object (signed out) all five are removed.
export function applyTacticalColours(root, tacticalUi) {
  if (!root || !root.style) return
  const signedIn = Boolean(tacticalUi) && typeof tacticalUi === 'object'
  for (const [field, { property, fallback }] of Object.entries(TACTICAL_COLOUR_FIELDS)) {
    if (!signedIn) {
      root.style.removeProperty(property)
      continue
    }
    const chosen = typeof tacticalUi[field] === 'string' ? tacticalUi[field] : ''
    const css = resolveTacticalColour(chosen) || resolveTacticalColour(fallback)
    root.style.setProperty(property, css)
  }
}
