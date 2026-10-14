// 0.12.98 (Core 1.17.24, CO25): Edit site has a Move to client control. A move and a rename go in one PATCH with only the
// keys that changed; Core's refusal text reaches the dialog as sent; the create dialog is unchanged.
import assert from 'node:assert/strict'
import fs from 'node:fs'

function response(payload, status = 200) {
  return { ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Error', headers: { get: () => 'application/json' }, async json() { return payload }, async text() { return JSON.stringify(payload) }, clone() { return this } }
}
globalThis.window = { _env_: { PROD_URL: 'https://api.example.test' }, location: { origin: 'https://ui.example.test' }, dispatchEvent() {} }
globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'token' : null), setItem() {}, removeItem() {} }
const calls = []
let nextAnswer = null
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url)
  const body = options.body ? JSON.parse(options.body) : null
  calls.push({ path: u.pathname, method: options.method || 'GET', body })
  if (nextAnswer) { const answer = nextAnswer; nextAnswer = null; return response(answer.payload, answer.status) }
  if (u.pathname === '/api/tfd/resources/sites/7/') return response({ id: 7, name: body?.name ?? 'Depot', client_id: body?.client_id ?? 1 })
  if (u.pathname === '/api/tfd/resources/sites/' && options.method === 'POST') return response({ id: 92, name: body.name })
  throw new Error(`unexpected ${options.method || 'GET'} ${u.pathname}`)
}
const api = await import('../src/api.js')
const pkg = JSON.parse(fs.readFileSync(new URL('../tec_tac_package.json', import.meta.url), 'utf8'))
const view = fs.readFileSync(new URL('../src/views/ResourcesView.vue', import.meta.url), 'utf8')

// The Core range this release needs.
assert.equal(pkg.requires['tec-tac-framework'], '>=1.17.35,<2.0.0')

// (1) A changed client sends PATCH with client_id only; with a rename too, name goes as well.
await api.updateResourceSite(7, { clientId: 3 })
assert.equal(calls.at(-1).path, '/api/tfd/resources/sites/7/')
assert.equal(calls.at(-1).method, 'PATCH')
assert.deepEqual(calls.at(-1).body, { client_id: 3 })
await api.updateResourceSite(7, { clientId: 3, name: 'Depot North' })
assert.deepEqual(calls.at(-1).body, { client_id: 3, name: 'Depot North' })

// (3) A rename without a move sends name only.
await api.updateResourceSite(7, { name: 'Depot' })
assert.deepEqual(calls.at(-1).body, { name: 'Depot' })
assert.equal('client_id' in calls.at(-1).body, false)

// Nothing given: an empty PATCH is never a move or a rename (the view sends nothing in that case).
await api.updateResourceSite(7, {})
assert.deepEqual(calls.at(-1).body, {})

// (2) The view sends no request when neither the client nor the name changed.
assert.match(view, /if \(!moving && !renaming\) \{ siteDialog\.value = null; return \}/)
assert.match(view, /const moving = draft\.client_id !== draft\.originalClientId/)
assert.match(view, /const renaming = name !== draft\.originalName/)
assert.match(view, /if \(moving\) patch\.clientId = draft\.client_id/)
assert.match(view, /if \(renaming\) patch\.name = name/)

// (4) 0.12.99 (Core 1.17.25): a missing destination answers 400, not 404. Core's refusals reach the caller unchanged, with the status kept.
const refusals = [
  [400, { detail: 'A client must retain at least one site.' }],
  [409, { detail: 'A site with that name already exists for the selected client.' }],
  [400, { detail: 'Client not found.' }],
]
for (const [status, payload] of refusals) {
  nextAnswer = { status, payload }
  await assert.rejects(() => api.updateResourceSite(7, { clientId: 3 }), (error) => error.status === status && error.message === payload.detail)
}

// (6) Add site still sends client_id with the custom fields, as in 0.12.97.
await api.createResourceSite({ clientId: 3, name: 'Depot', customFields: [{ field_id: 4, value: 'A-100' }] })
assert.deepEqual(calls.at(-1).body, { client_id: 3, name: 'Depot', custom_fields: [{ field_id: 4, value: 'A-100' }] })

