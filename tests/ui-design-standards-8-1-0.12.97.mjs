// 0.12.97: UI design standards section 8.1 follows AD-27: one plain Yes or No dialog, no typed text, and the four
// system-breaking actions keep their stricter confirmation.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const doc = fs.readFileSync(new URL('../docs/ui-design-standards.md', import.meta.url), 'utf8')
const start = doc.indexOf('### 8.1 Confirmation dialog')
const end = doc.indexOf('### 8.2 Input/action dialog')
assert.ok(start > 0 && end > start)
const section = doc.slice(start, end)

assert.match(section, /Yes or No/)
assert.ok(section.includes('context.confirm'))
assert.ok(section.includes('AD-27'))
assert.ok(section.includes('Are you sure?'))
assert.match(section, /Focus starts on No/)
assert.match(section, /Escape answers No/)
for (const action of ['Restore a backup', 'Purge storage', 'Delete a client or a site', 'AD-20 hand-back step on Modules']) {
  assert.ok(section.includes(action), action)
}
assert.match(section, /No typed name, hostname, alert number or count/)
assert.match(section, /keeps its own typed confirmation until its next release/)
assert.ok(!doc.includes('Use typed confirmation only for genuinely dangerous'))
assert.ok(!section.includes('<div class="modal-backdrop">'), 'the old HTML example is gone')

// No other section tells a module to type a name.
const rest = doc.slice(0, start) + doc.slice(end)
assert.ok(!/type (the|its|a) (name|hostname|id)|typed confirmation|typed name/i.test(rest.replace(/No typed name[^\n]*/g, '')), 'no other section asks for typed text')
assert.match(doc, /confirmations use the shell Yes or No dialog/)

console.log('ui-design-standards 8.1 0.12.97: ok')
