// 0.12.100 (Core 1.17.28): the SSO admin page and Disconnect SSO account. Superuser is the only gate for a change (AD-12); the
// payloads always carry server_url and role; [REDACTED] is never sent back as a secret; the lock-out sentence shows only for a
// 409 with sso_lockout_guard; a block that turns on goes through the Yes or No dialog; the sign-in routes are untouched.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const sso = await import(new URL('../src/sso-admin.js', import.meta.url).href)
const panel = read('../src/components/access/SsoAdminPanel.vue')
const users = read('../src/components/access/UsersPanel.vue')
const access = read('../src/access.js')
const api = read('../src/api.js')
const {
  blockingWarningNeeded, buildProviderPayload, buildSettingsPayload, canAdministerSso, canSeeSso, isRedacted, lockoutDetail, providerFormError,
} = sso

// Who may administer: the effective superuser flag only. A manage_accounts holder who is not a superuser may not.
assert.equal(canAdministerSso({ user: { superuser: true } }), true)
assert.equal(canAdministerSso({ user: { superuser: false }, capabilities: { manage_accounts: true } }), false, 'manage_accounts is not enough')
assert.equal(canAdministerSso({ user: { superuser: 'true' } }), false)
assert.equal(canAdministerSso({ user: {} }), false)
assert.equal(canAdministerSso(null), false)
// The tab shows for can_list_accounts only.
assert.equal(canSeeSso({ capabilities: { list_accounts: true } }), true)
assert.equal(canSeeSso({ capabilities: { list_accounts: 'true' } }), false)
assert.equal(canSeeSso({ capabilities: {}, user: { superuser: true } }), false)

// Provider payloads. Add sends name, secret and both keys; role is null when none is picked.
assert.deepEqual(
  buildProviderPayload({ name: ' Entra ', client_id: ' abc ', secret: 's3cret', server_url: ' https://idp.example ', role: '' }, 'add'),
  { name: 'Entra', client_id: 'abc', secret: 's3cret', server_url: 'https://idp.example', role: null },
)
assert.equal(buildProviderPayload({ name: 'x', client_id: 'a', secret: 's', server_url: 'https://a', role: '4' }, 'add').role, 4)
// Edit never sends name, and never sends the redacted marker or a blank secret as the secret.
const edit = buildProviderPayload({ name: 'Renamed', client_id: 'abc', secret: '[REDACTED]', server_url: 'https://idp', role: null }, 'edit')
assert.deepEqual(edit, { client_id: 'abc', server_url: 'https://idp', role: null })
assert.equal('name' in edit, false)
assert.equal('secret' in edit, false, 'a redacted secret is never sent back')
assert.equal('secret' in buildProviderPayload({ client_id: 'abc', secret: '', server_url: 'https://idp', role: 2 }, 'edit'), false)
assert.deepEqual(buildProviderPayload({ client_id: 'abc', secret: 'new', server_url: 'https://idp', role: 2 }, 'edit'), { client_id: 'abc', server_url: 'https://idp', role: 2, secret: 'new' })
assert.equal(isRedacted('[REDACTED]'), true)
assert.equal(isRedacted('real'), false)

// Form checks before a call.
assert.match(providerFormError({ name: '', client_id: 'a', secret: 's', server_url: 'https://a' }, 'add'), /name/)
assert.match(providerFormError({ name: 'n', client_id: 'a', secret: '[REDACTED]', server_url: 'https://a' }, 'add'), /secret/, 'a redacted secret cannot be added')
assert.match(providerFormError({ name: 'n', client_id: 'a', secret: '', server_url: 'https://a' }, 'add'), /secret/)
assert.match(providerFormError({ client_id: 'a', secret: 's', server_url: 'ftp://a' }, 'edit'), /https/)
assert.equal(providerFormError({ client_id: 'a', secret: '', server_url: 'https://a' }, 'edit'), '', 'an edit may keep the secret')
assert.equal(providerFormError({ name: 'n', client_id: 'a', secret: 's', server_url: 'https://a' }, 'add'), '')

// Settings: both real booleans, strict. A string is not true.
assert.deepEqual(buildSettingsPayload({ sso_enabled: true, block_local_user_logon: false }), { sso_enabled: true, block_local_user_logon: false })
assert.deepEqual(buildSettingsPayload({ sso_enabled: 'true', block_local_user_logon: 1 }), { sso_enabled: false, block_local_user_logon: false })
assert.deepEqual(buildSettingsPayload(undefined), { sso_enabled: false, block_local_user_logon: false })

// The lock-out sentence: only 409 with sso_lockout_guard.
const lockout = Object.assign(new Error('Keep a provider before blocking.'), { status: 409, code: 'sso_lockout_guard', payload: { detail: 'Keep at least one sign-in provider before you block local sign-in.', code: 'sso_lockout_guard' } })
assert.equal(lockoutDetail(lockout), 'Keep at least one sign-in provider before you block local sign-in.')
assert.equal(lockoutDetail(Object.assign(new Error('x'), { status: 409, code: 'other', payload: { detail: 'no' } })), null)
assert.equal(lockoutDetail(Object.assign(new Error('x'), { status: 500, code: 'sso_lockout_guard', payload: { detail: 'no' } })), null)
assert.equal(lockoutDetail(Object.assign(new Error('Licence needed'), { status: 423, payload: 'Licence needed' })), null)
assert.equal(lockoutDetail(new Error('Network down')), null)
assert.equal(lockoutDetail(null), null)

