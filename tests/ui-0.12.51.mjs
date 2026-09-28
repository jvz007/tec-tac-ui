import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createKeyedLatestRequestGate } from '../src/latest-request-gate.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const view = fs.readFileSync(path.join(root, 'src/views/DashboardView.vue'), 'utf8')

// Behavioural proof of the request-generation rule used by DashboardView.
const gate = createKeyedLatestRequestGate(['dashboards'])
const first = gate.begin('dashboards')
const second = gate.begin('dashboards')
assert.equal(gate.isCurrent('dashboards', first), false, 'older dashboard request must become stale')
assert.equal(gate.isCurrent('dashboards', second), true, 'newest dashboard request must remain current')
gate.invalidate('dashboards')
assert.equal(gate.isCurrent('dashboards', second), false, 'unmount invalidation must stale the active request')

// Wiring proof: the real view must gate success, error and loading completion.
assert.match(view, /createKeyedLatestRequestGate\(\['dashboards'\]\)/)
assert.match(view, /if \(!dashboardLoadGate\.isCurrent\('dashboards', requestId\)\) return/)
assert.match(view, /if \(dashboardLoadGate\.isCurrent\('dashboards', requestId\)\) \{\s*error\.value/s)
assert.match(view, /if \(dashboardLoadGate\.isCurrent\('dashboards', requestId\)\) loading\.value = false/)
assert.match(view, /onBeforeUnmount\(\(\) => dashboardLoadGate\.invalidate\('dashboards'\)\)/)

console.log('ui 0.12.51: PASS')
