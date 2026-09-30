import assert from 'node:assert/strict'
import fs from 'node:fs'

function response(payload) {
  return { ok: true, status: 200, statusText: 'OK', headers: { get: () => 'application/json' }, async json(){return payload}, async text(){return JSON.stringify(payload)}, clone(){return this} }
}
globalThis.window = { _env_: { PROD_URL: 'https://api.example.test' }, location: { origin: 'https://ui.example.test' }, dispatchEvent() {} }
globalThis.localStorage = { getItem: key => key === 'access_token' ? 'token' : null, setItem(){}, removeItem(){} }
const calls=[]
globalThis.fetch = async (url, options={}) => {
  const path = new URL(url).pathname
  const body = options.body ? JSON.parse(options.body) : null
  calls.push({path, options, body})
  if (path === '/api/tfd/account/password/') return response({changed:true, other_sessions_revoked:2})
  if (path === '/api/tfd/account/totp/reset/') return response({reset:true, reauthentication_required:true})
  throw new Error(`unexpected ${path}`)
}

const account = await import('../src/account.js')
const workflows = await import('../src/my-account-workflows.js')
let result = await workflows.changePasswordWorkflow(
  {current:'old-pass', next:'Strong-Next-42!', confirm:'Strong-Next-42!'},
  {changeMyPassword: account.changeMyPassword},
)
assert.equal(result.message, 'Password changed. 2 other session(s) signed out.')
assert.deepEqual(calls.at(-1).body, {current_password:'old-pass', new_password:'Strong-Next-42!'})

let cleared=0, reloaded=0
result = await workflows.resetTotpWorkflow(
  {password:'Strong-Next-42!', code:' 123456 '},
  { resetMyTotp: account.resetMyTotp, confirmReset:()=>true, clearSession:()=>cleared++, reload:()=>reloaded++ },
)
assert.equal(result.reset, true)
assert.equal(cleared, 1)
assert.equal(reloaded, 1)
assert.deepEqual(calls.at(-1).body, {current_password:'Strong-Next-42!', current_totp:'123456'})

// Structural wiring is secondary evidence only; the behavior above is the
// executable regression. These checks prove the real screen invokes those
// exact production workflows from its F1/F2 buttons.
const view = fs.readFileSync(new URL('../src/views/MyAccountView.vue', import.meta.url), 'utf8')
assert.match(view, /changePasswordWorkflow\(password, \{ changeMyPassword \}\)/)
assert.match(view, /resetTotpWorkflow\(mfa, \{/)
assert.match(view, /@click="changePassword"/)
assert.match(view, /@click="resetMfa"/)
assert.match(view, /Reset and re-enrol 2FA/)

console.log('F1/F2 My Account done-when 0.12.66: PASS')
