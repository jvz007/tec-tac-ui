// 0.12.96: Add client sends the first site name; custom fields ride along when given; Core's refusal text
// reaches the screen as sent; the site-only scope note shows only for tactical_scope.mode 'sites'.
import assert from 'node:assert/strict'
import fs from 'node:fs'

function response(payload, status = 200) {
  return { ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', headers: { get: () => 'application/json' }, async json() { return payload }, async text() { return JSON.stringify(payload) }, clone() { return this } }
}
globalThis.window = { _env_: { PROD_URL: 'https://api.example.test' }, location: { origin: 'https://ui.example.test' }, dispatchEvent() {} }
globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'token' : null), setItem() {}, removeItem() {} }
const calls = []
let refuse = null
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url)
  const body = options.body ? JSON.parse(options.body) : null
  calls.push({ path: u.pathname, method: options.method || 'GET', body })
  if (refuse) return response({ detail: refuse }, 400)
  if (u.pathname === '/api/tfd/resources/clients/' && options.method === 'POST') return response({ id: 9, name: body.name, sites: [{ id: 91, name: body.site_name || 'Default Site' }] })
  if (u.pathname === '/api/tfd/resources/sites/' && options.method === 'POST') return response({ id: 92, name: body.name, client_id: body.client_id })
  throw new Error(`unexpected ${u.pathname}`)
}
const api = await import('../src/api.js')
const wf = await import('../src/resource-feature-workflows.js')
const lastBody = () => calls.at(-1).body

// Client create: name, site_name, no custom_fields when none.
await api.createResourceClient({ name: 'Acme', siteName: 'HQ' })
assert.deepEqual(lastBody(), { name: 'Acme', site_name: 'HQ' })
assert.equal('custom_fields' in lastBody(), false)
await api.createResourceClient({ name: 'Acme', siteName: 'HQ', customFields: [] })
assert.equal('custom_fields' in lastBody(), false)

// With custom fields: [{ field_id, value }].
await api.createResourceClient({ name: 'Acme', siteName: 'HQ', customFields: [{ field_id: 7, value: 'X', name: 'ignored' }] })
assert.deepEqual(lastBody().custom_fields, [{ field_id: 7, value: 'X' }])

// A plain string still works.
await api.createResourceClient('Legacy')
assert.deepEqual(lastBody(), { name: 'Legacy' })

// Site create: custom_fields only when given.
await api.createResourceSite({ clientId: 3, name: 'Depot' })
assert.deepEqual(lastBody(), { client_id: 3, name: 'Depot' })
await api.createResourceSite({ clientId: 3, name: 'Depot', customFields: [{ field_id: 2, value: true }] })
assert.deepEqual(lastBody(), { client_id: 3, name: 'Depot', custom_fields: [{ field_id: 2, value: true }] })

// The workflow refuses an empty first site name and sends nothing.
const before = calls.length
await assert.rejects(() => wf.createClientWorkflow({ name: 'Acme', siteName: '   ' }, { createResourceClient: api.createResourceClient }), /first site name/i)
await assert.rejects(() => wf.createClientWorkflow({ name: ' ', siteName: 'HQ' }, { createResourceClient: api.createResourceClient }), /client name/i)
assert.equal(calls.length, before)
const created = await wf.createClientWorkflow({ name: ' Acme ', siteName: ' HQ ' }, { createResourceClient: api.createResourceClient })
assert.equal(created.siteName, 'HQ')
assert.deepEqual(lastBody(), { name: 'Acme', site_name: 'HQ' })

// Core's refusal text reaches the caller unchanged.
refuse = 'Client name cannot contain the | character'
await assert.rejects(() => wf.createClientWorkflow({ name: 'A|B', siteName: 'HQ' }, { createResourceClient: api.createResourceClient }), (error) => error.message === 'Client name cannot contain the | character')
refuse = null

// The notice.
assert.equal(wf.clientCreatedNotice('HQ', 'unrestricted'), 'Client created with first site HQ.')
assert.equal(wf.clientCreatedNotice('HQ', 'clients'), 'Client created with first site HQ.')
assert.equal(wf.clientCreatedNotice('HQ', 'sites'), `Client created with first site HQ. ${wf.SITE_ONLY_SCOPE_NOTE}`)
assert.equal(wf.SITE_ONLY_SCOPE_NOTE, 'Your role is limited to sites only, so Tactical does not add this client to your access. Ask an administrator to add it.')

// The view.
const view = fs.readFileSync(new URL('../src/views/ResourcesView.vue', import.meta.url), 'utf8')
assert.match(view, /First site name/)
assert.match(view, /Custom fields can be filled in right after creating\./)
assert.match(view, /label: 'Edit fields'/)
assert.match(view, /createClientWorkflow\(draft,/)
assert.match(view, /state\.context\?\.tactical_scope\?\.mode/)
assert.match(view, /!clientDialog\.siteName\.trim\(\)/, 'Save stays disabled until the first site name is filled')

console.log('resource-create-fields-0.12.96: PASS')
