import assert from 'node:assert/strict'
import fs from 'node:fs'

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => 'application/json' },
    async json() { return payload },
    async text() { return JSON.stringify(payload) },
    clone() { return this },
  }
}

globalThis.window = {
  _env_: { PROD_URL: 'https://api.example.test' },
  location: { origin: 'https://ui.example.test', pathname: '/tec-tac/', search: '', hash: '' },
  dispatchEvent() {},
}
globalThis.localStorage = {
  getItem(key) { return key === 'access_token' ? 'token-123' : null },
  setItem() {},
  removeItem() {},
}

const fetchCalls = []
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url)
  fetchCalls.push({ path: parsed.pathname, search: parsed.search, options })
  if (parsed.pathname === '/api/tfd/account/password/') return jsonResponse({ changed: true, other_sessions_revoked: 2 })
  if (parsed.pathname === '/api/tfd/account/totp/reset/') return jsonResponse({ reset: true, reauthentication_required: true })
  if (parsed.pathname === '/api/tfd/resources/sites/' && options.method == null) {
    const page = Number(parsed.searchParams.get('page') || 1)
    if (page === 1) return jsonResponse({ items: [{ id: 11, client_id: 1 }, { id: 21, client_id: 2 }], pages: 2 })
    return jsonResponse({ items: [{ id: 22, client_id: 2 }], pages: 2 })
  }
  if (parsed.pathname === '/api/tfd/resources/sites/11/' && options.method === 'DELETE') return jsonResponse({ moved_agents: 3 })
  if (parsed.pathname === '/api/tfd/resources/clients/2/' && options.method === 'DELETE') return jsonResponse({ moved_agents: 4 })
  if (parsed.pathname === '/api/tfd/resources/clients/1/custom-fields/' && options.method == null) {
    return jsonResponse({ fields: [{ field_id: 7, name: 'Customer code', type: 'text', value: 'OLD' }] })
  }
  if (parsed.pathname === '/api/tfd/resources/clients/1/custom-fields/' && options.method === 'PATCH') {
    return jsonResponse({ fields: [{ field_id: 7, name: 'Customer code', type: 'text', value: 'NEW' }] })
  }
  return jsonResponse({ detail: `unexpected request ${parsed.pathname}` }, 500)
}

// F1/F2: execute the same production workflow + production HTTP helpers used by MyAccountView.
const account = await import('../src/account.js')
const accountWorkflows = await import('../src/my-account-workflows.js')
let result = await accountWorkflows.changePasswordWorkflow(
  { current: 'old-password', next: 'Strong-Next-42!', confirm: 'Strong-Next-42!' },
  { changeMyPassword: account.changeMyPassword },
)
assert.equal(result.message, 'Password changed. 2 other session(s) signed out.')
let cleared = 0
let reloaded = 0
result = await accountWorkflows.resetTotpWorkflow(
  { password: 'Strong-Next-42!', code: ' 123456 ' },
  {
    resetMyTotp: account.resetMyTotp,
    confirmReset: () => true,
    clearSession: () => { cleared += 1 },
    reload: () => { reloaded += 1 },
  },
)
assert.equal(result.reset, true)
assert.equal(cleared, 1)
assert.equal(reloaded, 1)
assert.deepEqual(JSON.parse(fetchCalls.find((row) => row.path === '/api/tfd/account/password/').options.body), {
  current_password: 'old-password', new_password: 'Strong-Next-42!',
})
assert.deepEqual(JSON.parse(fetchCalls.find((row) => row.path === '/api/tfd/account/totp/reset/').options.body), {
  current_password: 'Strong-Next-42!', current_totp: '123456',
})

// F4: backend UI context survives normalization and is delivered directly to register(context).
const { normalizeBackendRuntimeContext } = await import('../src/runtime-context.js')
const tacticalUi = { agent_dblclick_action: 'urlaction', url_action_id: 77, can_run_url_actions: true }
const normalized = normalizeBackendRuntimeContext({ user: { username: 'alice' }, tactical_ui: tacticalUi }, { username: 'browser-alice' })
assert.deepEqual(normalized.tactical_ui, tacticalUi)
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])
const fakeRouter = {
  currentRoute: { value: { path: '/', fullPath: '/' } },
  getRoutes: () => [],
  addRoute: () => () => {},
  replace: async () => {},
}
globalThis.__capturedTacticalUi = null
const contextProbeEntry = `data:text/javascript;base64,${Buffer.from(`export default { async register(ctx) { globalThis.__capturedTacticalUi = ctx.context.tactical_ui } }`).toString('base64')}`
const runtimeBase = {
  state: { context: normalized, contextSource: 'backend' },
  router: fakeRouter,
  addNavigation() {},
  api: async () => {}, apiRaw: async () => {}, apiBlob: async () => {}, apiText: async () => {},
}
let loaded = await loader.loadUiModules(runtimeBase, [{ id: 'contextprobe', entry: contextProbeEntry, permissions: [], allowed: true }])
assert.deepEqual(loaded.failed, [])
assert.deepEqual(globalThis.__capturedTacticalUi, tacticalUi)

