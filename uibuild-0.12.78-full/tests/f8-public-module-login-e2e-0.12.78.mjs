import assert from 'node:assert/strict'
import { createRenderer, defineComponent, h, nextTick } from 'vue'
import { loadPublicUiModules } from '../src/module-loader.js'
import { createSsoProviderRegistry } from '../src/sso-providers.js'
import LoginSsoProviders from '../src/components/LoginSsoProviders.js'
import { beginLoginSso } from '../src/extension-surface-workflows.js'
import { beginTacticalSso, completeTacticalSso } from '../src/api.js'

const store = new Map()
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
}
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail } }

const submitted = []
function domElement(tag) {
  const node = { tag, children: [], style: {}, appendChild(child) { this.children.push(child) } }
  if (tag === 'form') node.submit = () => submitted.push(node)
  return node
}
globalThis.document = {
  cookie: 'csrftoken=e2e-csrf',
  createElement: domElement,
  body: { children: [], appendChild(node) { this.children.push(node) } },
}
globalThis.window = {
  _env_: { PROD_URL: 'https://api.rmm.example.test' },
  location: { origin: 'https://rmm.example.test', href: 'https://rmm.example.test/tec-tac/' },
  dispatchEvent() {},
}

const calls = []
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url)
  calls.push({ path: parsed.pathname, options })
  if (parsed.pathname === '/_allauth/browser/v1/config/') {
    return new Response(JSON.stringify({ status: 200, data: { socialaccount: { providers: [{ id: 'Microsoft-365', name: 'Microsoft 365', flows: ['provider_redirect'] }] } } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (parsed.pathname === '/accounts/ssoproviders/token/') {
    assert.equal(options.credentials, 'include')
    assert.equal(new Headers(options.headers).get('X-CSRFToken'), 'e2e-csrf')
    return new Response(JSON.stringify({ token: 'e2e-knox', username: 'alice', provider: 'openid_connect' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (parsed.pathname === '/accounts/users/') {
    assert.equal(new Headers(options.headers).get('Authorization'), 'Token e2e-knox')
    return new Response(JSON.stringify([{ username: 'alice' }]), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (parsed.pathname === '/api/tfd/ui/context/') {
    assert.equal(new Headers(options.headers).get('Authorization'), 'Token e2e-knox')
    return new Response(JSON.stringify({ user: { username: 'alice' }, permissions: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  throw new Error(`unexpected request ${parsed.pathname}`)
}

const registry = createSsoProviderRegistry({ beginProvider: (entry) => beginTacticalSso(entry.provider_id) })
const fixtureEntry = new URL('./fixtures/f8-public-sso-module.mjs', import.meta.url).href
const router = {
  currentRoute: { value: { path: '/', fullPath: '/' } },
  addRoute() {},
  async replace() {},
}
const loadResult = await loadPublicUiModules({ app: {}, router, publicApi: async () => ({}), ssoProviders: registry }, [{
  id: 'global-settings',
  public: { entry: fixtureEntry, base_path: '/public/global-settings' },
}])
assert.deepEqual(loadResult, { loaded: ['global-settings'], failed: [] })
const entries = registry.list({})
assert.equal(entries.length, 1)
assert.equal(entries[0].provider_id, 'Microsoft-365')

function hostNode(type, text = '') { return { type, text, props: {}, children: [], parent: null } }
function hostInsert(el, parent, anchor = null) {
  el.parent = parent
  if (!anchor) parent.children.push(el)
  else parent.children.splice(parent.children.indexOf(anchor), 0, el)
}
const renderer = createRenderer({
  patchProp(el, key, _prev, next) { el.props[key] = next },
  insert: hostInsert,
  remove(el) { if (el.parent) el.parent.children = el.parent.children.filter((item) => item !== el) },
  createElement(type) { return hostNode(type) },
  createText(text) { return hostNode('#text', text) },
  createComment(text) { return hostNode('#comment', text) },
  setText(node, text) { node.text = text },
  setElementText(node, text) { node.children = [hostNode('#text', text)] },
  parentNode(node) { return node.parent },
  nextSibling(node) { if (!node.parent) return null; const i = node.parent.children.indexOf(node); return node.parent.children[i + 1] || null },
  querySelector() { return null },
  setScopeId() {},
  cloneNode(node) { return structuredClone(node) },
  insertStaticContent(content, parent, anchor) { const node = hostNode('#static', content); hostInsert(node, parent, anchor); return [node, node] },
})

let startPromise = null
const Harness = defineComponent({
  setup() {
    return () => h(LoginSsoProviders, {
      entries,
      busy: false,
      ssoBusyId: '',
      onBegin: (entry) => { startPromise = beginLoginSso(registry, entry, { return_to: window.location.href, location: window.location }) },
    })
  },
})
const root = hostNode('root')
renderer.createApp(Harness).mount(root)
await nextTick()
function find(node, predicate) {
  if (predicate(node)) return node
  for (const child of node.children || []) { const match = find(child, predicate); if (match) return match }
  return null
}
const button = find(root, (node) => node.type === 'button' && String(node.props.class || '').includes('sso-provider-button'))
assert.ok(button, 'production SSO login button rendered')
assert.equal(typeof button.props.onClick, 'function')
await button.props.onClick({ type: 'click' })
await startPromise
assert.equal(submitted.length, 1)
const fields = Object.fromEntries(submitted[0].children.map((input) => [input.name, input.value]))
assert.deepEqual(fields, {
  provider: 'Microsoft-365',
  process: 'login',
  callback_url: 'https://rmm.example.test/account/provider/callback',
  csrfmiddlewaretoken: 'e2e-csrf',
})
assert.equal(localStorage.getItem('access_token'), null)

const completed = await completeTacticalSso()
assert.equal(completed.authenticated, true)
assert.equal(completed.username, 'alice')
assert.equal(localStorage.getItem('access_token'), 'e2e-knox')
assert.deepEqual(calls.slice(-3).map((call) => call.path), ['/accounts/ssoproviders/token/', '/accounts/users/', '/api/tfd/ui/context/'])

// Backward compatibility for the published pre-0.12.77 public contract:
// legacy begin() registrations still work until the contract major is changed.
let legacyCalls = 0
const legacyRegistry = createSsoProviderRegistry({ beginProvider: (entry) => beginTacticalSso(entry.provider_id) })
legacyRegistry.forModule('legacy-settings').register({ id: 'legacy-settings.oidc', label: 'Legacy OIDC' }, async () => { legacyCalls += 1; return 'legacy-started' })
assert.equal(await legacyRegistry.begin('legacy-settings.oidc', {}), 'legacy-started')
assert.equal(legacyCalls, 1)

// If a migrated module supplies both fields, Core owns initiation and begin()
// is ignored rather than causing registration cleanup.
let ignoredBegin = 0
legacyRegistry.forModule('migrated-settings').register({ id: 'migrated-settings.oidc', label: 'Migrated OIDC', provider_id: 'Microsoft-365' }, async () => { ignoredBegin += 1 })
const migrated = legacyRegistry.list({}).find((entry) => entry.id === 'migrated-settings.oidc')
assert.ok(migrated)
assert.equal(migrated.begin, null)
assert.equal(ignoredBegin, 0)

console.log('[TEST] PASS F8 public-module button -> Tactical native SSO -> Tec-Tac session')
