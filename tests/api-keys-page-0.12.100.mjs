// 0.12.100 (Core 1.17.26): the API keys page. Flags are read strictly; the Access item shows for can_list_api_keys alone; payloads
// never carry `key`; the one-time key is found by name and owner; [REDACTED] is never copyable; every write sits under the manage
// gate; the page uses apiFetch only and never stores a key.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const keys = await import(new URL('../src/api-keys.js', import.meta.url).href)
const { coreNavigation } = await import(new URL('../src/core-navigation.js', import.meta.url).href)
const panel = read('../src/components/access/ApiKeysPanel.vue')
const access = read('../src/access.js')
const view = read('../src/views/AccessView.vue')
const { canListApiKeys, canManageApiKeys, buildCreatePayload, buildUpdatePayload, findCreatedKey, isRedacted, normalizeApiKeys } = keys

// Flag gating: only the boolean true counts.
for (const bad of ['true', 1, 'yes', null, undefined, {}, [], 0]) {
  assert.equal(canListApiKeys({ tactical_permissions: { can_list_api_keys: bad } }), false, `list is strict for ${JSON.stringify(bad)}`)
  assert.equal(canManageApiKeys({ tactical_permissions: { can_manage_api_keys: bad } }), false, `manage is strict for ${JSON.stringify(bad)}`)
}
assert.equal(canListApiKeys({ tactical_permissions: { can_list_api_keys: true } }), true)
assert.equal(canManageApiKeys({ tactical_permissions: { can_manage_api_keys: true } }), true)
assert.equal(canListApiKeys({ tactical_permissions: { can_manage_api_keys: true } }), false, 'manage alone does not list')
assert.equal(canManageApiKeys({ tactical_permissions: { can_list_api_keys: true } }), false, 'list alone does not manage')
// A superuser object with no flags still hides the tab: Tactical's flags decide.
assert.equal(canListApiKeys({ user: { superuser: true }, tactical_permissions: {} }), false)
assert.equal(canListApiKeys({ user: { superuser: true } }), false)
assert.equal(canListApiKeys(null), false)
assert.equal(canManageApiKeys(undefined), false)

// Navigation: Access shows for can_list_api_keys alone, and hides with neither flag.
const accessItem = (ctx) => coreNavigation(ctx).find((entry) => entry.to === '/access')
const none = { list_accounts: false, list_roles: false }
assert.equal(accessItem({ capabilities: none, tactical_permissions: { can_list_api_keys: true }, user: { superuser: false } }).visible, true)
assert.equal(accessItem({ capabilities: none, tactical_permissions: { can_list_api_keys: 'true' }, user: { superuser: false } }).visible, false)
assert.equal(accessItem({ capabilities: none, tactical_permissions: {}, user: { superuser: false } }).visible, false)
assert.equal(accessItem({ capabilities: none, tactical_permissions: { can_manage_api_keys: true }, user: { superuser: false } }).visible, false, 'manage alone does not show Access')
assert.equal(accessItem({ capabilities: { list_accounts: true }, tactical_permissions: {}, user: { superuser: false } }).visible, true, 'existing rule unchanged')

// Payloads: name trimmed, owner a Tactical id, expiry ISO or null, and never a key.
assert.deepEqual(buildCreatePayload({ name: '  nightly backup  ', ownerId: '7', expiration: null }), { name: 'nightly backup', user: 7, expiration: null })
const update = buildUpdatePayload({ name: 'reports', ownerId: 3, expiration: '2027-01-01T00:00:00.000Z' })
assert.deepEqual(update, { name: 'reports', user: 3, expiration: '2027-01-01T00:00:00.000Z' })
assert.equal('key' in update, false, 'an edit never sends key')
assert.equal('key' in buildCreatePayload({ name: 'a', ownerId: 1, expiration: null }), false, 'a create never sends key')
assert.throws(() => buildCreatePayload({ name: 'a', ownerId: '' }), TypeError)
assert.throws(() => buildUpdatePayload({ name: 'a', ownerId: 0 }), TypeError)

// Expiry: blank is never (null); a valid local time becomes the same instant in ISO; text that is not a date is refused.
assert.deepEqual(keys.expiryFromLocal(''), { iso: null, error: '' })
assert.equal(keys.expiryFromLocal('not a date').iso, null)
assert.notEqual(keys.expiryFromLocal('not a date').error, '')
assert.equal(Date.parse(keys.expiryFromLocal('2027-03-01T09:30').iso), new Date('2027-03-01T09:30').getTime())
assert.equal(keys.expiryToLocal(new Date(2027, 2, 1, 9, 30).toISOString()), '2027-03-01T09:30')
assert.equal(keys.expiryToLocal(null), '')

// Name rule: Tactical's 25 characters, and blank refused before any call.
assert.match(keys.apiKeyNameError('   '), /Enter a name/)
assert.match(keys.apiKeyNameError('x'.repeat(26)), /at most 25/)
assert.equal(keys.apiKeyNameError('x'.repeat(25)), '')
assert.equal(keys.API_KEY_NAME_MAX, 25)

