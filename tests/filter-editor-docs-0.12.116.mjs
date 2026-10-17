// 0.12.116: the FilterEditor docs name every prop, event, route, the Only me readers rule, the limits and "not yet in the export", and
// make no promise of a Shared switch.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const doc = read('../docs/module-filters.md')
const comps = read('../docs/module-components.md')
const api = read('../docs/module-runtime-api.md')

assert.ok(doc.startsWith('# Module filters (FilterEditor)'))
for (const needle of [
  'context.components.FilterEditor', 'context.Vue', 'h(FilterEditor',
  'viewKey', 'modelValue', 'disabled', 'update:modelValue', 'apply', 'filterSetId',
  '^[a-z0-9][a-z0-9_-]{0,60}$', 'no module id prop',
  '/api/tfd/filter-sets/fields/', '/api/tfd/filter-values/', '/api/tfd/filter-sets/', 'POST', 'PUT', 'DELETE',
  'readers: [<the signed-in person', 'never sends an empty readers list', 'context.context.user.id',
  'Core 1.17.50', 'not yet in the export',
  '50', '20', '200', '160', '100', 'Levels of groups',
  'Match ALL or ANY', 'Equals', 'Does not equal', 'Contains', 'Starts with', 'Ends with',
  'The list of values could not load. Type the value instead.', 'This list has no filters yet.',
  'Choose a value for', 'Yes or No', 'field_unavailable', 'name_conflict', 'not_found', 'permission_denied', 'audit_failed',
  'Reload the page or sign in again to save a set only you can use.', 'Shared', 'own id', 'confirm',
]) assert.ok(doc.includes(needle), `module-filters.md names ${needle}`)
assert.doesNotMatch(doc, /Shared switch|will (add|ship|offer)|coming soon/i, 'no promise of a Shared switch')
assert.doesNotMatch(doc, /Poppins|Inter\b/, 'the product uses the system font stacks')

assert.ok(comps.includes('## FilterEditor (universal filters)'))
assert.ok(comps.includes('module-filters.md'))
assert.ok(comps.includes('`FilterEditor`, which is not yet in the export'))
const rows = api.split('\n').filter((line) => line.startsWith('**Contract row addition (UI 0.12.116, not yet in the export).**'))
assert.equal(rows.length, 1, 'one FilterEditor row paragraph in the runtime page')
for (const needle of ['FilterEditor', 'viewKey', 'modelValue', 'disabled', 'update:modelValue', 'apply', 'bound per module', 'Core 1.17.50', 'registerPublic gets no components', 'after the next export']) {
  assert.ok(rows[0].includes(needle), `the row paragraph names ${needle}`)
}
assert.ok(!/Shared/.test(rows[0]), 'the row makes no claim about sharing')

console.log('filter-editor-docs-0.12.116: PASS')
