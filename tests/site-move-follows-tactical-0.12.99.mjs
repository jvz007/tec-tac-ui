// 0.12.99 (Core 1.17.25, AD-29, CQ79): Move to client follows Tactical's rule. The destination needs no grant, so the picker
// lists what Core's client list returns, a move to any listed client sends PATCH { client_id }, a 400 (missing
// destination) and a 409 (name clash) show Core's text in the open dialog, and nothing treats 404 as a special case.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const view = read('../src/views/ResourcesView.vue')
assert.equal(JSON.parse(read('../tec_tac_package.json')).requires['tec-tac-framework'], '>=1.17.32,<2.0.0')

function fn(name) {
  const start = view.indexOf(`async function ${name}(`)
  assert.ok(start > 0, `${name} exists`)
  return view.slice(start, view.indexOf('\n}\n', start) + 3)
}
const inner = (source, name) => source.replace(new RegExp(`^async function ${name}\\([^)]*\\) \\{`), '').replace(/\}\n$/, '')

// The picker (clients mode): exactly the rows Core's list returned, no client-side grant filter.
async function pick({ rows, selected = { id: 1, name: 'Acme' }, mode = 'clients' }) {
  const siteDialog = { value: { mode: 'edit' } }
  const readMode = { value: mode }
  const siteClientSearch = { value: '' }
  const loadingSiteClientOptions = { value: false }
  const siteClientOptions = { value: [] }
  const error = { value: '' }
  const selectedClient = { value: selected }
  const run = new Function('siteDialog', 'readMode', 'siteClientSearch', 'loadingSiteClientOptions', 'siteClientOptions', 'error', 'selectedClient', 'listResourceClients', 'readSitesDirectory', 'message', 'state', 'permissions', 'superuser',
    `let siteClientRequest = 0; return (async () => {${inner(fn('loadSiteClientOptions'), 'loadSiteClientOptions').replace('const request = ++siteClientRequest', 'const request = ++siteClientRequest')}})()`)
  await run(siteDialog, readMode, siteClientSearch, loadingSiteClientOptions, siteClientOptions, error, selectedClient,
    async () => ({ items: rows }), async () => [], (e, f) => e?.message || f, {}, { value: new Set() }, { value: false })
  return siteClientOptions.value
}
// The person holds no grant on Beta or Gamma: both stay in the list.
const returned = [{ id: 1, name: 'Acme' }, { id: 3, name: 'Beta' }, { id: 4, name: 'Gamma' }]
assert.deepEqual(await pick({ rows: returned }), returned)
// The current client is kept so the select can show it; it is the only row added.
assert.deepEqual(await pick({ rows: [{ id: 3, name: 'Beta' }] }), [{ id: 1, name: 'Acme' }, { id: 3, name: 'Beta' }])
assert.doesNotMatch(fn('loadSiteClientOptions'), /permissions\.value|superuser\.value|clients\.manage|sites\.manage|rows\.filter/)

// The save: a move to a client the person does not hold sends only client_id.
const editBody = inner(fn('saveSiteEdit'), 'saveSiteEdit')
async function save(draft, { refusal = null } = {}) {
  const log = { updates: [] }
  const siteDialog = { value: draft }
  const error = { value: '' }
  const notice = { value: '' }
  const run = new Function('siteDialog', 'saving', 'error', 'notice', 'noticeAction', 'updateResourceSite', 'message', 'invalidateDirectory', 'loadClients', 'clients', 'selectedClientId', 'siteClientOptions', 'loadSites', 'draft',
    `return (async () => {${editBody}})()`)
  await run(siteDialog, { value: false }, error, notice, { value: null },
    async (id, patch) => { log.updates.push({ id, patch }); if (refusal) throw Object.assign(new Error(refusal.text), { status: refusal.status }) },
    (e, f) => e?.message || f, () => {}, async () => {}, { value: [{ id: 3, name: 'Beta' }] }, { value: 1 }, { value: [{ id: 3, name: 'Beta' }] }, async () => {}, draft)
  return { log, siteDialog, notice }
}
const edit = (o = {}) => ({ mode: 'edit', id: 7, client_id: 1, originalClientId: 1, name: 'Depot', originalName: 'Depot', error: '', ...o })
{
  const r = await save(edit({ client_id: 3 }))
  assert.deepEqual(r.log.updates, [{ id: 7, patch: { clientId: 3 } }])
  assert.equal(r.notice.value, 'Site moved to Beta.')
  assert.equal(r.siteDialog.value, null)
}
for (const [status, text] of [[400, 'Destination client not found.'], [409, 'A site with that name already exists for the selected client.']]) {
  const draft = edit({ client_id: 3, name: 'Depot North' })
  const r = await save(draft, { refusal: { status, text } })
  assert.equal(r.siteDialog.value, draft, 'the dialog stays open')
  assert.equal(draft.error, text, "Core's text is shown as sent")
  assert.equal(draft.client_id, 3)
  assert.equal(draft.name, 'Depot North', 'the draft values are intact')
}
// Rename only and no-op keep their behaviour.
{ const r = await save(edit({ name: 'Depot North' })); assert.deepEqual(r.log.updates, [{ id: 7, patch: { name: 'Depot North' } }]) }
{ const r = await save(edit()); assert.equal(r.log.updates.length, 0); assert.equal(r.siteDialog.value, null) }

// No 404 special case anywhere in the view, and the dead non-edit PATCH branch is gone from saveSite.
assert.doesNotMatch(view, /404/)
const saveSiteSource = fn('saveSite')
assert.doesNotMatch(saveSiteSource, /updateResourceSite/)
assert.match(saveSiteSource, /createSiteWorkflow\(draft, \{ createResourceSite \}\)/)
assert.match(view, /Core decides who may move a site\. The agents on the site move with it\./)
assert.match(view, /that is the only row added|only row added/)

console.log('site-move follows Tactical 0.12.99: PASS')
