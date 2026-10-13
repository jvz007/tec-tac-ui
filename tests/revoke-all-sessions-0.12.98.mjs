// 0.12.98 (Core 1.17.24, CO17, CQ76): End all sessions for an effective superuser. One Yes or No question (AD-27), no typed
// text, include_current always true. On success the browser session is cleared and the window reloads; on a refusal Core's
// message shows in the panel and the list stays.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const pkg = JSON.parse(read('../tec_tac_package.json'))
assert.equal(pkg.requires['tec-tac-framework'], '>=1.17.25,<2.0.0')

// access.js imports apiFetch from './api'; the stub routes every call to a test-controlled function.
const calls = []
globalThis.__apiFetch = async (path, options) => { calls.push({ path, options }); return { revoked: 3 } }
const accessSource = read('../src/access.js').replace("import { apiFetch } from './api'", 'const apiFetch = (...args) => globalThis.__apiFetch(...args)')
const access = await import(dataUrl(accessSource))

// (1) The call is POST to the revoke-all route with include_current true and a reason.
await access.revokeAllLoginSessions()
assert.equal(calls.at(-1).path, '/api/tfd/access/sessions/revoke-all/')
assert.equal(calls.at(-1).options.method, 'POST')
assert.deepEqual(JSON.parse(calls.at(-1).options.body), { reason: 'administrator-request', include_current: true })
await access.revokeAllLoginSessions('administrator-request')
assert.equal(JSON.parse(calls.at(-1).options.body).include_current, true)
assert.equal(calls.length, 2)

// (2) The one question: plain words, the caller included.
const state = await import(dataUrl(read('../src/admin-session-state.js')))
const prompt = state.revokeAllSessionsPrompt()
assert.match(prompt, /Everyone is signed out/)
assert.match(prompt, /you included/)
assert.match(prompt, /sign in again/)
assert.equal(state.revokeUserSessionsPrompt({ username: 'a' }).includes('Everyone is signed out'), false, 'the per-user prompt is unchanged')

// (3) Source checks on the panel: the button is for a superuser only, one confirmation before the request, no browser
// confirm, no typed input.
const panel = read('../src/components/access/AdminSessionsPanel.vue')
assert.match(panel, /const isSuperuser = computed\(\(\) => state\?\.context\?\.user\?\.superuser === true\)/)
assert.match(panel, /<button v-if="isSuperuser" class="btn danger" :disabled="!!busyId" @click="revokeEverything">End all sessions<\/button>/)
assert.doesNotMatch(panel, /window\.confirm|\bconfirm\(/)
assert.equal((panel.match(/<input/g) || []).length, 1, 'no typed input beyond the search box')
assert.equal((panel.match(/type="text"|<textarea/g) || []).length, 0)
const fnStart = panel.indexOf('async function revokeEverything() {')
const fnEnd = panel.indexOf('\n}\n', fnStart)
const revokeEverythingSource = panel.slice(fnStart, fnEnd + 3)
assert.ok(revokeEverythingSource.indexOf('confirmAction({ question: revokeAllSessionsPrompt(), danger: true })') < revokeEverythingSource.indexOf('revokeAllLoginSessions()'), 'the question comes before the request')

// (4) Behaviour: run the real revokeEverything body with stubs.
const body = revokeEverythingSource.replace(/^async function revokeEverything\(\) \{/, '').replace(/\}\n$/, '')
function makeRun({ confirmAnswer = true, failure = null } = {}) {
  const log = { cleared: 0, reloaded: 0, confirmed: [], requests: 0 }
  const busyId = { value: '' }
  const error = { value: '' }
  const window = { location: { reload: () => { log.reloaded += 1 } } }
  const run = new Function(
    'confirmAction', 'busyId', 'error', 'revokeAllLoginSessions', 'coreSessionFailureCode', 'clearTacticalSession', 'window', 'revokeAllSessionsPrompt',
    `return (async () => {${body}})()`,
  )
  const promise = run(
    async (options) => { log.confirmed.push(options); return confirmAnswer },
    busyId,
    error,
    async () => { log.requests += 1; if (failure) throw failure; return {} },
    (payload) => (payload && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : null),
    () => { log.cleared += 1 },
    window,
    state.revokeAllSessionsPrompt,
  )
  return { promise, log, busyId, error }
}

// Yes, success: the browser session is cleared and the window reloads, with no further call.
{
  const run = makeRun()
  await run.promise
  assert.equal(run.log.requests, 1)
  assert.equal(run.log.cleared, 1)
  assert.equal(run.log.reloaded, 1)
  assert.equal(run.log.confirmed[0].danger, true)
  assert.equal(run.log.confirmed[0].question, state.revokeAllSessionsPrompt())
  assert.equal(run.error.value, '')
}
// No: nothing is sent and nothing is cleared.
{
  const run = makeRun({ confirmAnswer: false })
  await run.promise
  assert.equal(run.log.requests, 0)
  assert.equal(run.log.cleared, 0)
  assert.equal(run.log.reloaded, 0)
}
// A 403 shows Core's message in the panel, keeps the session and does not reload.
{
  const run = makeRun({ failure: Object.assign(new Error('Only an effective superuser can end every session.'), { status: 403, payload: { detail: 'Only an effective superuser can end every session.' } }) })
  await run.promise
  assert.equal(run.error.value, 'Only an effective superuser can end every session.')
  assert.equal(run.log.cleared, 0, 'the session is kept')
  assert.equal(run.log.reloaded, 0)
  assert.equal(run.busyId.value, '')
}
// The normal session-invalid 401 from the call counts as done (api.js has already handled it).
{
  const run = makeRun({ failure: Object.assign(new Error('Your Tec-Tac session was revoked. Sign in again.'), { status: 401, payload: { code: 'session_revoked' } }) })
  await run.promise
  assert.equal(run.log.cleared, 1)
  assert.equal(run.log.reloaded, 1)
  assert.equal(run.error.value, '')
}
// A 401 without a session code is not swallowed.
{
  const run = makeRun({ failure: Object.assign(new Error('Unauthorized'), { status: 401, payload: { detail: 'Unauthorized' } }) })
  await run.promise
  assert.equal(run.log.reloaded, 0)
  assert.equal(run.error.value, 'Unauthorized')
}
// A network failure is shown, not treated as signed out.
{
  const run = makeRun({ failure: Object.assign(new Error('Network down'), { status: 0, payload: null }) })
  await run.promise
  assert.equal(run.log.cleared, 0)
  assert.equal(run.error.value, 'Network down')
}

// (5) The panel's helper uses the shared session clear and the browser reload, as doSignOut does.
assert.match(revokeEverythingSource, /clearTacticalSession\(\)/)
assert.match(revokeEverythingSource, /window\.location\.reload\(\)/)
assert.match(panel, /import \{ clearTacticalSession, coreSessionFailureCode \} from '\.\.\/\.\.\/api'/)
assert.match(read('../src/App.vue'), /try \{ await logoutTacticalSession\(\) \} finally \{ window\.location\.reload\(\) \}/, 'doSignOut reloads the same way')

// (6) Per-session and per-user revoke buttons are unchanged.
assert.match(panel, /@click="revoke\(row\)">Revoke<\/button>/)
assert.match(panel, /@click="revokeAll\(row\)">Revoke user<\/button>/)

console.log('revoke all sessions 0.12.98: PASS')
