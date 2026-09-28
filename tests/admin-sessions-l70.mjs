import assert from 'node:assert/strict'
import { createLatestRequestGate, revokeSessionPrompt, revokeUserSessionsPrompt } from '../src/admin-session-state.js'

const gate = createLatestRequestGate()
const first = gate.begin()
const second = gate.begin()
assert.equal(gate.isCurrent(first), false, 'an older request must become stale when a newer request starts')
assert.equal(gate.isCurrent(second), true, 'the newest request must remain current')
assert.equal(gate.current(), second)

const currentRow = { username: 'admin', current: true }
assert.match(revokeSessionPrompt(currentRow), /CURRENT login session/)
assert.match(revokeSessionPrompt(currentRow), /signed out immediately/)
assert.match(revokeUserSessionsPrompt(currentRow), /CURRENT session/)
assert.match(revokeUserSessionsPrompt(currentRow), /signed out immediately/)

const otherRow = { username: 'operator', current: false }
assert.doesNotMatch(revokeSessionPrompt(otherRow), /your CURRENT/)
assert.match(revokeUserSessionsPrompt(otherRow), /Every active session/)

console.log('admin-sessions-l70: PASS')
