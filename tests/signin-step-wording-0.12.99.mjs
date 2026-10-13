// 0.12.99: each sign-in step names only what it asked for. A wrong password on the set-up step never mentions a username or an
// authentication code. 429 and setup_session_required keep their text.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const { signInErrorMessage, enrollmentSetupErrorMessage, SETUP_SESSION_ENDED_MESSAGE } = await import(new URL('../src/mfa-enrollment.js', import.meta.url).href)

const steps = ['credentials', 'totp', 'backup', 'setup-proof', 'setup']
const texts = {}
for (const step of steps) {
  const set = new Set()
  for (const status of [400, 401, 403]) set.add(signInErrorMessage({ status }, step))
  assert.equal(set.size, 1, `${step}: 400, 401 and 403 read the same`)
  texts[step] = [...set][0]
  assert.match(signInErrorMessage({ status: 429 }, step), /Too many authentication attempts\. Wait a moment before trying again\./)
  assert.equal(signInErrorMessage({ status: 500, message: 'Core is down.' }, step), 'Core is down.')
  assert.equal(signInErrorMessage({ status: 400, code: 'setup_session_required' }, step), 'Your setup session ended. Sign in again.')
}
assert.equal(new Set(Object.values(texts)).size, 4, 'the code step and the set-up code step share a text; the others differ')
assert.match(texts.credentials, /username or password/)
assert.doesNotMatch(texts.credentials, /code/i)
assert.match(texts.totp, /authentication code/)
assert.doesNotMatch(texts.totp, /username|password/i)
assert.match(texts.backup, /backup code/)
assert.doesNotMatch(texts.backup, /username|password|authentication code/i)
assert.match(texts['setup-proof'], /password was not accepted/)
assert.match(texts['setup-proof'], /current password again/)
assert.doesNotMatch(texts['setup-proof'], /username|code/i)
assert.doesNotMatch(texts.setup, /username|password/i)
assert.equal(signInErrorMessage(null, 'totp'), 'Authentication failed.')
assert.equal(signInErrorMessage({ status: 400 }, 'unknown-step'), texts.credentials)

// The set-up call: a 400 reads as the set-up password text; setup_session_required is unchanged.
const proof = (err) => enrollmentSetupErrorMessage(err, (e) => signInErrorMessage(e, 'setup-proof'))
assert.equal(proof({ status: 400, message: 'Current password was not accepted.' }), texts['setup-proof'])
assert.equal(proof({ code: 'setup_session_required', status: 401 }), SETUP_SESSION_ENDED_MESSAGE)

// The panel passes its own step.
const login = read('../src/components/LoginPanel.vue')
assert.match(login, /return signInErrorMessage\(err, step\.value\)/)
assert.doesNotMatch(login, /username, password, or authentication code/)
assert.match(login, /Your setup session ended|SETUP_SESSION_REQUIRED_CODE/)

console.log('signin step wording 0.12.99: PASS')
