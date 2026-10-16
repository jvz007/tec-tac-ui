// 0.12.112: System updates shows 'Update refused, nothing was changed' only when job.rollback.reason is 'installer-refused'
// (Core 1.17.43), as a text node, and leaves the other rollback wording alone.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const view = fs.readFileSync(new URL('../src/views/SystemUpdatesView.vue', import.meta.url), 'utf8')
const lines = view.split(/\r?\n/).filter((l) => l.includes('Update refused, nothing was changed'))
assert.equal(lines.length, 1, 'the sentence appears once')
assert.ok(lines[0].includes(`v-if="job.rollback?.reason === 'installer-refused'"`), 'it shows only for installer-refused')
assert.ok(!lines[0].includes('v-html'), 'a text node')
assert.ok(view.includes(`Rollback {{ job.rollback.status }}<span v-if="job.rollback.version"> · restored {{ job.rollback.version }}</span>`), 'the other rollback wording is unchanged')

// the condition, evaluated as the template would
const shows = (job) => job.rollback?.reason === 'installer-refused'
assert.equal(shows({ rollback: { reason: 'installer-refused' } }), true)
assert.equal(shows({ rollback: { reason: 'installer-failed', performed: true } }), false)
assert.equal(shows({ rollback: null }), false)
assert.equal(shows({}), false)
console.log('installer-refusal-view-0.12.112: PASS')
