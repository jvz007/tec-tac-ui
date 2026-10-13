// 0.12.97 (Core 1.17.23): Add client and Add site read the custom-field definitions before the create and send the values
// with it. The Edit fields step after the create is gone; the Fields buttons on existing rows stay. 0.12.98 changed the
// failed-read rule: the read never blocks Save (see resource-create-never-blocked-0.12.98.mjs).
import assert from 'node:assert/strict'
import fs from 'node:fs'

function response(payload, status = 200) {
  return { ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', headers: { get: () => 'application/json' }, async json() { return payload }, async text() { return JSON.stringify(payload) }, clone() { return this } }
}
globalThis.window = { _env_: { PROD_URL: 'https://api.example.test' }, location: { origin: 'https://ui.example.test' }, dispatchEvent() {} }
globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'token' : null), setItem() {}, removeItem() {} }
const calls = []
let definitionsStatus = 200
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url)
  const body = options.body ? JSON.parse(options.body) : null
  calls.push({ path: u.pathname, search: u.search, method: options.method || 'GET', body })
  if (u.pathname === '/api/tfd/resources/custom-fields/') {
    if (definitionsStatus !== 200) return response({ detail: 'You do not have permission to read custom fields.' }, definitionsStatus)
    return response({ resource_type: u.searchParams.get('resource_type'), fields: [
      { field_id: 4, name: 'Account no.', type: 'text', options: [], required: true, value: 'A-100' },
      { field_id: 5, name: 'VIP', type: 'checkbox', options: [], required: false, value: false },
      { field_id: 6, name: 'Tags', type: 'multiple', options: ['x', 'y'], required: false, value: ['x'] },
      { field_id: 7, name: 'Seats', type: 'number', options: [], required: false, value: null },
    ] })
  }
  if (u.pathname === '/api/tfd/resources/clients/' && options.method === 'POST') return response({ id: 9, name: body.name })
  if (u.pathname === '/api/tfd/resources/sites/' && options.method === 'POST') return response({ id: 92, name: body.name })
  throw new Error(`unexpected ${u.pathname}`)
}
const api = await import('../src/api.js')
const wf = await import('../src/resource-feature-workflows.js')
const lastBody = () => calls.at(-1).body

// (1) The definitions read: exact path and query for client and site; any other type is refused before a request.
for (const type of ['client', 'site']) {
  const payload = await api.listResourceCustomFieldDefinitions(type)
  assert.equal(calls.at(-1).path, '/api/tfd/resources/custom-fields/')
  assert.equal(calls.at(-1).search, `?resource_type=${type}`)
  assert.equal(calls.at(-1).method, 'GET')
  assert.equal(payload.resource_type, type)
  assert.equal(payload.fields.length, 4)
}
let count = calls.length
for (const bad of ['agent', 'Client ', 'Client', '', null, undefined, 'client&x=1', 7]) {
  await assert.rejects(() => api.listResourceCustomFieldDefinitions(bad), /client or a site/)
}
assert.equal(calls.length, count, 'no request for a refused type')

// (2) Each default is the value of the form row, and the rows are copies.
const rows = await wf.loadCreateFieldsWorkflow('client', { listResourceCustomFieldDefinitions: api.listResourceCustomFieldDefinitions })
assert.deepEqual(rows.map((row) => [row.field_id, row.value]), [[4, 'A-100'], [5, false], [6, ['x']], [7, null]])

