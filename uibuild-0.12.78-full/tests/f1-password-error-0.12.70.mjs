import assert from 'node:assert/strict'

function response(payload, { status = 400, statusText = 'Bad Request' } = {}) {
  const body = JSON.stringify(payload)
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => 'application/json' },
    async json(){ return payload },
    async text(){ return body },
    clone(){ return response(payload, { status, statusText }) },
  }
}

globalThis.window = {
  _env_: { PROD_URL: 'https://api.example.test' },
  location: { origin: 'https://ui.example.test' },
  dispatchEvent() {},
}
globalThis.localStorage = {
  getItem: key => key === 'access_token' ? 'token' : null,
  setItem(){},
  removeItem(){},
}

globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname
  assert.equal(path, '/api/tfd/account/password/')
  assert.equal(options.method, 'PUT')
  return response({ detail: 'This password is too common.' })
}

const account = await import('../src/account.js')
const workflows = await import('../src/my-account-workflows.js')

let error = null
try {
  await workflows.changePasswordWorkflow(
    { current: 'old-pass', next: 'password', confirm: 'password' },
    { changeMyPassword: account.changeMyPassword },
  )
} catch (err) {
  error = err
}

assert.ok(error, '400 password validation response must reject the workflow')
assert.equal(error.status, 400)
assert.equal(error.message, 'This password is too common.')
assert.deepEqual(error.payload, { detail: 'This password is too common.' })

console.log('F1 password 400 detail 0.12.70: PASS')
