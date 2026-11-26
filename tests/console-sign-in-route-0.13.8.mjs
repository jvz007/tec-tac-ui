// 0.13.8: the Console route survives the single sign-on round trip (one short-lived sessionStorage entry, nothing secret).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PENDING_KEY, PENDING_TTL_MS, clearPendingConsoleRoute, consoleRouteHash, parseConsoleHash, savePendingConsoleRoute, takePendingConsoleRoute } from '../src/console-handoff.js'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const S = 'A'.repeat(43)
const C = 'B'.repeat(43)
const SERIAL = 'ab'.repeat(16)
const signIn = `#/console/sign-in?port=40123&state=${S}&challenge=${C}&serial=${SERIAL}`
const enrol = `#/console/enrol?port=40123&state=${S}&challenge=${C}`
const fake = () => {
  const m = new Map()
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}

for (const hash of [signIn, enrol]) {
  const storage = fake()
  assert.equal(savePendingConsoleRoute(hash, { storage }), true)
  assert.equal(takePendingConsoleRoute({ storage }), hash)
  assert.equal(takePendingConsoleRoute({ storage }), '', 'a second take is empty')
  assert.equal(storage.m.size, 0)
}
// Only a valid Console route is ever saved.
for (const hash of ['#/dashboards', '#/console/sign-in?port=80&state=x', `#/console/sign-in?port=40123&state=${S}&challenge=${C}`, `#/console/enrol?port=40123&port=40124&state=${S}&challenge=${C}`, '', null, 'x']) {
  const storage = fake()
  assert.equal(savePendingConsoleRoute(hash, { storage }), false)
  assert.equal(storage.m.size, 0)
}
// Age.
{
  const storage = fake()
  let t = 1000
  savePendingConsoleRoute(signIn, { storage, now: () => t })
  t += PENDING_TTL_MS + 1
  assert.equal(takePendingConsoleRoute({ storage, now: () => t }), '')
  assert.equal(storage.m.size, 0, 'an old entry is deleted')
  savePendingConsoleRoute(signIn, { storage, now: () => 1000 })
  assert.equal(takePendingConsoleRoute({ storage, now: () => 1000 + PENDING_TTL_MS }), signIn)
}
// Tampered entries.
const tampered = [
  { kind: 'sign-in', values: { port: 80, state: S, challenge: C, serial: SERIAL }, savedAt: 1 },
  { kind: 'sign-in', values: { port: 40123, state: S, challenge: C, serial: SERIAL, extra: 'x' }, savedAt: 1 },
  { kind: 'sign-in', values: { port: 40123, state: S, challenge: C }, savedAt: 1 },
  { kind: 'enrol', values: { port: 40123, state: S, challenge: C, serial: SERIAL }, savedAt: 1 },
  { kind: 'other', values: { port: 40123, state: S, challenge: C }, savedAt: 1 },
  { kind: 'enrol', values: { port: '40123', state: 5, challenge: C }, savedAt: 1 },
  { kind: 'enrol', values: { port: 40123, state: S, challenge: C }, savedAt: 'now' },
  { kind: 'enrol', values: { port: 40123, state: S, challenge: C }, savedAt: 1, token: 'x' },
  { kind: 'enrol', values: [1], savedAt: 1 },
]
for (const entry of tampered) {
  const storage = fake()
  storage.setItem(PENDING_KEY, JSON.stringify(entry))
  assert.equal(takePendingConsoleRoute({ storage, now: () => 2 }), '', JSON.stringify(entry))
}
for (const raw of ['not json', '[]', 'null', '"x"']) {
  const storage = fake()
  storage.setItem(PENDING_KEY, raw)
  assert.equal(takePendingConsoleRoute({ storage }), '')
}
// Blocked storage never throws.
const boom = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') }, removeItem() { throw new Error('x') } }
assert.equal(savePendingConsoleRoute(signIn, { storage: boom }), false)
assert.equal(takePendingConsoleRoute({ storage: boom }), '')
assert.doesNotThrow(() => clearPendingConsoleRoute({ storage: boom }))
assert.equal(consoleRouteHash('sign-in', { port: 40123, state: S, challenge: C, serial: SERIAL }), signIn)
assert.deepEqual(parseConsoleHash(enrol), { kind: 'enrol', values: { port: 40123, state: S, challenge: C } })

// Source scans.
const sso = read('../src/views/SsoCallbackView.vue')
assert.match(sso, /const resume = takePendingConsoleRoute\(\)/)
assert.match(sso, /if \(resume\) window\.location\.replace\(`\/tec-tac\/\$\{resume\}`\)\s+else window\.location\.replace\('\/tec-tac\/#\/dashboards'\)/)
assert.doesNotMatch(sso, /location\.hash|route\.(hash|fullPath)/, 'never builds the target from an unvalidated hash')
assert.equal((sso.match(/clearPendingConsoleRoute\(\)/g) || []).length, 2, 'failure and provider error both delete the entry')
const login = read('../src/components/LoginPanel.vue')
assert.match(login, /savePendingConsoleRoute\(window\.location\.hash\)/)
assert.match(login, /function finishLogin\(\) \{[\s\S]*?clearPendingConsoleRoute\(\)[\s\S]*?window\.location\.reload\(\)\n\}/, 'password and code sign-in still reload and keep the hash')
assert.doesNotMatch(login, /location\.hash\s*=|location\.replace|location\.assign/, 'no step rewrites the hash')
assert.match(read('../src/App.vue'), /clearPendingConsoleRoute\(\)\n  try \{ await logoutTacticalSession\(\)/)
const main = read('../src/main.js')
assert.match(main, /initialHashTarget\?\.startsWith\('\/public\/'\) \|\| initialHashPath === '\/sso\/callback'/)
assert.match(main, /!initialHashTarget\.startsWith\('\/public\/'\) && initialHashPath !== '\/sso\/callback'/)
// Storage only in the helper file.
for (const file of ['../src/views/ConsoleSignInView.vue', '../src/views/ConsoleEnrolView.vue', '../src/components/LoginPanel.vue', '../src/views/SsoCallbackView.vue']) assert.doesNotMatch(read(file), /sessionStorage|localStorage/)
console.log('console-sign-in-route-0.13.8: PASS')
