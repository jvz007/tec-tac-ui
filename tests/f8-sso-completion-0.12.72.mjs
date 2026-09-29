import assert from 'node:assert/strict'
import fs from 'node:fs'

const store = new Map()
globalThis.localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
}
globalThis.document = { cookie: 'csrftoken=csrf-123; theme=dark' }
globalThis.CustomEvent = class CustomEvent { constructor(type, init={}) { this.type=type; this.detail=init.detail } }
globalThis.window = {
  _env_: { PROD_URL: 'https://rmm.example.test' },
  location: { origin: 'https://rmm.example.test' },
  dispatchEvent() {},
}

const calls = []
globalThis.fetch = async (url, options={}) => {
  calls.push({ url:String(url), options })
  if (String(url).endsWith('/accounts/ssoproviders/token/')) {
    assert.equal(options.method, 'POST')
    assert.equal(options.credentials, 'include')
    const headers = new Headers(options.headers)
    assert.equal(headers.get('X-CSRFToken'), 'csrf-123')
    assert.equal(headers.get('Authorization'), null)
    return new Response(JSON.stringify({ token:'sso-knox-token', username:'alice', name:'Alice', provider:'entra' }), { status:200, headers:{'content-type':'application/json'} })
  }
  if (String(url).endsWith('/accounts/users/')) {
    const headers = new Headers(options.headers)
    assert.equal(headers.get('Authorization'), 'Token sso-knox-token')
    return new Response('[]', { status:200, headers:{'content-type':'application/json'} })
  }
  if (String(url).endsWith('/api/tfd/ui/context/')) {
    const headers = new Headers(options.headers)
    assert.equal(headers.get('Authorization'), 'Token sso-knox-token')
    return new Response(JSON.stringify({ user:{username:'alice'}, permissions:[] }), { status:200, headers:{'content-type':'application/json'} })
  }
  throw new Error(`unexpected fetch ${url}`)
}

const api = await import('../src/api.js')
const result = await api.completeTacticalSso()
assert.equal(result.authenticated, true)
assert.equal(result.username, 'alice')
assert.equal(result.provider, 'entra')
assert.equal(localStorage.getItem('access_token'), 'sso-knox-token')
assert.deepEqual(calls.map(x => new URL(x.url).pathname), [
  '/accounts/ssoproviders/token/',
  '/accounts/users/',
  '/api/tfd/ui/context/',
])

const callback = fs.readFileSync(new URL('../src/views/SsoCallbackView.vue', import.meta.url), 'utf8')
assert.match(callback, /completeTacticalSso\(\)/)
assert.match(callback, /window\.location\.replace\('\/tec-tac\/#\/dashboards'\)/)
const router = fs.readFileSync(new URL('../src/router.js', import.meta.url), 'utf8')
assert.match(router, /path: '\/sso\/callback'.*public: true/)
const nginx = fs.readFileSync(new URL('../scripts/repair-nginx.sh', import.meta.url), 'utf8')
assert.match(nginx, /location = \/account\/provider\/callback/)
assert.match(nginx, /return 302 \/tec-tac\/#\/sso\/callback;/)
const docs = fs.readFileSync(new URL('../docs/module-sso.md', import.meta.url), 'utf8')
assert.match(docs, /must not own `\/account\/provider\/callback`/i)
assert.match(docs, /receive a Tactical access token/i)
console.log('F8 Core-owned SSO completion 0.12.72: PASS')
