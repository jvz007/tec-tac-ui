// 0.12.117: the held Low from 0.12.116. The docs, the source comments and the notes no longer say a module "cannot read another module's
// fields, values or sets" (a transport guard was not built: PUT and DELETE of a set carry no module id, so it would be a partial
// boundary). They say the editor uses only the module's own id and that Core decides what the person may read for any module id.
// The docs also describe the date and number fields.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))

const files = [...walk('docs'), ...walk('src')].filter((f) => /\.(md|js|mjs|css|vue)$/.test(f))
for (const file of files) {
  const text = read(file).replace(/\s+/g, ' ')
  assert.doesNotMatch(text, /cannot read another module'?s? (fields|filter)/i, `${file} no longer claims isolation`)
  assert.doesNotMatch(text, /cannot read another module[^.]{0,40}fields, values or sets/i, `${file}: no 'cannot read another module ... fields, values or sets'`)
}

for (const file of ['docs/module-filters.md', 'docs/module-components.md']) {
  const text = read(file).replace(/\s+/g, ' ')
  assert.match(text, /the editor only ever uses (your module's own id|that id)/, `${file} says the editor uses only the module's own id`)
  assert.match(text, /Core, not the editor, decides what the signed-in person may read for any module id/, `${file} says Core decides`)
  assert.match(text, /not a sandbox/, `${file} says it is not a sandbox`)
}
assert.match(read('src/filter-editor.js').replace(/\s+/g, ' '), /not a sandbox/)
assert.match(read('src/module-loader.js').replace(/\s+/g, ' '), /not a sandbox/)

// the editor has no module id prop
const { createFilterEditorService } = await import(new URL('../src/filter-editor.js', import.meta.url).href)
const bound = createFilterEditorService().forModule('agents', { api: async () => ({}) })
assert.deepEqual(Object.keys(bound.component.props), ['viewKey', 'modelValue', 'disabled'])

// the date and number docs
const filters = read('docs/module-filters.md')
assert.ok(filters.includes('## Date and number fields'))
for (const needle of ['Core 1.17.52', 'UI 0.12.117', 'relative_units', 'constraints', 'YYYY-MM-DD', '`{"from": "2026-10-01", "to": "2026-10-17"}`', '`{"amount": 7, "unit": "days"}`', 'UTC', 'a row with no value', 'in_the_last', 'JSON number', '10**15', 'integer', 'minimum', 'maximum']) {
  assert.ok(filters.toLowerCase().includes(needle.toLowerCase()), `module-filters.md names ${needle}`)
}
assert.match(filters, /A module declares such a field only once UI 0\.12\.117 is installed/)
assert.match(read('docs/module-components.md'), /date.*number/s)
assert.match(read('docs/module-components.md'), /not yet in the export; UI 0\.12\.117 adds its date and number controls/)
assert.match(read('docs/module-runtime-api.md'), /UI 0\.12\.117 \(not yet in the export\)/)
assert.doesNotMatch(filters, /Poppins|Inter\b/, 'the product uses the system font stacks')

console.log('filter-editor-docs-0.12.117: PASS')
