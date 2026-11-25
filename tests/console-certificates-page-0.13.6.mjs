// 0.13.6: the Console certificates page, its route, menu entry, CA panel and Roles group (Core 1.18.52).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  CANCEL_ENROLMENT_DETAIL,
  REPLACE_CA_DETAIL,
  REVOKE_DETAIL,
  REVOKE_REASONS,
  canManageConsoleCertificates,
  canReplaceConsoleCa,
  canViewConsoleCertificates,
  cancelConsoleEnrolment,
  getConsoleCa,
  issueConsoleEnrolment,
  listConsoleCertificates,
  listQuery,
  normalizeCertificateList,
  replaceConsoleCa,
  revokeConsoleCertificate,
} from '../src/console-certificates.js'
import { coreNavigation } from '../src/core-navigation.js'
import { createKeyedLatestRequestGate } from '../src/latest-request-gate.js'

const src = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
const view = src('views/ConsoleCertificatesView.vue')
const ca = src('components/ConsoleCertificateCaPanel.vue')
const revoke = src('components/ConsoleCertificateRevoke.vue')
const router = src('router.js')

// Route.
assert.match(router, /path: '\/access\/console-certificates', name: 'console-certificates', component: ConsoleCertificatesView, meta: \{ title: 'Console certificates' \}/)
assert.doesNotMatch(src('views/AccessView.vue'), /console/i, 'not a tab in AccessView')

// Menu entry: hidden for a plain user, shown for view, manage and superuser.
const entry = (context) => coreNavigation(context).find((item) => item.label === 'Console certificates')
assert.equal(entry({ user: {}, permissions: [] }).visible, false)
assert.equal(entry({ user: {}, permissions: ['core.console_certificates.view'] }).visible, true)
assert.equal(entry({ user: {}, permissions: ['core.console_certificates.manage'] }).visible, true)
assert.equal(entry({ user: { superuser: true }, permissions: [] }).visible, true)
assert.equal(entry({ user: {}, permissions: [] }).to, '/access/console-certificates')
assert.equal(entry({ user: {}, permissions: [] }).section, 'Administration')

// Rights.
assert.equal(canViewConsoleCertificates({ user: {}, permissions: [] }), false)
assert.equal(canManageConsoleCertificates({ user: {}, permissions: ['core.console_certificates.view'] }), false)
assert.equal(canManageConsoleCertificates({ user: {}, permissions: ['core.console_certificates.manage'] }), true)
assert.equal(canReplaceConsoleCa({ user: { superuser: true } }), true)
assert.equal(canReplaceConsoleCa({ user: {}, permissions: ['core.console_certificates.manage'] }), false, 'Replace is for a superuser only')
assert.equal(canReplaceConsoleCa({ user: { superuser: 'yes' } }), false)
assert.match(ca, /v-if="canReplace && ca\.exists"/)
assert.match(ca, /canReplaceConsoleCa\(state\.context\)/)
assert.match(view, /<form v-if="canManage"/, 'Issue only for manage')
assert.match(view, /<td v-if="canManage" class="row-actions"><button[^>]*cancelEnrolment/, 'Cancel only for manage')
assert.match(view, /<ConsoleCertificateCaPanel v-if="canViewAll"/, 'CA panel only for view or manage')
assert.match(view, /if \(canManage\.value \|\| !canViewAll\.value\) return true/, 'Revoke on others for manage; own rows keep Revoke')
assert.doesNotMatch(view, /Permission denied/, 'a person without a permission still sees their own rows')

