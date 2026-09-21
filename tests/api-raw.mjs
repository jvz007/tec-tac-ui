import assert from 'node:assert/strict'

const storage = new Map([['access_token', 'abc123']])
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null },
  setItem(key, value) { storage.set(key, String(value)) },
  removeItem(key) { storage.delete(key) },
}
globalThis.window = {
  _env_: { PROD_URL: 'https://rmm.example.test' },
  dispatchEvent() {},
}

const calls = []
globalThis.fetch = async (url, options) => {
  calls.push({ url, options })
  return new Response('PDFDATA', { status: 200, headers: { 'content-type': 'application/pdf' } })
}

const { apiRaw, apiBlob, apiText } = await import('../src/api.js')

const response = await apiRaw('/api/tfd/report.pdf', { headers: { Accept: 'application/pdf' } })
assert.equal(response.status, 200)
assert.equal(calls[0].url, 'https://rmm.example.test/api/tfd/report.pdf')
assert.equal(calls[0].options.credentials, 'include')
assert.equal(calls[0].options.headers.get('Authorization'), 'Token abc123')
assert.equal(calls[0].options.headers.get('Accept'), 'application/pdf')
assert.equal(calls[0].options.headers.has('Content-Type'), false)

const form = new FormData()
form.append('file', new Blob(['x']), 'x.txt')
await apiRaw('/api/tfd/import/', { method: 'POST', body: form })
assert.equal(calls[1].options.headers.has('Content-Type'), false)

const blob = await apiBlob('/api/tfd/blob/')
assert.ok(blob instanceof Blob)
const text = await apiText('/api/tfd/text/')
assert.equal(text, 'PDFDATA')

let invalidated = false
window.dispatchEvent = () => { invalidated = true }
globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'expired' }), {
  status: 401,
  headers: { 'content-type': 'application/json' },
})
await assert.rejects(() => apiRaw('/api/tfd/private/'), (error) => error.status === 401 && error.message === 'expired')
assert.equal(invalidated, true)
assert.equal(localStorage.getItem('access_token'), null)
console.log('[TEST] apiRaw/auth/file transport OK')
