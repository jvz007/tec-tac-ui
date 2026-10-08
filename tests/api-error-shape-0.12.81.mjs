import assert from 'node:assert/strict'

const storage = new Map([['access_token', 'abc123']])
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null },
  setItem(key, value) { storage.set(key, String(value)) },
  removeItem(key) { storage.delete(key) },
}
let invalidated = 0
globalThis.window = {
  _env_: { PROD_URL: 'https://rmm.example.test' },
  dispatchEvent() { invalidated += 1 },
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const { apiFetch, apiRaw, apiBlob, apiText, publicApiFetch, checkTacticalCredentials } = await import('../src/api.js')

// Network failure: status 0, payload null, original TypeError kept.
globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
await assert.rejects(() => apiFetch('/x/'), (error) => {
  assert.equal(error.name, 'TypeError')
  assert.equal(error.message, 'Failed to fetch')
  assert.equal(error.status, 0)
  assert.equal(error.payload, null)
  assert.equal(error.code, null)
  return true
})
await assert.rejects(() => apiBlob('/x/'), (error) => error.status === 0 && error.payload === null)

// AbortError name is kept.
globalThis.fetch = async () => { throw new DOMException('aborted', 'AbortError') }
await assert.rejects(() => apiText('/x/'), (error) => error.name === 'AbortError' && error.status === 0 && error.message === 'aborted')

// Missing PROD_URL gives status 0.
window._env_ = {}
await assert.rejects(() => apiFetch('/x/'), (error) => error.status === 0 && error.payload === null && /PROD_URL/.test(error.message))
await assert.rejects(() => publicApiFetch('/x/'), (error) => error.status === 0 && error.payload === null)
window._env_ = { PROD_URL: 'https://rmm.example.test' }

// JSON 500 gives the parsed object and the string code.
globalThis.fetch = async () => json({ detail: 'boom', code: 'server_broke' }, 500)
await assert.rejects(() => apiFetch('/x/'), (error) => {
  assert.equal(error.status, 500)
  assert.deepEqual(error.payload, { detail: 'boom', code: 'server_broke' })
  assert.equal(error.code, 'server_broke')
  assert.equal(error.message, 'boom')
  return true
})

// A non-string code is not copied.
globalThis.fetch = async () => json({ detail: 'x', code: 7 }, 400)
await assert.rejects(() => apiFetch('/x/'), (error) => error.code === null && error.payload.code === 7)

// Text 502 gives a string payload.
globalThis.fetch = async () => new Response('Bad gateway', { status: 502, headers: { 'content-type': 'text/plain' } })
await assert.rejects(() => apiFetch('/x/'), (error) => error.status === 502 && error.payload === 'Bad gateway' && error.message === 'Bad gateway')

// Empty body and 204-like failures give a null payload.
globalThis.fetch = async () => new Response('', { status: 500 })
await assert.rejects(() => apiFetch('/x/'), (error) => error.status === 500 && error.payload === null && error.message.startsWith('API request failed: 500'))
globalThis.fetch = async () => new Response('not json', { status: 500, headers: { 'content-type': 'application/json' } })
await assert.rejects(() => apiFetch('/x/'), (error) => error.status === 500 && error.payload === null)

// 2xx with an error key throws with the 2xx status and the payload.
globalThis.fetch = async () => json({ error: 'x' })
await assert.rejects(() => apiFetch('/x/'), (error) => error.status === 200 && error.payload.error === 'x' && error.message === 'x')
// ...unless rejectErrorPayload is false.
assert.deepEqual(await apiFetch('/x/', { rejectErrorPayload: false }), { error: 'x' })
// apiRaw, apiBlob and apiText never inspect the body.
assert.equal((await apiRaw('/x/')).status, 200)
assert.ok((await apiBlob('/x/')) instanceof Blob)
assert.equal(await apiText('/x/'), '{"error":"x"}')

// apiBlob and apiText 404 carry status and payload.
globalThis.fetch = async () => json({ detail: 'missing' }, 404)
await assert.rejects(() => apiBlob('/x/'), (error) => error.status === 404 && error.payload.detail === 'missing')
await assert.rejects(() => apiText('/x/'), (error) => error.status === 404 && error.payload.detail === 'missing')

// 401 still fires the session-invalid event and carries the shape.
invalidated = 0
globalThis.fetch = async () => json({ detail: 'expired', code: 'session_idle_timeout' }, 401)
await assert.rejects(() => apiFetch('/x/'), (error) => error.status === 401 && error.code === 'session_idle_timeout' && error.payload.detail === 'expired')
assert.equal(invalidated, 1)

// No token: status 401, null payload, event fired.
invalidated = 0
await assert.rejects(() => apiFetch('/x/'), (error) => error.status === 401 && error.payload === null && error.code === null)
assert.equal(invalidated, 1)

// publicApiFetch.
globalThis.fetch = async () => { throw new TypeError('offline') }
await assert.rejects(() => publicApiFetch('/p/'), (error) => error.name === 'TypeError' && error.status === 0 && error.payload === null)
globalThis.fetch = async () => json({ detail: 'nope' }, 403)
await assert.rejects(() => publicApiFetch('/p/'), (error) => error.status === 403 && error.payload.detail === 'nope' && error.message === 'nope')

// Sign-in transport (tacticalAuthRequest) carries the same shape.
globalThis.fetch = async () => { throw new TypeError('offline') }
await assert.rejects(() => checkTacticalCredentials('a', 'b'), (error) => error.status === 0 && error.payload === null && error.name === 'TypeError')
globalThis.fetch = async () => json({ detail: 'bad creds' }, 400)
await assert.rejects(() => checkTacticalCredentials('a', 'b'), (error) => error.status === 400 && error.payload.detail === 'bad creds')

// No .body alias.
await assert.rejects(() => checkTacticalCredentials('a', 'b'), (error) => !('body' in error))

console.log('[TEST] api() error shape OK')
