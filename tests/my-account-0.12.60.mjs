import assert from 'node:assert/strict'

globalThis.window = { _env_: { PROD_URL: 'https://api.example.test' }, location: { origin: 'https://ui.example.test' }, dispatchEvent(){} }
globalThis.localStorage = {
  getItem(key) { return key === 'access_token' ? 'token-123' : null },
  setItem(){}, removeItem(){},
}
const calls = []
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url, options })
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    async json() { return { ok: true, revoked: 2, preferences: { agent_dblclick_action: 'urlaction', url_action_id: 7 } } },
    async text() { return '' },
    clone() { return this },
  }
}

const account = await import('../src/account.js')
await account.getMyAccount()
await account.changeMyPassword('old', 'new')
await account.resetMyTotp('old', '123456')
await account.revokeMyOtherSessions()
await account.saveMyTacticalUiPreferences({ agent_dblclick_action: 'urlaction', url_action_id: 7 })

assert.deepEqual(calls.map(x => new URL(x.url).pathname), [
  '/api/tfd/account/',
  '/api/tfd/account/password/',
  '/api/tfd/account/totp/reset/',
  '/api/tfd/session/revoke-others/',
  '/api/tfd/account/tactical-ui/',
])
assert.equal(calls[1].options.method, 'PUT')
assert.deepEqual(JSON.parse(calls[1].options.body), { current_password: 'old', new_password: 'new' })
assert.equal(calls[2].options.method, 'POST')
assert.deepEqual(JSON.parse(calls[2].options.body), { current_password: 'old', current_totp: '123456' })
assert.equal(calls[3].options.method, 'POST')
assert.equal(calls[4].options.method, 'PUT')
assert.deepEqual(JSON.parse(calls[4].options.body), { agent_dblclick_action: 'urlaction', url_action_id: 7 })

const { coreNavigation } = await import('../src/core-navigation.js')
const mine = coreNavigation({ user: { superuser: false }, capabilities: {} }).find(x => x.to === '/account')
assert.ok(mine && mine.visible === true && mine.label === 'My Account')

console.log('my account UI 0.12.60: PASS')