// (3) The create body carries custom_fields: defaults or edited values, whole-number ids.
rows[0].value = 'A-200'
rows[2].value = ['x', 'y']
rows[3].value = 0
await wf.createClientWorkflow({ name: 'Acme', siteName: 'HQ', fields: rows }, { createResourceClient: api.createResourceClient })
assert.deepEqual(lastBody(), { name: 'Acme', site_name: 'HQ', custom_fields: [
  { field_id: 4, value: 'A-200' }, { field_id: 5, value: false }, { field_id: 6, value: ['x', 'y'] }, { field_id: 7, value: 0 },
] })
await wf.createSiteWorkflow({ name: ' Depot ', client_id: 3, fields: rows }, { createResourceSite: api.createResourceSite })
assert.equal(lastBody().client_id, 3)
assert.equal(lastBody().name, 'Depot')
assert.equal(lastBody().custom_fields.length, 4)
// An empty field is not sent.
await wf.createClientWorkflow({ name: 'Acme', siteName: 'HQ', fields: [{ field_id: 4, value: '' }, { field_id: 6, value: [] }, { field_id: 7, value: null }, { field_id: 8, value: undefined }] }, { createResourceClient: api.createResourceClient })
assert.deepEqual(lastBody(), { name: 'Acme', site_name: 'HQ' })
// No fields at all: no custom_fields key.
await wf.createClientWorkflow({ name: 'Acme', siteName: 'HQ', fields: [] }, { createResourceClient: api.createResourceClient })
assert.equal('custom_fields' in lastBody(), false)
await wf.createClientWorkflow({ name: 'Acme', siteName: 'HQ' }, { createResourceClient: api.createResourceClient })
assert.equal('custom_fields' in lastBody(), false)
await wf.createSiteWorkflow({ name: 'Depot', client_id: 3, fields: [] }, { createResourceSite: api.createResourceSite })
assert.equal('custom_fields' in lastBody(), false)
count = calls.length
await assert.rejects(() => wf.createSiteWorkflow({ name: ' ', client_id: 3 }, { createResourceSite: api.createResourceSite }), /site name/i)
await assert.rejects(() => wf.createSiteWorkflow({ name: 'Depot' }, { createResourceSite: api.createResourceSite }), /client/i)
assert.equal(calls.length, count)

// (4) A row whose id is not a positive whole number is dropped before sending.
for (const id of ['1.5', 1.5, true, null, 0, -3, '7', NaN, Infinity, undefined, {}, []]) {
  await api.createResourceClient({ name: 'Acme', siteName: 'HQ', customFields: [{ field_id: id, value: 'x' }, { field_id: 9, value: 'ok' }] })
  assert.deepEqual(lastBody().custom_fields, [{ field_id: 9, value: 'ok' }], `id ${String(id)} dropped`)
  await api.createResourceSite({ clientId: 3, name: 'Depot', customFields: [{ field_id: id, value: 'x' }] })
  assert.equal('custom_fields' in lastBody(), false, `site id ${String(id)} dropped`)
}

// (5) A failed read: Core's message reaches the dialog, nothing is created.
for (const status of [403, 500]) {
  definitionsStatus = status
  await assert.rejects(() => wf.loadCreateFieldsWorkflow('site', { listResourceCustomFieldDefinitions: api.listResourceCustomFieldDefinitions }), (error) => error.status === status && /permission to read custom fields/.test(error.message))
}
definitionsStatus = 200

// (6) The view and the shared component.
const view = fs.readFileSync(new URL('../src/views/ResourcesView.vue', import.meta.url), 'utf8')
const component = fs.readFileSync(new URL('../src/components/CustomFieldInputs.vue', import.meta.url), 'utf8')
assert.doesNotMatch(view, /label: 'Edit fields'/)
assert.doesNotMatch(view, /Custom fields can be filled in right after creating/)
assert.match(view, /openCustomFields\('client', client\)/, 'the Fields button on an existing client stays')
assert.match(view, /openCustomFields\('site', site\)/, 'the Fields button on an existing site stays')
assert.match(view, /import CustomFieldInputs from '\.\.\/components\/CustomFieldInputs\.vue'/)
assert.equal((view.match(/<CustomFieldInputs/g) || []).length, 3, 'two create dialogs and the edit dialog share one component')
assert.match(view, /createSiteWorkflow\(draft, \{ createResourceSite \}\)/)
assert.match(view, /@retry="retryCreateFields\('client'\)"/)
assert.match(view, /@retry="retryCreateFields\('site'\)"/)
assert.match(view, /fieldsStatus: 'loading'/)
for (const type of ['checkbox', 'single', 'multiple', 'number']) assert.ok(component.includes(`field.type==='${type}'`), type)
assert.match(component, /@click="\$emit\('retry'\)"/)
assert.match(component, />Retry</)

console.log('resource-create-custom-fields-0.12.97: PASS')