// F5/F6/F7: execute production Resource workflows over the production API helpers.
const api = await import('../src/api.js')
const resourceWorkflows = await import('../src/resource-feature-workflows.js')
const relocation = await resourceWorkflows.loadRelocationSites({ listResourceSites: api.listResourceSites, excludeClientId: 1, pageSize: 100 })
assert.deepEqual(relocation.map((row) => row.id), [21, 22])
result = await resourceWorkflows.deleteResourceWorkflow(
  { type: 'site', row: { id: 11 }, destination_site_id: '21' },
  { deleteResourceClient: api.deleteResourceClient, deleteResourceSite: api.deleteResourceSite },
)
assert.equal(result.moved, 3)
result = await resourceWorkflows.deleteResourceWorkflow(
  { type: 'client', row: { id: 2 }, destination_site_id: '22' },
  { deleteResourceClient: api.deleteResourceClient, deleteResourceSite: api.deleteResourceSite },
)
assert.equal(result.moved, 4)
const fieldPayload = await api.getResourceCustomFields('client', 1)
const fields = resourceWorkflows.editableCustomFieldRows(fieldPayload)
fields[0].value = 'NEW'
await resourceWorkflows.saveCustomFieldsWorkflow(
  { resourceType: 'client', row: { id: 1 }, fields },
  { updateResourceCustomFields: api.updateResourceCustomFields },
)
const fieldPatch = fetchCalls.find((row) => row.path === '/api/tfd/resources/clients/1/custom-fields/' && row.options.method === 'PATCH')
assert.deepEqual(JSON.parse(fieldPatch.options.body), { values: [{ field_id: 7, value: 'NEW' }] })

// F8: the actual public module loader gives Global Settings a provider-scoped SSO registry.
const vueReactiveStub = 'const reactive = (value) => value\n'
const { createSsoProviderRegistry } = await dataModule('../src/sso-providers.js', [["import { reactive } from 'vue'", vueReactiveStub]])
const ssoProviders = createSsoProviderRegistry()
globalThis.__ssoStarted = false
const globalSettingsEntry = `data:text/javascript;base64,${Buffer.from(`export default { async registerPublic(ctx) { ctx.ssoProviders.register({ id: 'globalsettings.entra', label: 'Microsoft Entra ID' }, async () => { globalThis.__ssoStarted = true; return 'started' }) } }`).toString('base64')}`
loaded = await loader.loadPublicUiModules(
  { router: fakeRouter, app: {}, publicApi: async () => {}, ssoProviders },
  [{ id: 'globalsettings', public: { entry: globalSettingsEntry, base_path: '/public/globalsettings' } }],
)
assert.deepEqual(loaded.failed, [])
assert.deepEqual(ssoProviders.list({}).map((row) => row.id), ['globalsettings.entra'])
assert.equal(await ssoProviders.begin('globalsettings.entra', { return_to: '/tec-tac/' }), 'started')
assert.equal(globalThis.__ssoStarted, true)

// F9: the actual authenticated loader gives Alerts its header slot.
const vueHeaderStub = 'const reactive = (value) => value\nconst markRaw = (value) => value\n'
const { createHeaderContributionRegistry } = await dataModule('../src/header-contributions.js', [["import { markRaw, reactive } from 'vue'", vueHeaderStub]])
const header = createHeaderContributionRegistry({ hasPermission: () => true })
const alertsEntry = `data:text/javascript;base64,${Buffer.from(`export default { async register(ctx) { ctx.header.register({ id: 'alerts.bell', label: 'Alerts', component: { name: 'AlertsBell' } }) } }`).toString('base64')}`
loaded = await loader.loadUiModules({ ...runtimeBase, header }, [{ id: 'alerts', entry: alertsEntry, permissions: [], allowed: true }])
assert.deepEqual(loaded.failed, [])
assert.deepEqual(header.list({ user: normalized.user }).map((row) => row.id), ['alerts.bell'])

// F10: the actual authenticated loader gives a module client/site context-menu placements.
const { createContextActionRegistry } = await dataModule('../src/context-actions.js', [["import { reactive } from 'vue'", vueReactiveStub]])
const contextActions = createContextActionRegistry({ hasPermission: () => true })
globalThis.__contextAction = null
const actionEntry = `data:text/javascript;base64,${Buffer.from(`export default { async register(ctx) { ctx.contextActions.register({ id: 'integration.client', resource: 'client', label: 'Client action', placements: ['client.context-menu'] }, async (actionContext) => { globalThis.__contextAction = actionContext; return 99 }); ctx.contextActions.register({ id: 'integration.site', resource: 'site', label: 'Site action', placements: ['site.context-menu'] }, async () => 100) } }`).toString('base64')}`
loaded = await loader.loadUiModules({ ...runtimeBase, contextActions }, [{ id: 'integration', entry: actionEntry, permissions: [], allowed: true }])
assert.deepEqual(loaded.failed, [])
const surface = await import('../src/extension-surface-workflows.js')
const client = { id: 5, name: 'Acme' }
const clientActions = surface.resourceContextMenuActions(contextActions, 'client', client)
assert.deepEqual(clientActions.map((row) => row.id), ['integration.client'])
assert.equal(await surface.executeResourceContextMenuAction(contextActions, clientActions[0], 'client', client), 99)
assert.equal(globalThis.__contextAction.client.id, 5)
const site = { id: 8, name: 'HQ' }
assert.deepEqual(surface.resourceContextMenuActions(contextActions, 'site', site).map((row) => row.id), ['integration.site'])

console.log('tracker final feature closure F1-F10 0.12.65: PASS')
