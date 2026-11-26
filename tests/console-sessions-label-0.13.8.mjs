// 0.13.8: Access > Login sessions names the Engineer Console behind a session (Core 1.18.56).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { consoleSessionLabel } from '../src/console-certificates.js'

const panel = fs.readFileSync(new URL('../src/components/access/AdminSessionsPanel.vue', import.meta.url), 'utf8')
assert.deepEqual(consoleSessionLabel({ console: { pc_label: 'Work PC', short_serial: 'abcdefgh' } }), { label: 'Engineer Console (Work PC)', serial: 'abcdefgh' })
for (const row of [{}, { console: null }, { console: 'x' }, { console: [] }, null, undefined, 'x']) assert.equal(consoleSessionLabel(row), null)
assert.deepEqual(consoleSessionLabel({ console: { pc_label: '', short_serial: 'abcdefgh' } }), { label: 'Engineer Console', serial: 'abcdefgh' })
assert.equal(consoleSessionLabel({ console: { pc_label: '<img onerror=x>' } }).label, 'Engineer Console (<img onerror=x>)')
assert.doesNotMatch(panel, /v-html/)
assert.match(panel, /\{\{ consoleSessionLabel\(row\)\.label \}\}/)
assert.equal((panel.match(/colspan="7"/g) || []).length, 1)
assert.equal((panel.match(/<th>/g) || []).length, 7, 'column count unchanged')
assert.match(panel, /revokeSessionPrompt/)
assert.match(panel, /revokeUserSessionsPrompt/)
console.log('console-sessions-label-0.13.8: PASS')
