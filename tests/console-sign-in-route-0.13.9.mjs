// 0.13.9: an abandoned single sign-on no longer leaves a stale Console route behind (held Low of the 0.13.8 review).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PENDING_KEY, savePendingConsoleRoute, takePendingConsoleRoute } from '../src/console-handoff.js'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const S = 'A'.repeat(43)
const C = 'B'.repeat(43)
const signIn = `#/console/sign-in?port=40123&state=${S}&challenge=${C}&serial=${'ab'.repeat(16)}`
const enrol = `#/console/enrol?port=40124&state=${S}&challenge=${C}`
const fake = () => {
  const m = new Map()
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}

for (const bad of ['#/dashboards', `#/console/sign-in?port=80&state=x`, '', null]) {
  const storage = fake()
  assert.equal(savePendingConsoleRoute(signIn, { storage }), true)
  assert.equal(storage.m.size, 1)
  assert.equal(savePendingConsoleRoute(bad, { storage }), false)
  assert.equal(storage.m.size, 0, `an earlier entry is removed for ${JSON.stringify(bad)}`)
  assert.equal(takePendingConsoleRoute({ storage }), '')
}
{
  const storage = fake()
  assert.equal(savePendingConsoleRoute(signIn, { storage }), true)
  assert.equal(savePendingConsoleRoute(enrol, { storage }), true)
  assert.equal(takePendingConsoleRoute({ storage }), enrol, 'a valid hash overwrites')
}
const boom = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }
for (const hash of [signIn, '#/dashboards', '', null]) assert.doesNotThrow(() => savePendingConsoleRoute(hash, { storage: boom }))
assert.ok(PENDING_KEY)

const login = read('../src/components/LoginPanel.vue')
assert.match(login, /async function beginSso[\s\S]*?clearPendingConsoleRoute\(\)\s+savePendingConsoleRoute\(window\.location\.hash\)/)
assert.match(login, /savePendingConsoleRoute\(window\.location\.hash\)/, 'the Console hash still survives the single sign-on round trip')
console.log('console-sign-in-route-0.13.9: PASS')