// (2b) The view's Edit site save, run from its real source with stubs for the reactive state it uses.
const editStart = view.indexOf('async function saveSiteEdit(draft) {')
assert.ok(editStart > 0, 'saveSiteEdit exists')
const editSource = view.slice(editStart, view.indexOf('\n}\n', editStart) + 3)
const editBody = editSource.replace(/^async function saveSiteEdit\(draft\) \{/, '').replace(/\}\n$/, '')
async function runSaveSiteEdit(draft, { refusal = null, options = [] } = {}) {
  const log = { updates: [], loads: 0, sitesLoads: 0, invalidated: 0 }
  const siteDialog = { value: draft }
  const saving = { value: false }
  const error = { value: '' }
  const notice = { value: '' }
  const noticeAction = { value: null }
  const clients = { value: [{ id: 1, name: 'Acme' }, { id: 3, name: 'Beta' }] }
  const selectedClientId = { value: 1 }
  const siteClientOptions = { value: options }
  const run = new Function(
    'siteDialog', 'saving', 'error', 'notice', 'noticeAction', 'updateResourceSite', 'message', 'invalidateDirectory',
    'loadClients', 'clients', 'selectedClientId', 'siteClientOptions', 'loadSites', 'draft',
    `return (async () => {${editBody}})()`,
  )
  await run(
    siteDialog, saving, error, notice, noticeAction,
    async (id, patch) => {
      log.updates.push({ id, patch })
      if (refusal) throw Object.assign(new Error(refusal), { status: 400 })
    },
    (e, fallback) => e?.message || fallback,
    () => { log.invalidated += 1 },
    async () => { log.loads += 1 },
    clients, selectedClientId, siteClientOptions,
    async () => { log.sitesLoads += 1 },
    draft,
  )
  return { log, siteDialog, error, notice, saving }
}
const edit = (overrides = {}) => ({ mode: 'edit', id: 7, client_id: 1, originalClientId: 1, name: 'Depot', originalName: 'Depot', error: '', ...overrides })
const beta = [{ id: 3, name: 'Beta' }]

// Nothing changed: no request, the dialog closes.
{
  const run = await runSaveSiteEdit(edit({ name: '  Depot  ' }))
  assert.equal(run.log.updates.length, 0, 'an unchanged edit sends no request')
  assert.equal(run.siteDialog.value, null)
  assert.equal(run.notice.value, '')
}
// A move to another client: client_id only; the notice names the client.
{
  const run = await runSaveSiteEdit(edit({ client_id: 3 }), { options: beta })
  assert.deepEqual(run.log.updates, [{ id: 7, patch: { clientId: 3 } }])
  assert.equal(run.notice.value, 'Site moved to Beta.')
  assert.equal(run.siteDialog.value, null)
}
// A rename without a move: name only, the notice says updated.
{
  const run = await runSaveSiteEdit(edit({ name: 'Depot North' }))
  assert.deepEqual(run.log.updates, [{ id: 7, patch: { name: 'Depot North' } }])
  assert.equal(run.notice.value, 'Site updated.')
}
// A move and a rename: one request with both.
{
  const run = await runSaveSiteEdit(edit({ client_id: 3, name: 'Depot North' }), { options: beta })
  assert.deepEqual(run.log.updates, [{ id: 7, patch: { clientId: 3, name: 'Depot North' } }])
}
// Core's refusal stays in the dialog, which stays open, with the text as sent.
for (const text of ['A client must retain at least one site.', 'A site with that name already exists for the selected client.', 'Site not found for the selected client.']) {
  const run = await runSaveSiteEdit(edit({ client_id: 3 }), { refusal: text, options: beta })
  assert.equal(run.siteDialog.value !== null, true, 'the dialog stays open')
  assert.equal(run.siteDialog.value.error, text)
  assert.equal(run.notice.value, '')
  assert.equal(run.error.value, '', 'the page banner is not used for the edit dialog')
  assert.equal(run.saving.value, false)
}

// (5) Source checks on the dialog.
assert.match(view, /siteDialog\.mode==='edit' \? 'Find client to move to' : 'Find client'/)
assert.match(view, /siteDialog\.mode==='edit' \? 'Move to client' : 'Client'/)
assert.equal((view.match(/Move to client/g) || []).length, 1, 'the Move to client label is only in edit mode')
assert.match(view, /<div v-if="siteDialog\.mode==='edit' && siteDialog\.error" class="auth-error" role="alert">\{\{ siteDialog\.error \}\}<\/div>/)
assert.match(view, /if \(siteDialog\.value === draft\) draft\.error = message\(e, 'Unable to save site\.'\)/)
assert.match(view, /siteDialog\.value\.error = ''/, 'a new choice clears the refusal')
assert.doesNotMatch(view, /sites\.manage<\/span> grant|sites\.manage grant/)
assert.match(view, /Core decides who may move a site\. The agents on the site move with it\./)
assert.match(view, /`Site moved to \$\{destinationName\}\.`/)
assert.match(view, /'Site updated\.'/)

console.log('site-move 0.12.98: PASS')
