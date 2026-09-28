import assert from 'node:assert/strict'
import { createKeyedLatestRequestGate } from '../src/latest-request-gate.js'

const gate = createKeyedLatestRequestGate(['framework', 'ui'])
const first = gate.begin('framework')
assert.equal(gate.isCurrent('framework', first), true)
const second = gate.begin('framework')
assert.equal(gate.isCurrent('framework', first), false)
assert.equal(gate.isCurrent('framework', second), true)
const ui = gate.begin('ui')
assert.equal(gate.isCurrent('ui', ui), true)
assert.equal(gate.isCurrent('framework', second), true, 'keys must be independent')
gate.invalidate('framework')
assert.equal(gate.isCurrent('framework', second), false)
console.log('latest request gate: PASS')
