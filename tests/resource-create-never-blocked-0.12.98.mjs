// 0.12.98 (Johan, 13 October 2026; supersedes Q30 of 0.12.97): a custom-field read that fails, is still loading or returns
// nothing never blocks Add client or Add site. The create goes ahead with the fields that are ready (none after a failed read)
// and no custom_fields key. The dialog shows one plain line and Retry; Core's raw message is not printed there.
import assert from 'node:assert/strict'
import fs from 'node:fs'

function response(payload, status = 200) {
  return { ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', headers: { get: () => 'application/json' }, async json() { return payload }, async text() { return JSON.stringify(payload) }, clone() { return this } }
}
globalThis.window = { _env_: { PROD_URL: 'https://api.example.test' }, location: { origin: 'https://ui.example.test' }, dispatchEvent() {} }
globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'token' : null), setItem() {}, removeItem() {} }
const calls = []
let definitions = { status: 403, payload: { detail: 'You do not have permission to read custom fields.' } }
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url)
  const body = options.body ? JSON.parse(options.body) : null
  calls.push({ path: u.pathname, method: options.method || 'GET', body })
  if (u.pathname === '/api/tfd/resources/custom-fields/') {
    if (definitions.status !== 200) return response(definitions.payload, definitions.status)
    return response({ resource_type: u.searchParams.get('resource_type'), fields: [
      { field_id: 4, name: 'Account no.', type: 'text', options: [], required: false, value: 'A-100' },
      { field_id: 5, name: 'VIP', type: 'checkbox', options: [], required: false, value: false },
    ] })
  }
  if (u.pathname === '/api/tfd/resources/clients/' && options.method === 'POST') return response({ id: 9, name: body.name })
  if (u.pathname === '/api/tfd/resources/sites/' && options.method === 'POST') return response({ id: 92, name: body.name })
  throw new Error(`unexpected ${u.pathname}`)
}
const api = await import('../src/api.js')
const wf = await import('../src/resource-feature-workflows.js')
const lastBody = () => calls.at(-1).body

const pkg = JSON.parse(fs.readFileSync(new URL('../tec_tac_package.json', import.meta.url), 'utf8'))
assert.equal(pkg.requires['tec-tac-framework'], '>=1.17.34,<2.0.0')

// (1) A failed read (403, 500, network) does not stop the create: no custom_fields key, the create succeeds.
for (const status of [403, 500]) {
  definitions = { status, payload: { detail: 'Core refused the read.' } }
  await assert.rejects(() => wf.loadCreateFieldsWorkflow('client', { listResourceCustomFieldDefinitions: api.listResourceCustomFieldDefinitions }))
  // The dialog keeps no rows after the failure, so the create sends the ready fields: none.
  const row = await wf.createClientWorkflow({ name: 'Acme', siteName: 'HQ', fields: [] }, { createResourceClient: api.createResourceClient })
  assert.equal(row.row.id, 9)
  assert.deepEqual(lastBody(), { name: 'Acme', site_name: 'HQ' }, `client after ${status}`)
  const site = await wf.createSiteWorkflow({ name: 'Depot', client_id: 3, fields: [] }, { createResourceSite: api.createResourceSite })
  assert.equal(site.id, 92)
  assert.deepEqual(lastBody(), { client_id: 3, name: 'Depot' }, `site after ${status}`)
}
// A network failure while reading is the same as a refusal.
globalThis.fetch = ((original) => async (url, options) => {
  if (new URL(url).pathname === '/api/tfd/resources/custom-fields/') throw new TypeError('Failed to fetch')
  return original(url, options)
})(globalThis.fetch)
await assert.rejects(() => wf.loadCreateFieldsWorkflow('site', { listResourceCustomFieldDefinitions: api.listResourceCustomFieldDefinitions }))
await wf.createSiteWorkflow({ name: 'Depot', client_id: 3, fields: [] }, { createResourceSite: api.createResourceSite })
assert.deepEqual(lastBody(), { client_id: 3, name: 'Depot' }, 'a network failure does not block the site create')

