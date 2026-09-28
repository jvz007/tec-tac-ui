import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createLatestRequestGate } from '../src/admin-session-state.js'

const gate = createLatestRequestGate()
const first = gate.begin()
const second = gate.begin()
assert.equal(gate.isCurrent(first), false, 'older drawer article request must become stale')
assert.equal(gate.isCurrent(second), true, 'newest drawer article request must remain current')
gate.begin()
assert.equal(gate.isCurrent(second), false, 'close/unmount invalidation must stale active drawer request')

const source = fs.readFileSync(new URL('../src/components/HelpDrawer.vue', import.meta.url), 'utf8')
assert.match(source, /createLatestRequestGate/)
assert.match(source, /const requestId = requestGate\.begin\(\)/)
assert.match(source, /if \(requestGate\.isCurrent\(requestId\)\) loadError\.value/)
assert.match(source, /if \(requestGate\.isCurrent\(requestId\)\) loadingArticle\.value = false/)
assert.match(source, /if \(!open\) \{[\s\S]*requestGate\.begin\(\)[\s\S]*loadingArticle\.value = false/)
assert.match(source, /onBeforeUnmount\(\(\) => requestGate\.begin\(\)\)/)

console.log('ui 0.12.52 help drawer request race: PASS')
