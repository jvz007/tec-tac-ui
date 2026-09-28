import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createLatestRequestGate } from '../src/admin-session-state.js'

// The request gate is the behavioral primitive used by HelpView.
const gate = createLatestRequestGate()
const first = gate.begin()
const second = gate.begin()
assert.equal(gate.isCurrent(first), false)
assert.equal(gate.isCurrent(second), true)
const invalidated = gate.begin()
assert.equal(gate.isCurrent(second), false)
assert.equal(gate.isCurrent(invalidated), true)

const source = fs.readFileSync(new URL('../src/views/HelpView.vue', import.meta.url), 'utf8')
assert.match(source, /createLatestRequestGate/)
assert.match(source, /const requestId = requestGate\.begin\(\)/)
assert.match(source, /if \(requestGate\.isCurrent\(requestId\)\) error\.value/)
assert.match(source, /if \(requestGate\.isCurrent\(requestId\)\) loading\.value = false/)
assert.match(source, /onBeforeUnmount\(\(\) => requestGate\.begin\(\)\)/)
assert.match(source, /if \(!id\) \{[\s\S]*requestGate\.begin\(\)[\s\S]*error\.value = ''/)

console.log('ui 0.12.50 help request race: PASS')