// The Yes or No question: only when a save turns local sign-in blocking on.
assert.equal(blockingWarningNeeded({ block_local_user_logon: false }, { block_local_user_logon: true }), true)
assert.equal(blockingWarningNeeded({ block_local_user_logon: true }, { block_local_user_logon: true }), false)
assert.equal(blockingWarningNeeded({ block_local_user_logon: true }, { block_local_user_logon: false }), false)
assert.equal(blockingWarningNeeded({ block_local_user_logon: false }, { block_local_user_logon: false }), false)

// Calls: Tactical's routes through apiFetch only, with the exact bodies.
assert.match(access, /apiFetch\('\/accounts\/ssoproviders\/'/)
assert.match(access, /`\/accounts\/ssoproviders\/\$\{encodeURIComponent\(id\)\}\/`/)
assert.match(access, /apiFetch\('\/accounts\/ssoproviders\/settings\/'/)
assert.match(access, /apiFetch\('\/accounts\/ssoproviders\/account\/', \{ method: 'DELETE', body: JSON\.stringify\(\{ account, provider \}\) \}\)/)
for (const [name, source] of [['SsoAdminPanel.vue', panel], ['UsersPanel.vue', users], ['sso-admin.js', read('../src/sso-admin.js')]]) {
  assert.doesNotMatch(source, /\bfetch\s*\(/, `${name} calls fetch directly`)
  assert.doesNotMatch(source, /Authorization|localStorage|sessionStorage/, `${name} builds headers or stores data`)
}

// The sign-in routes stay as they are.
assert.match(api, /\/accounts\/ssoproviders\/token\//)

// Gate scan (panel): each change control sits under the superuser gate.
const sfc = (source) => source.slice(source.indexOf('</script>'))
const gated = (source, handler, gate, window = 900) => {
  const at = source.indexOf(handler)
  assert.ok(at > 0, `${handler} exists`)
  const found = source.lastIndexOf(gate, at)
  assert.ok(found >= 0 && at - found < window, `${handler} sits under ${gate}`)
}
const tpl = sfc(panel)
gated(tpl, '@click="openAdd"', 'v-if="isSuperuser"', 200)
gated(tpl, '@click="openEdit(row)"', 'v-if="isSuperuser"', 400)
gated(tpl, '@click="removeProvider(row)"', 'v-if="isSuperuser"', 400)
gated(tpl, '@click="saveSettings"', '<template v-if="isSuperuser">', 900)
gated(tpl, '@click="saveProvider"', 'v-if="isSuperuser && providerDialog"', 4000)
assert.ok(tpl.indexOf('<dl v-else class="kvlist">') > tpl.indexOf('<template v-if="isSuperuser">'), 'non-superusers get the read-only settings')
assert.match(tpl, /v-model="draft\.sso_enabled"/)
// Every superuser-only action also refuses in the script, not only in the template.
for (const fnName of ['saveSettings', 'openAdd', 'openEdit', 'saveProvider', 'removeProvider']) {
  const start = panel.indexOf(`function ${fnName}(`) !== -1 ? panel.indexOf(`function ${fnName}(`) : panel.indexOf(`async function ${fnName}(`)
  assert.ok(start > 0, `${fnName} exists`)
  assert.match(panel.slice(start, start + 260), /isSuperuser\.value/, `${fnName} refuses a non-superuser`)
}
// The secret column prints the server value unchanged.
assert.match(tpl, /\{\{ row\.secret \|\| '—' \}\}/)
assert.doesNotMatch(panel, /row\.secret\.replace|secret = ['"]\[REDACTED\]/)
// No typed confirmation and the warning goes through the shell dialog.
assert.match(panel, /useConfirm\(\)/)
assert.match(panel, /blockingWarningNeeded\(stored\.value, after\)/)
assert.match(panel, /confirmAction\(\{\s*question: 'Block local sign-in for everyone\?'/)
assert.doesNotMatch(panel, /v-model="confirm|type="text"[^>]*confirm/i)
assert.doesNotMatch(panel, /window\.confirm|\bprompt\(/)
// A lock-out sentence stays in the page; the toggles go back to the stored values after every save.
assert.match(panel, /settingsError\.value = errorMessage\(err, 'Unable to save the settings\.'\)/)
assert.match(panel, /finally \{\s*await reloadSettings\(\)/)
assert.match(panel, /lockoutDetail\(err\) \|\| err\?\.message/)

// Disconnect (users): superuser only, a Yes or No confirm, then reload.
const disc = users.indexOf('async function disconnectAccount(')
assert.ok(disc > 0)
assert.match(users.slice(disc, disc + 200), /if \(!isSuperuser\.value \|\| !editing\.value\) return/)
assert.match(users.slice(disc, disc + 900), /confirmAction\(\{ question: `Disconnect the \$\{account\.provider\} sign-in/)
assert.match(users.slice(disc, disc + 1500), /await disconnectSsoAccount\(account\.uid, account\.provider\)/)
assert.match(users.slice(disc, disc + 1500), /await load\(\)/)
gated(users, '@click="disconnectAccount(account)"', '<template v-if="isSuperuser">', 900)
assert.match(users, /social_accounts/)

// The tab and the page mount on can_list_accounts.
const view = read('../src/views/AccessView.vue')
assert.match(view, /if \(canSeeSso\(state\.context\)\) items\.push\(\{ id:'sso'/)
assert.match(view, /v-else-if="tab === 'sso' && canSeeSso\(state\.context\)"/)

// The help article is registered and says what it must.
const help = read('../src/help/core-articles.js')
assert.match(help, /core\.api-keys-sso/)
const article = read('../src/help/articles/api-keys-sso.md')
assert.match(article, /^# API keys and single sign-on/m)
assert.match(article, /Only a Tec-Tac superuser can add, change or delete providers, change the settings or disconnect an account/)

console.log('sso admin page 0.12.100: PASS')
