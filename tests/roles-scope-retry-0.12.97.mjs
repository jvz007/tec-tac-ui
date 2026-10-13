// 0.12.97 (held Low from 0.12.96): the Clients & sites directory of the role form is marked loaded only when the read
// worked, so a failed read is tried again when the tab opens again, and the tab has a Retry button.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { readScopeDirectory } from '../src/role-scope.js'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')

// The source: scopeLoaded = true sits only on the no-error branch.
const panel = read('../src/components/access/RolesPanel.vue')
const start = panel.indexOf('async function ensureScopeDirectory()')
const end = panel.indexOf('const editorTabs', start)
const body = panel.slice(start, end)
assert.equal((body.match(/scopeLoaded = true/g) || []).length, 1, 'scopeLoaded is set in one place')
assert.match(body, /if \(!scopeRead\.value\.error\) scopeLoaded = true/)
assert.ok(!/\n\s*scopeLoaded = true\s*\n/.test(body), 'never set unconditionally')
assert.match(panel, /if \(id === 'scope'\) void ensureScopeDirectory\(\)/, 'opening the tab tries again')
assert.match(panel, /@retry="ensureScopeDirectory"/)
const picker = read('../src/components/access/RoleScopePicker.vue')
assert.match(picker, /defineEmits\(\['update:clients', 'update:sites', 'retry'\]\)/)
assert.match(picker, /<div v-if="error" class="auth-error">\{\{ error \}\}[^\n]*@click="emit\('retry'\)">Retry<\/button>/)

// The helper the retry relies on: a thrown read gives an error and an empty directory; the next read gives the directory.
let fail = true
const context = { capabilities: { list_clients: true } }
const listClients = async () => {
  if (fail) throw new Error('Core is not reachable.')
  return { items: [{ id: 1, name: 'Acme', sites: [{ id: 10, name: 'HQ', client_id: 1 }] }], pages: 1 }
}
const listSites = async () => { throw new Error('never') }
const failed = await readScopeDirectory({ context, listClients, listSites })
assert.equal(failed.error, 'Core is not reachable.')
assert.deepEqual(failed.directory.clients, [])
fail = false
const ok = await readScopeDirectory({ context, listClients, listSites })
assert.equal(ok.error, '')
assert.deepEqual(ok.directory.clients.map((client) => client.name), ['Acme'])

console.log('roles-scope-retry-0.12.97: PASS')
