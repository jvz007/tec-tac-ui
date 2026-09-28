import assert from 'node:assert/strict'
import { createLatestRequestGate } from '../src/admin-session-state.js'
import { loadLatestRoleSelection } from '../src/role-selection-loader.js'

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const gate = createLatestRequestGate()
const roleA = deferred()
const roleB = deferred()
const extA = deferred()
const extB = deferred()
const getRole = id => id === 1 ? roleA.promise : roleB.promise
const getExtensionPermissions = id => id === 1 ? extA.promise : extB.promise

const a = loadLatestRoleSelection({ id: 1, getRole, getExtensionPermissions, requestGate: gate })
roleA.resolve({ id: 1, name: 'Role A' })
await Promise.resolve()
const b = loadLatestRoleSelection({ id: 2, getRole, getExtensionPermissions, requestGate: gate })
roleB.resolve({ id: 2, name: 'Role B' })
extB.resolve({ extensions: [{ id: 'x' }], permissions: { 'x.view': true } })
const fresh = await b
assert.equal(fresh.stale, false)
assert.equal(fresh.role.id, 2)
extA.resolve({ extensions: [{ id: 'old' }], permissions: { 'old.view': true } })
const stale = await a
assert.equal(stale.stale, true)

const failingA = deferred()
const failingB = deferred()
const errorGate = createLatestRequestGate()
const old = loadLatestRoleSelection({
  id: 1,
  getRole: id => id === 1 ? failingA.promise : failingB.promise,
  getExtensionPermissions: async () => ({}),
  requestGate: errorGate,
})
const newer = loadLatestRoleSelection({
  id: 2,
  getRole: id => id === 1 ? failingA.promise : failingB.promise,
  getExtensionPermissions: async () => ({}),
  requestGate: errorGate,
})
failingB.resolve({ id: 2 })
assert.equal((await newer).stale, false)
failingA.reject(new Error('old request failed'))
assert.equal((await old).stale, true)

const source = await (await import('node:fs/promises')).readFile(new URL('../src/components/access/RolesPanel.vue', import.meta.url), 'utf8')
assert.match(source, /loadLatestRoleSelection/)
assert.match(source, /roleRequestGate\.begin\(\).*removeEventListener/s)
console.log('ui-0.12.53: PASS')
