// 0.12.100: the UI half of the browser contract export. docs/module-runtime-api.md names the two rows Core exports
// (ui.authenticated.navigation with tacticalPermission, ui.authenticated.popup with popupPublishers) with a Contract export note
// under each, in the right section, with the shipped UI version. The flag rule still says strictly and no superuser shortcut.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const doc = fs.readFileSync(new URL('../docs/module-runtime-api.md', import.meta.url), 'utf8')
const at = (needle, from = 0) => {
  const index = doc.indexOf(needle, from)
  assert.ok(index >= 0, `${needle} is in the document`)
  return index
}

const navigation = at('## Navigation permissions')
const router = at('## Module router')
const popupMode = at('## Popup mode')
const popupNotLoad = at('**What a popup does not load.**')

// Navigation: the export note sits in the Navigation permissions section and names the row, the field and the shipped version.
const navNote = at('**Contract export (UI 0.12.100).** Browser contract row `ui.authenticated.navigation`', navigation)
assert.ok(navNote < router, 'the navigation note sits in the navigation section')
const navSection = doc.slice(navigation, router)
assert.match(navSection, /`ui\.authenticated\.navigation`/)
assert.match(navSection, /tacticalPermission/)
assert.match(navSection, /UI 0\.12\.99/)
assert.match(navSection, /strictly/)
assert.match(navSection, /no superuser shortcut/)
assert.match(navSection, /hidden outside a backend context/)
assert.match(navSection, /additive/)

// Popup: the export note sits in Popup mode, before "What a popup does not load", and names the row, the field and 0.12.97.
const popupNote = at('**Contract export (UI 0.12.100).** Browser contract row `ui.authenticated.popup`', popupMode)
assert.ok(popupNote < popupNotLoad, 'the popup note sits in the popup section')
const popupSection = doc.slice(popupMode, popupNotLoad)
assert.match(popupSection, /`ui\.authenticated\.popup`/)
assert.match(popupSection, /`route\.meta\.popupPublishers`/)
assert.match(popupSection, /UI 0\.12\.97/)
assert.match(popupSection, /`\/popup\/`/)
assert.match(popupSection, /console/)

// Exactly one note per row: a second copy would drift.
assert.equal(doc.split('**Contract export (UI 0.12.100).** Browser contract row `ui.authenticated.navigation`').length - 1, 1)
assert.equal(doc.split('**Contract export (UI 0.12.100).** Browser contract row `ui.authenticated.popup`').length - 1, 1)

// The flag rule keeps its wording: strict and no superuser shortcut.
assert.match(doc, /each flag is strictly `true`/)
assert.match(doc, /no superuser shortcut/)
assert.match(doc, /`tacticalPermission`/)
assert.match(doc, /`popupPublishers`/)

console.log('contract docs 0.12.100: PASS')
