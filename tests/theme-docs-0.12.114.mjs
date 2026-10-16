// 0.12.114: the documents for the tokens, the tt-ws scope and the kit. module-components.md lists every prop and event of the four new
// components and the three new SearchSelect props; the standards file has sections 23 and 24, still names Q57, names the board and
// the order of authority; the runtime API page carries exactly one 0.12.114 contract-row note that does not claim the export lists it.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { DataTable, FormRow, EditorWindow, Stepper, SearchSelect } = await import(new URL('../src/shared-components.js', import.meta.url).href).then((m) => ({ ...m.sharedComponents }))
const { KIT_LIMITS } = await import(new URL('../src/shared-kit-logic.js', import.meta.url).href)

const doc = read('../docs/module-components.md')
const kitStart = doc.indexOf('## The component kit (0.12.114)')
assert.ok(kitStart > 0, 'the kit section exists')
const kitDoc = doc.slice(kitStart, doc.indexOf('## Limits'))
for (const [name, component] of Object.entries({ DataTable, FormRow, EditorWindow, Stepper })) {
  assert.ok(kitDoc.includes(`### ${name}`), `the doc has a heading for ${name}`)
  for (const prop of Object.keys(component.props)) assert.ok(kitDoc.includes(`\`${prop}\``), `the doc lists the ${name} prop ${prop}`)
  for (const event of component.emits || []) assert.ok(kitDoc.includes(`\`${event}\``), `the doc lists the ${name} event ${event}`)
}
for (const prop of ['required', 'invalid', 'describedBy']) assert.ok(prop in SearchSelect.props && doc.includes(`\`${prop}\``), `the doc lists the SearchSelect prop ${prop}`)
for (const slot of ['actions', 'properties', 'content', 'footer']) assert.ok(kitDoc.includes(`\`${slot}\``), `the doc names the ${slot} area`)
assert.ok(kitDoc.includes('context.confirm'), 'the doc gives the confirmation rule')
assert.ok(kitDoc.includes('KIT_LIMITS') === false, 'limits are in the Limits table')
for (const [name, value] of Object.entries({ maxRows: KIT_LIMITS.maxRows, maxColumns: KIT_LIMITS.maxColumns, maxSteps: KIT_LIMITS.maxSteps })) {
  assert.ok(doc.includes(`KIT_LIMITS.${name}`) && doc.includes(String(value)), `the doc gives ${name}`)
}
assert.ok(doc.includes(KIT_LIMITS.cappedText))
assert.ok(doc.includes('registerPublic'))

const standards = read('../docs/ui-design-standards.md')
assert.ok(standards.includes('docs/ui-brand-board/tec-tac-ui-brand-board.html'), 'the board is named as the visual spec')
assert.ok(/Order of authority:\*\* `src\/styles\.css` first, then this file, then the board/.test(standards), 'the order of authority')
assert.ok(standards.indexOf('brand-board') < standards.indexOf('## 1. Core rule'), 'the board is named in the opening lines')
const sec23 = standards.slice(standards.indexOf('## 23.'), standards.indexOf('## 24.'))
const sec24 = standards.slice(standards.indexOf('## 24.'))
assert.ok(sec23.startsWith('## 23. Size, density and radius tokens'))
assert.ok(sec24.startsWith('## 24. The component kit'))
for (const token of ['--text-body', '--text-ws', '--text-sm', '--text-xs', '--cell-y', '--cell-x', '--ctl-y', '--ctl-x', '--radius-control', '--radius-panel', '--label-track-ws']) assert.ok(sec23.includes(`\`${token}\``), `section 23 lists ${token}`)
assert.ok(sec23.includes('tt-ws') && sec23.includes('15.5px') && sec23.includes('11.6px') && sec23.includes('secondary button') && sec23.includes('3px'))
for (const name of ['DataTable', 'FormRow', 'EditorWindow', 'Stepper']) assert.ok(sec24.includes(`\`${name}\``), `section 24 names ${name}`)
for (const p of ['P1', 'P2', 'P3', 'P5']) assert.ok(sec24.includes(p), `section 24 names ${p}`)
assert.ok(sec24.includes('AD-27') && sec24.includes('context.confirm'))
const sec22 = standards.slice(standards.indexOf('## 22.'), standards.indexOf('## 23.'))
assert.ok(sec22.includes('Q57'), 'section 22 still names Q57')
assert.ok(!sec22.includes('are not built'), 'section 22 no longer says the kit is not built')

const api = read('../docs/module-runtime-api.md')
const notes = api.split('\n').filter((line) => line.includes('0.12.114'))
assert.equal(notes.length, 1, 'exactly one 0.12.114 line')
assert.ok(notes[0].startsWith('**Contract row addition (UI 0.12.114, not yet in the export).**'))
assert.equal((notes[0].match(/does not claim the export lists it/g) || []).length, 1)
assert.ok(!/the export lists (them|it)\b(?!\.)/.test(notes[0].replace('does not claim the export lists it', '')), 'no claim that the export lists the rows')
for (const name of ['DataTable', 'FormRow', 'EditorWindow', 'Stepper', 'required', 'invalid', 'describedBy', '--text-ws', 'tt-ws']) assert.ok(notes[0].includes(name), `the note names ${name}`)

console.log('theme-docs-0.12.114: PASS')
