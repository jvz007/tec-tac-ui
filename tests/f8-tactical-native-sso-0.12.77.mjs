import assert from 'node:assert/strict'
import fs from 'node:fs'

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

globalThis.CustomEvent = class CustomEvent { constructor(type, init={}) { this.type=type; this.detail=init.detail } }

const submitted = []
function element(tag) {
  const node = {
    tag,
    children: [],
    style: {},
    appendChild(child) { this.children.push(child) },
  }
  if (tag === 'form') node.submit = () => submitted.push(node)
  return node
}

globalThis.document = {
  cookie: 'csrftoken=native-sso-csrf',
  createElement: element,
  body: { children: [], appendChild(node) { this.children.push(node) } },
}

globalThis.window = {
  _env_: { PROD_URL: 'https://api.rmm.example.test' },
  location: {
    origin: 'https://rmm.example.test',
    href: 'https://rmm.example.test/tec-tac/',
  },
  dispatchEvent() {},
}

const calls = []
globalThis.fetch = async (url, options={}) => {
  const parsed = new URL(url)
  calls.push({ url: parsed.toString(), path: parsed.pathname, options })
  if (parsed.pathname === '/_allauth/browser/v1/config/') {
    assert.equal(options.method, 'GET')
    assert.equal(options.credentials, 'include')
    return new Response(JSON.stringify({
      status: 200,
      data: {
        socialaccount: {
          providers: [
            { id: 'Microsoft-365', name: 'Microsoft 365', flows: ['provider_redirect'] },
          ],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (parsed.pathname === '/accounts/ssoproviders/token/') {
    assert.equal(options.method, 'POST')
    assert.equal(options.credentials, 'include')
    assert.equal(new Headers(options.headers).get('X-CSRFToken'), 'native-sso-csrf')
    return new Response(JSON.stringify({ token: 'native-knox', username: 'alice', provider: 'openid_connect' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (parsed.pathname === '/accounts/users/') {
    assert.equal(new Headers(options.headers).get('Authorization'), 'Token native-knox')
    return new Response(JSON.stringify([{ username: 'alice' }]), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (parsed.pathname === '/api/tfd/ui/context/') {
    assert.equal(new Headers(options.headers).get('Authorization'), 'Token native-knox')
    return new Response(JSON.stringify({ user: { username: 'alice' }, permissions: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  throw new Error(`unexpected request ${parsed.pathname}`)
}

function dataModule(path, replacements=[]) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const api = await import('../src/api.js')
const { createSsoProviderRegistry } = await dataModule('../src/sso-providers.js', [["import { reactive } from 'vue'", 'const reactive = (value) => value']])
const { beginLoginSso } = await import('../src/extension-surface-workflows.js')

// Production registry: Global Settings contributes only provider identity and
// display metadata. Supplying a module-owned begin callback is rejected.
const registry = createSsoProviderRegistry({
  beginProvider: (entry) => api.beginTacticalSso(entry.provider_id),
})
const moduleSso = registry.forModule('global-settings')
assert.throws(() => moduleSso.register({
  id: 'global-settings.microsoft',
  label: 'Microsoft 365',
  provider_id: 'Microsoft-365',
}, async () => 'module-owned'), /must not supply begin\(\)/)

moduleSso.register({
  id: 'global-settings.microsoft',
  label: 'Microsoft 365',
  provider_id: 'Microsoft-365',
  description: 'Organisation identity provider',
})
const entry = registry.list({})[0]
assert.equal(entry.provider_id, 'Microsoft-365')

// Starting SSO mirrors Tactical's LoginView: load allauth config, then submit
// a browser form to the headless provider redirect endpoint with provider,
// process=login, the frontend callback URL, and Django CSRF proof.
const start = await beginLoginSso(registry, entry, { return_to: window.location.href })
assert.equal(start.started, true)
assert.equal(calls[0].path, '/_allauth/browser/v1/config/')
assert.equal(submitted.length, 1)
const form = submitted[0]
assert.equal(form.method, 'POST')
assert.equal(form.action, 'https://api.rmm.example.test/_allauth/browser/v1/auth/provider/redirect/')
const fields = Object.fromEntries(form.children.map((input) => [input.name, input.value]))
assert.deepEqual(fields, {
  provider: 'Microsoft-365',
  process: 'login',
  callback_url: 'https://rmm.example.test/account/provider/callback',
  csrfmiddlewaretoken: 'native-sso-csrf',
})
assert.equal(localStorage.getItem('access_token'), null)

// After allauth returns the browser, Tec-Tac owns the token exchange. Tactical
// validates the temporary Django session, creates the Knox token and logs out
// that temporary session; Tec-Tac then verifies the Knox token and crosses the
// normal Core session-security boundary.
const completed = await api.completeTacticalSso()
assert.equal(completed.authenticated, true)
assert.equal(completed.username, 'alice')
assert.equal(localStorage.getItem('access_token'), 'native-knox')
assert.deepEqual(calls.slice(-3).map((call) => call.path), [
  '/accounts/ssoproviders/token/',
  '/accounts/users/',
  '/api/tfd/ui/context/',
])

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
assert.match(main, /createSsoProviderRegistry\(\{[\s\S]*beginProvider:[\s\S]*beginTacticalSso\(entry\.provider_id\)/)
const docs = fs.readFileSync(new URL('../docs/module-sso.md', import.meta.url), 'utf8')
assert.match(docs, /provider_id/)
assert.match(docs, /_allauth\/browser\/v1\/auth\/provider\/redirect/)
assert.match(docs, /must not supply a `begin\(\)` handler/)
const nginx = fs.readFileSync(new URL('../scripts/repair-nginx.sh', import.meta.url), 'utf8')
assert.match(nginx, /location = \/account\/provider\/callback/)
assert.match(nginx, /return 302 \/tec-tac\/#\/sso\/callback;/)

console.log('[TEST] PASS F8 Tactical-native allauth SSO handshake')
