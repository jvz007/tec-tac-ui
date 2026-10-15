// 0.12.111: the documents for the shared SearchSelect and TagEditor. module-components.md lists every prop, event and limit the
// source exports; the runtime API page carries exactly one contract-row note for the components (Core writes the export row);
// the design standards name P6 and P7 and point to the components from the "shared primitive is missing" line.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { SELECT_LIMITS, TAG_LIMITS, SearchSelect, TagEditor } = await import(new URL('../src/shared-components.js', import.meta.url).href)

const doc = read('../docs/module-components.md')
assert.ok(doc.startsWith('# Shared components for modules'))

for (const prop of Object.keys(SearchSelect.props)) assert.ok(doc.includes(`\`${prop}\``), `the doc lists the SearchSelect prop ${prop}`)
for (const prop of Object.keys(TagEditor.props)) assert.ok(doc.includes(`\`${prop}\``), `the doc lists the TagEditor prop ${prop}`)
for (const event of [...SearchSelect.emits, ...TagEditor.emits]) assert.ok(doc.includes(`\`${event}\``), `the doc lists the event ${event}`)
for (const field of ['value', 'label', 'description', 'favourite', 'chip', 'chipTone', 'disabled', 'searchText']) assert.ok(doc.includes(`\`${field}\``), `the doc lists the option field ${field}`)

for (const [name, value] of Object.entries(SELECT_LIMITS)) {
  if (name === 'maxRows') assert.ok(doc.includes(`SELECT_LIMITS.maxRows`) && doc.includes(String(value)), 'the row limit')
  else assert.ok(doc.includes(String(value)), `the doc gives the text ${name}`)
}
for (const [name, value] of Object.entries(TAG_LIMITS)) assert.ok(doc.includes(`TAG_LIMITS.${name}`) && doc.includes(String(value)), `the doc gives ${name}`)
assert.ok(doc.includes('Showing the first 300. Keep typing to narrow it.'))
assert.ok(doc.includes('No matches. Check the spelling.'))
assert.ok(doc.includes('ui.authenticated.components'), 'the doc names the contract row')
assert.ok(doc.includes('registerPublic'), 'the doc says the public path gets no components')
for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab', 'Backspace']) assert.ok(doc.includes(key), `the doc names the key ${key}`)

// the runtime API page: a section after the terminal widget, one contract-row note for the components
const api = read('../docs/module-runtime-api.md')
const terminalAt = api.indexOf('## Terminal widget (terminal)')
const componentsAt = api.indexOf('## Shared components (components)')
const nextAt = api.indexOf('## hasTacticalPermission(flag)')
assert.ok(terminalAt > 0 && componentsAt > terminalAt && nextAt > componentsAt, 'the section follows the terminal widget')
const section = api.slice(componentsAt, nextAt)
const notes = api.split('\n').filter((line) => line.startsWith('**Contract row (UI 0.12.111'))
assert.equal(notes.length, 1, 'exactly one 0.12.111 contract-row note')
assert.ok(notes[0].includes('ui.authenticated.components'))
assert.equal((notes[0].match(/does not claim the export lists it/g) || []).length, 1)
assert.ok(notes[0].includes('not yet in the export'))
assert.ok(notes[0].includes('Core writes the export row'))
assert.ok(notes[0].includes('Core 1.17.41 or later and UI 0.12.111 or later'))
assert.ok(section.includes('module-components.md'))
assert.ok(section.includes('`registerPublic(context)` gets no components'))

// the design standards
const standards = read('../docs/ui-design-standards.md')
const sec17 = standards.slice(standards.indexOf('## 17. Module CSS boundary'), standards.indexOf('## 18.'))
assert.ok(sec17.includes('context.components.SearchSelect') && sec17.includes('context.components.TagEditor'), 'section 17 names the two components')
assert.ok(sec17.includes('section 22'))
const sec22 = standards.slice(standards.indexOf('## 22.'))
assert.ok(sec22.startsWith('## 22. Shared SearchSelect and TagEditor (P6 and P7)'))
assert.ok(sec22.includes('P6') && sec22.includes('P7'))
assert.ok(sec22.includes('docs/module-components.md'))
assert.ok(sec22.includes('Q57'))

console.log('shared-components-docs-0.12.111: PASS')
