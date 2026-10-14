// 0.12.99 (Core 1.17.25, CQ76): End all sessions ends the caller's own session too. The browser never sends
// include_current false, the one Yes or No question names the administrator, a 401 session-invalid counts as done and
// a 403 or 400 keeps the list and shows Core's text.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const pkg = JSON.parse(read('../tec_tac_package.json'))
assert.equal(pkg.requires['tec-tac-framework'], '>=1.17.34,<2.0.0')

// No file under src/ ever sends include_current false.
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(js|vue)$/.test(entry.name)) out.push(full)
  }
  return out
}
const srcDir = decodeURIComponent(new URL('../src', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')
let scanned = 0
for (const file of walk(srcDir)) {
  const text = fs.readFileSync(file, 'utf8')
  scanned += 1
  assert.doesNotMatch(text, /include_current\s*:\s*false/, `${file} sends include_current false`)
  assert.doesNotMatch(text, /include_current['"]?\s*[:=]\s*(false|0)\b/, `${file} sends include_current false`)
  assert.doesNotMatch(text, /["']include_current["']\s*:\s*false/, `${file} sends include_current false`)
}
assert.ok(scanned > 50, 'the scan covers src/')
assert.match(read('../src/access.js'), /include_current: true/)

// The call.
const calls = []
globalThis.__apiFetch = async (p, options) => { calls.push({ path: p, options }); return { revoked: 3 } }
const access = await import(dataUrl(read('../src/access.js').replace("import { apiFetch } from './api'", 'const apiFetch = (...args) => globalThis.__apiFetch(...args)')))
await access.revokeAllLoginSessions()
assert.equal(calls.at(-1).path, '/api/tfd/access/sessions/revoke-all/')
assert.equal(calls.at(-1).options.method, 'POST')
assert.deepEqual(JSON.parse(calls.at(-1).options.body), { reason: 'administrator-request', include_current: true })
await access.revokeAllLoginSessions('other')
assert.deepEqual(JSON.parse(calls.at(-1).options.body), { reason: 'other', include_current: true })
assert.notEqual(JSON.parse(calls.at(-1).options.body).include_current, false)

// The prompt names the caller.
const state = await import(dataUrl(read('../src/admin-session-state.js')))
const prompt = state.revokeAllSessionsPrompt()
assert.match(prompt, /every user/)
assert.match(prompt, /you included/)
assert.match(prompt, /sign in again/)

// The panel: one Yes or No question, then the request; refusals keep the list.
const panel = read('../src/components/access/AdminSessionsPanel.vue')
const fnStart = panel.indexOf('async function revokeEverything() {')
const source = panel.slice(fnStart, panel.indexOf('\n}\n', fnStart) + 3)
assert.ok(source.indexOf('confirmAction({ question: revokeAllSessionsPrompt(), danger: true })') < source.indexOf('revokeAllLoginSessions()'))
const body = source.replace(/^async function revokeEverything\(\) \{/, '').replace(/\}\n$/, '')
function makeRun({ failure = null } = {}) {
  const log = { cleared: 0, reloaded: 0, requests: 0, loads: 0 }
  const busyId = { value: '' }
  const error = { value: '' }
  const run = new Function('confirmAction', 'busyId', 'error', 'revokeAllLoginSessions', 'coreSessionFailureCode', 'clearTacticalSession', 'window', 'revokeAllSessionsPrompt', `return (async () => {${body}})()`)
  const promise = run(
    async () => true, busyId, error,
    async () => { log.requests += 1; if (failure) throw failure; return {} },
    (payload) => (payload && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : null),
    () => { log.cleared += 1 },
    { location: { reload: () => { log.reloaded += 1 } } },
    state.revokeAllSessionsPrompt,
  )
  return { promise, log, error }
}
{ const r = makeRun(); await r.promise; assert.equal(r.log.cleared, 1); assert.equal(r.log.reloaded, 1) }
for (const [status, text] of [[403, 'Only an effective superuser can end every session.'], [400, 'The request body was not accepted.']]) {
  const r = makeRun({ failure: Object.assign(new Error(text), { status, payload: { detail: text } }) })
  await r.promise
  assert.equal(r.error.value, text)
  assert.equal(r.log.cleared, 0, 'the session and the list stay')
  assert.equal(r.log.reloaded, 0)
}
{
  const r = makeRun({ failure: Object.assign(new Error('Your Tec-Tac session was revoked. Sign in again.'), { status: 401, payload: { code: 'session_revoked' } }) })
  await r.promise
  assert.equal(r.log.cleared, 1)
  assert.equal(r.log.reloaded, 1)
  assert.equal(r.error.value, '')
}

console.log('revoke all sessions 0.12.99: PASS')