// Reasons and confirms: Yes/No, nothing typed.
assert.deepEqual(REVOKE_REASONS.map((r) => r.value), ['lost', 'left', 'admin', 'other'])
for (const [name, text] of [['revoke', revoke], ['cancel', view], ['replace', ca]]) {
  assert.match(text, /useConfirm\(\)/, `${name} uses useConfirm`)
  assert.match(text, /yesLabel: 'Yes', noLabel: 'No'/, `${name} is a Yes/No dialog`)
  assert.doesNotMatch(text, /v-model="(typed|confirmText|confirmation)/i, `${name} asks for no typing`)
}
assert.doesNotMatch(ca, /<input/, 'the CA panel has no input')
assert.doesNotMatch(revoke, /<input/, 'the revoke step has no input')
for (const detail of [REVOKE_DETAIL, REPLACE_CA_DETAIL]) assert.match(detail, /does not end a session that is already open/)
assert.match(REPLACE_CA_DETAIL, /every active certificate is revoked/i)
assert.match(REPLACE_CA_DETAIL, /every open enrolment is cancelled/i)
assert.match(REPLACE_CA_DETAIL, /server id changes/i)
assert.match(REPLACE_CA_DETAIL, /allowed again and enrol again/)
for (const text of [REVOKE_DETAIL, REPLACE_CA_DETAIL, CANCEL_ENROLMENT_DETAIL, view, ca, revoke]) {
  assert.doesNotMatch(text, /ends? (the|your|every|all)[^.]{0,20}(tunnel|session)|closes? the tunnel|stops? the tunnel/i, 'no promise that a tunnel ends')
}

// Exact requests.
const calls = []
const api = async (path, options = {}) => {
  calls.push({ path, method: options.method || 'GET', body: options.body })
  if (options.method === 'POST' || path.endsWith('/ca/')) return { exists: true }
  return { count: 1, page: 2, page_size: 50, results: [{ serial: 's'.repeat(32), state: 'revoked' }], enrolments: [{ id: 'e1', username: 'x' }] }
}
await listConsoleCertificates({ engineer: '7', state: 'active', page: 2 }, { api })
await issueConsoleEnrolment(7, { api })
await cancelConsoleEnrolment('e1', { api })
await revokeConsoleCertificate('d'.repeat(32), 'admin', { api })
await getConsoleCa({ api })
await replaceConsoleCa({ api })
assert.deepEqual(calls, [
  { path: '/api/tfd/console-certificates/?engineer=7&state=active&page=2&page_size=50', method: 'GET', body: undefined },
  { path: '/api/tfd/console-certificates/issue/', method: 'POST', body: JSON.stringify({ user_id: 7 }) },
  { path: '/api/tfd/console-certificates/enrolments/e1/cancel/', method: 'POST', body: undefined },
  { path: `/api/tfd/console-certificates/${'d'.repeat(32)}/revoke/`, method: 'POST', body: JSON.stringify({ reason: 'admin' }) },
  { path: '/api/tfd/console-certificates/ca/', method: 'GET', body: undefined },
  { path: '/api/tfd/console-certificates/ca/replace/', method: 'POST', body: JSON.stringify({ confirm: true }) },
])
await assert.rejects(() => issueConsoleEnrolment('7', { api }), /engineer/i)
assert.equal(listQuery({}), '?page=1&page_size=50')
assert.equal(listQuery({ engineer: 'abc', state: 'bogus', page: -4, pageSize: 9999 }), '?page=1&page_size=100', 'bad values are not sent')
assert.equal(normalizeCertificateList({ count: 3, results: [{ serial: 'a' }, null], enrolments: [{ id: 5 }] }).enrolments[0].id, '5')

// A stale list answer is dropped: the view only applies an answer while its request is current.
const gate = createKeyedLatestRequestGate(['list'])
const first = gate.begin('list')
const second = gate.begin('list')
assert.equal(gate.isCurrent('list', first), false)
assert.equal(gate.isCurrent('list', second), true)
assert.match(view, /gate\.begin\('list'\)/)
const loadBody = (view.match(/async function load\(\) \{[\s\S]*?\n\}\n/) || [''])[0]
assert.match(loadBody, /if \(!gate\.isCurrent\('list', request\)\) return/)

// A refusal from Core is shown as sent.
assert.match(view, /consoleCertificateError\(err/)

// Storage.
for (const text of [view, ca]) assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB/)

// Help article.
assert.match(src('help/core-articles.js'), /core\.console-certificates/)
const article = src('help/articles/console-certificates.md')
assert.match(article, /certificate authority\*\* \(CA\)/, 'CA is defined on first use')
assert.match(article, /does not end a session that is already open/)

// The Roles editor renders any group Core serves; the label function is unchanged and handles the new codes.
const roles = src('components/access/RolesPanel.vue')
const start = roles.indexOf('function extensionPermissionLabel(')
const label = new Function(`${roles.slice(start, roles.indexOf('\n}\n', start) + 3)}\nreturn extensionPermissionLabel`)()
assert.equal(label('core.console_certificates.view', 'core', ['Console certificates']), 'console certificates view — core')
assert.equal(label('core.console_certificates.manage', 'core', ['Console certificates']), 'console certificates manage — core')
assert.match(roles, /for \(const group of ext\.groups \|\| \[\]\)/, 'groups come from the catalog Core serves')
assert.doesNotMatch(roles, /console_certificates|Console certificates/, 'RolesPanel has no special case')
console.log('console-certificates-page-0.13.6: PASS')