// (2) A read that works sends the defaults as before.
globalThis.fetch = ((original) => async (url, options) => {
  if (new URL(url).pathname === '/api/tfd/resources/custom-fields/') return response({ resource_type: 'site', fields: [
    { field_id: 4, name: 'Account no.', type: 'text', options: [], required: false, value: 'A-100' },
    { field_id: 5, name: 'VIP', type: 'checkbox', options: [], required: false, value: false },
  ] })
  return original(url, options)
})(globalThis.fetch)
const rows = await wf.loadCreateFieldsWorkflow('site', { listResourceCustomFieldDefinitions: api.listResourceCustomFieldDefinitions })
await wf.createSiteWorkflow({ name: 'Depot', client_id: 3, fields: rows }, { createResourceSite: api.createResourceSite })
assert.deepEqual(lastBody(), { client_id: 3, name: 'Depot', custom_fields: [{ field_id: 4, value: 'A-100' }, { field_id: 5, value: false }] })

// (3) An empty definitions list creates normally with no custom_fields key.
globalThis.fetch = ((original) => async (url, options) => {
  if (new URL(url).pathname === '/api/tfd/resources/custom-fields/') return response({ resource_type: 'client', fields: [] })
  return original(url, options)
})(globalThis.fetch)
const empty = await wf.loadCreateFieldsWorkflow('client', { listResourceCustomFieldDefinitions: api.listResourceCustomFieldDefinitions })
assert.deepEqual(empty, [])
await wf.createClientWorkflow({ name: 'Acme', siteName: 'HQ', fields: empty }, { createResourceClient: api.createResourceClient })
assert.deepEqual(lastBody(), { name: 'Acme', site_name: 'HQ' })

// (4) Source checks: Save is never disabled by the read.
const view = fs.readFileSync(new URL('../src/views/ResourcesView.vue', import.meta.url), 'utf8')
assert.doesNotMatch(view, /createFieldsPending/)
assert.doesNotMatch(view, /fieldsError/)
const disabledLines = view.split('\n').filter((line) => /:disabled=/.test(line) && /(clientDialog|siteDialog)/.test(line))
assert.ok(disabledLines.length >= 2)
for (const line of disabledLines) assert.doesNotMatch(line, /fieldsStatus|createFieldsPending/, 'Save is not disabled by the read')
assert.match(view, /<button class="btn primary" :disabled="saving\|\|!clientDialog\.name\.trim\(\)\|\|\(clientDialog\.mode==='create'&&!clientDialog\.siteName\.trim\(\)\)"/)
assert.match(view, /<button class="btn primary" :disabled="saving\|\|!siteDialog\.name\.trim\(\)\|\|!siteDialog\.client_id"/)
assert.match(view, /if \(!draft \|\| !draft\.name\.trim\(\)\) return\n/)
assert.match(view, /if \(!draft \|\| !draft\.name\.trim\(\) \|\| !draft\.client_id\) return\n/)
assert.match(view, /dialog\.fields = \[\]\n    dialog\.fieldsStatus = 'error'/, 'a failed read sends nothing from the list')
assert.match(view, /@retry="retryCreateFields\('client'\)"/)
assert.match(view, /@retry="retryCreateFields\('site'\)"/)
assert.equal((view.match(/<CustomFieldInputs/g) || []).length, 3, 'two create dialogs and the edit dialog share one component')

// (5) The shared component: one plain line and Retry; no raw Core message in the create dialogs.
const component = fs.readFileSync(new URL('../src/components/CustomFieldInputs.vue', import.meta.url), 'utf8')
assert.match(component, /<span>Custom fields could not be loaded\. You can add them after, with the Fields button on the row\.<\/span>/)
assert.match(component, /<button type="button" class="btn sm" @click="\$emit\('retry'\)">Retry<\/button>/)
assert.match(component, /defineEmits\(\['retry'\]\)/)
assert.match(component, /status === 'loading'/)
assert.doesNotMatch(component, /\{\{ error \}\}/, 'the raw Core message is not printed')
assert.doesNotMatch(component, /props\.error|error: \{ type: String/, 'the error prop is gone')
assert.match(component, /v-else-if="fields\.length"/, 'an empty list shows nothing')

// The workflow comment says the read never blocks Save.
const workflows = fs.readFileSync(new URL('../src/resource-feature-workflows.js', import.meta.url), 'utf8')
assert.match(workflows, /the read never blocks Save \(0\.12\.98\)/)

// The Q30 entry is closed by Johan's message, and the shipped list names the version.
// The questions file lives outside the package, so a clean checkout of repos/ui skips this check.
const questionsUrl = new URL('../../../reviews/questions/ui.md', import.meta.url)
if (fs.existsSync(questionsUrl)) {
  assert.doesNotMatch(fs.readFileSync(questionsUrl, 'utf8'), /### Q30\. Custom-field/)
}

console.log('resource create never blocked 0.12.98: PASS')