// The list: rows are sanitised, and a row without an id is dropped.
const rows = normalizeApiKeys([
  { id: 1, name: 'backup', username: 'ops', user: 4, expiration: null, key: 'ABC' },
  { name: 'no id', key: 'X' },
  null,
  { id: 2, name: 'tool', username: 'root', user: 1, expiration: '2027-01-01T00:00:00Z', key: '[REDACTED]' },
])
assert.equal(rows.length, 2)
assert.equal(rows[1].key, '[REDACTED]')
assert.deepEqual(normalizeApiKeys('not a list'), [])

// The one-time key: found by name and owner after a create, or null when absent.
assert.equal(findCreatedKey(rows, 'backup', 4).key, 'ABC')
assert.equal(findCreatedKey(rows, 'backup', 1), null, 'same name, other owner is not the key')
assert.equal(findCreatedKey(rows, 'missing', 4), null)
assert.equal(findCreatedKey(rows, '  tool ', '1').id, 2)

// Redaction: exactly the marker is redacted; a copy is never offered for it.
assert.equal(isRedacted('[REDACTED]'), true)
assert.equal(isRedacted('[REDACTED] '), false)
assert.equal(isRedacted('ABC'), false)
assert.equal(isRedacted(undefined), false)

// Errors: Core's detail first, then Tactical's field message, then the plain message.
assert.equal(keys.apiKeyErrorText({ payload: { detail: 'Only a superuser may change this key.' }, message: 'x' }), 'Only a superuser may change this key.')
assert.equal(keys.apiKeyErrorText({ payload: { name: ['api key with this name already exists.'] }, message: 'x' }), 'Name: api key with this name already exists.')
assert.equal(keys.apiKeyErrorText({ payload: { user: ['Invalid pk "9" - object does not exist.'] } }), 'Owner: Invalid pk "9" - object does not exist.')
assert.equal(keys.apiKeyErrorText({ payload: 'The API key was not found', message: 'x' }), 'The API key was not found')
assert.equal(keys.apiKeyErrorText({ message: 'Network down' }), 'Network down')
assert.equal(keys.apiKeyErrorText({}), 'The API key could not be saved.')

// Source: every call goes through apiFetch (in access.js), nothing is stored, and no token is built by hand.
for (const [name, source] of [['ApiKeysPanel.vue', panel], ['access.js', access], ['api-keys.js', read('../src/api-keys.js')]]) {
  assert.doesNotMatch(source, /\bfetch\s*\(/, `${name} calls fetch directly`)
  assert.doesNotMatch(source, /Authorization/, `${name} builds an auth header`)
  assert.doesNotMatch(source, /localStorage|sessionStorage/, `${name} touches browser storage`)
}
assert.match(access, /apiFetch\('\/accounts\/apikeys\/'/)
assert.match(access, /`\/accounts\/apikeys\/\$\{encodeURIComponent\(id\)\}\/`/)
assert.doesNotMatch(panel, /from '\.\.\/\.\.\/api'/, 'the panel does not import the transport')
assert.doesNotMatch(panel, /window\.confirm|\bprompt\(/, 'no browser confirm or prompt')
assert.match(panel, /useConfirm\(\)/)
assert.match(panel, /createKeyedLatestRequestGate\(\['keys'\]\)/, 'reload has a stale-response guard')
assert.match(panel, /buildUpdatePayload\(input\)/)
assert.doesNotMatch(panel, /notice\.value = [^\n]*\.key\b/, 'a notice never carries a key')
assert.doesNotMatch(panel, /console\.(log|warn|error|info)|\btoast\(/, 'no toast or console line in the panel')

// Write controls sit under the manage gate (AD-12).
const template = panel.slice(panel.indexOf('</script>'))
for (const handler of ['@click="openCreate"', '@click="openEdit(row)"', '@click="removeKey(row)"']) {
  const at = template.indexOf(handler)
  assert.ok(at > 0, `${handler} exists`)
  const gate = template.lastIndexOf('v-if="canManage"', at)
  assert.ok(gate >= 0 && at - gate < 400, `${handler} sits under v-if="canManage"`)
}
const editorAt = template.indexOf('@click="saveEditor"')
assert.ok(editorAt > template.indexOf('v-if="canManage && editor"'), 'save sits in the manage-gated editor')
// Show and Copy need the manage flag too; a list-only role gets a line of text instead.
assert.ok(template.indexOf('v-else-if="!canManage"') < template.indexOf('toggleReveal(row.id)'), 'Show is behind the manage check')
assert.ok(template.indexOf('v-else-if="!canManage"') < template.indexOf('copyKey(row)'), 'Copy is behind the manage check')

// The tab: shown on the strict flag and not otherwise; the panel only mounts while the flag holds.
assert.match(view, /if \(canListApiKeys\(state\.context\)\) items\.push\(\{ id:'api-keys'/)
assert.match(view, /v-else-if="tab === 'api-keys' && canListApiKeys\(state\.context\)"/)

// The page's own check: the one-time dialog and the list never write the key to storage (checked above) and clear with the tab.
assert.match(panel, /oneTime = ref\(null\)/)
assert.match(panel, /onMounted\(async \(\) => \{/)

console.log('api keys page 0.12.100: PASS')
