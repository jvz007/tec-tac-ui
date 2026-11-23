// 0.13.5 (advancedalerts 0.1.5 request, 23 November 2026): the Roles screen shows a single-word action as it is written.
// view, read, list, manage and notify each show their own word, so `.view` and `.read` are no longer both "read".
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src = fs.readFileSync(new URL('../src/components/access/RolesPanel.vue', import.meta.url), 'utf8')
const start = src.indexOf('function extensionPermissionLabel(')
assert.ok(start > 0, 'extensionPermissionLabel exists')
const end = src.indexOf('\n}\n', start)
const body = src.slice(start, end + 3)
const label = new Function(`${body}\nreturn extensionPermissionLabel`)()

const id = 'advancedalerts'
assert.equal(label('advancedalerts.view', id), 'view — advancedalerts')
assert.equal(label('advancedalerts.read', id), 'read — advancedalerts')
assert.equal(label('advancedalerts.list', id), 'list — advancedalerts')
assert.equal(label('advancedalerts.manage', id), 'manage — advancedalerts')
assert.equal(label('advancedalerts.notify', id), 'notify — advancedalerts')
assert.notEqual(label('advancedalerts.view', id), label('advancedalerts.read', id), 'view and read differ')
assert.equal(label('advancedalerts.apps.view', id), 'apps view — advancedalerts')
assert.equal(label('', id, ['some-group']), 'some group — advancedalerts')
assert.equal(label('', id), 'permission — advancedalerts')

assert.equal(src.includes("['view', 'read', 'list']"), false, 'the view/read/list mapping is gone')
assert.match(src, /\{\{ extensionPermissionLabel\(item\.code, entry\.ext\.id, item\.groups\) \}\}/, 'the template still uses the label')
console.log('roles-permission-label-0.13.5: PASS')
