import assert from 'node:assert/strict'
import fs from 'node:fs'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.document = { cookie: 'csrftoken=f8-csrf' }
globalThis.CustomEvent = class CustomEvent { constructor(type, init={}) { this.type=type; this.detail=init.detail } }

const redirects = []
globalThis.window = {
  _env_: { PROD_URL: 'https://rmm.example.test' },
  location: {
    origin: 'https://rmm.example.test',
    href: 'https://rmm.example.test/tec-tac/',
    assign: (url) => redirects.push(String(url)),
  },
  dispatchEvent() {},
}

const calls = []
globalThis.fetch = async (url, options={}) => {
  const parsed = new URL(url)
  calls.push({ path: parsed.pathname, options })
  if (parsed.pathname === '/api/global-settings/public/sso/provider/microsoft/') {
    return new Response(JSON.stringify({ begin_url: 'https://rmm.example.test/accounts/microsoft/login/' }), {status:200,headers:{'content-type':'application/json'}})
  }
  if (parsed.pathname === '/accounts/ssoproviders/token/') {
    assert.equal(options.method, 'POST')
    assert.equal(options.credentials, 'include')
    assert.equal(new Headers(options.headers).get('X-CSRFToken'), 'f8-csrf')
    return new Response(JSON.stringify({ token:'oidc-knox', username:'alice', provider:'microsoft' }), {status:200,headers:{'content-type':'application/json'}})
  }
  if (parsed.pathname === '/accounts/users/') {
    assert.equal(new Headers(options.headers).get('Authorization'), 'Token oidc-knox')
    return new Response(JSON.stringify([{username:'alice'}]), {status:200,headers:{'content-type':'application/json'}})
  }
  if (parsed.pathname === '/api/tfd/ui/context/') {
    assert.equal(new Headers(options.headers).get('Authorization'), 'Token oidc-knox')
    return new Response(JSON.stringify({user:{username:'alice'},permissions:[]}), {status:200,headers:{'content-type':'application/json'}})
  }
  throw new Error(`unexpected request ${parsed.pathname}`)
}

function dataModule(path, replacements=[]) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const { createSsoProviderRegistry } = await dataModule('../src/sso-providers.js', [["import { reactive } from 'vue'", 'const reactive = (value) => value']])
const { beginLoginSso } = await import('../src/extension-surface-workflows.js')
const api = await import('../src/api.js')

// Hook 1: a Global Settings public module contributes the login button and may
// only initiate the external provider redirect. The initiation context carries
// navigation only: no Tactical/Core credential is delivered to the module.
const registry = createSsoProviderRegistry()
let initiationContext = null
registry.forModule('global-settings').register({
  id: 'global-settings.microsoft',
  label: 'Microsoft 365',
}, async (ctx) => {
  initiationContext = {...ctx}
  const provider = await fetch('https://rmm.example.test/api/global-settings/public/sso/provider/microsoft/').then(r => r.json())
  window.location.assign(provider.begin_url)
})
const entry = registry.list({})[0]
assert.equal(entry.id, 'global-settings.microsoft')
await beginLoginSso(registry, entry, { return_to: window.location.href, location: window.location })
assert.deepEqual(redirects, ['https://rmm.example.test/accounts/microsoft/login/'])
assert.equal(initiationContext.return_to, 'https://rmm.example.test/tec-tac/')
for (const secretName of ['token', 'access_token', 'csrf', 'csrftoken', 'authorization']) {
  assert.equal(secretName in initiationContext, false, `${secretName} leaked to public module context`)
}
assert.equal(localStorage.getItem('access_token'), null)

// Hooks 2+3: after Tactical/allauth returns to the Core-owned callback, Core UI
// exchanges the pending session with credentials+CSRF, verifies the Knox token,
// then crosses /api/tfd/ui/context/. The Core-side F8 acceptance test proves
// that this boundary applies the MFA policy and creates session_created audit.
const result = await api.completeTacticalSso()
assert.equal(result.authenticated, true)
assert.equal(result.username, 'alice')
assert.equal(localStorage.getItem('access_token'), 'oidc-knox')
assert.deepEqual(calls.slice(-3).map(x => x.path), [
  '/accounts/ssoproviders/token/',
  '/accounts/users/',
  '/api/tfd/ui/context/',
])

const callback = fs.readFileSync(new URL('../src/views/SsoCallbackView.vue', import.meta.url), 'utf8')
assert.match(callback, /completeTacticalSso\(\)/)
const nginx = fs.readFileSync(new URL('../scripts/repair-nginx.sh', import.meta.url), 'utf8')
assert.match(nginx, /location = \/account\/provider\/callback/)
assert.match(nginx, /return 302 \/tec-tac\/#\/sso\/callback;/)
const docs = fs.readFileSync(new URL('../docs/module-sso.md', import.meta.url), 'utf8')
assert.match(docs, /session_created/)
assert.match(docs, /external identity provider owns their MFA lifecycle/)

console.log('[TEST] PASS F8 fake OIDC button-to-Core-session flow')
