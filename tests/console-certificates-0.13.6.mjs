// 0.13.6: the My Account Engineer Console card (Core 1.18.52). Helpers, card source and the calls it makes.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  NO_CERTIFICATE_TEXT,
  REVOKE_DETAIL,
  REVOKE_REASON_VALUES,
  cardState,
  consoleCertificateError,
  enrolLink,
  getMyConsoleCertificates,
  normalizeMine,
  requestEnrolmentCode,
  revokeConsoleCertificate,
} from '../src/console-certificates.js'

const src = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
const card = src('components/ConsoleCertificatesCard.vue')
const revoke = src('components/ConsoleCertificateRevoke.vue')
const account = src('views/MyAccountView.vue')

// The link: built for a valid host and a 43 character code only.
const code = 'A'.repeat(20) + 'b_-' + '9'.repeat(20)
assert.equal(code.length, 43)
assert.equal(enrolLink('core.example.co.za', code), `tectac-console://enrol?host=core.example.co.za&code=${code}`)
assert.equal(enrolLink('core.example.co.za', code.slice(1)), '', 'a short code gets no link')
assert.equal(enrolLink('core.example.co.za', `${code}x`), '', 'a long code gets no link')
assert.equal(enrolLink('core.example.co.za', `${code.slice(0, 42)}&`), '', 'a code with & gets no link')
assert.equal(enrolLink('core.example.co.za', `${code.slice(0, 42)} `), '', 'a code with a space gets no link')
for (const host of ['', 'a b.example', 'x.example&evil=1', 'x.example:8443', 'x.example/path', null, 'bad..host', '-x.example']) assert.equal(enrolLink(host, code), '', `no link for host ${JSON.stringify(host)}`)

// State mapping.
const cert = (over = {}) => ({ serial: 'a'.repeat(32), short_serial: 'aaaaaaaa', pc_label: 'PC', state: 'active', expiring: false, ...over })
assert.equal(cardState(null), 'none')
assert.equal(cardState(normalizeMine({ certificates: [], enrolment: null })), 'none')
assert.equal(cardState(normalizeMine({ certificates: [], enrolment: { id: 'e1' } })), 'open')
assert.equal(cardState(normalizeMine({ certificates: [cert()], enrolment: null })), 'active')
assert.equal(cardState(normalizeMine({ certificates: [cert({ expiring: true })], enrolment: null })), 'expiring')
assert.equal(cardState(normalizeMine({ certificates: [cert({ state: 'revoked' }), cert({ serial: 'b'.repeat(32), state: 'expired' })], enrolment: null })), 'ended')
assert.equal(normalizeMine({ certificates: [cert()] }).certificates[0].short_serial, 'aaaaaaaa')

// 409 enrolment_required reads as the administrator message; other text is Core's as sent.
assert.equal(consoleCertificateError(Object.assign(new Error('x'), { status: 409, code: 'enrolment_required' })), NO_CERTIFICATE_TEXT)
assert.equal(NO_CERTIFICATE_TEXT, 'Ask your administrator to issue you a Console certificate.')
assert.equal(consoleCertificateError(Object.assign(new Error('Too many codes.'), { status: 429 })), 'Too many codes.')
assert.equal(consoleCertificateError(Object.assign(new Error('The master key is not available.'), { status: 503, code: 'master_key_unavailable' })), 'The master key is not available.')

// The exact calls.
const calls = []
const api = async (path, options = {}) => {
  calls.push({ path, method: options.method || 'GET', body: options.body })
  if (path.endsWith('/mine/')) return { certificates: [], enrolment: null, host: 'h.example', server_id: null, validity_days: 365 }
  return {}
}
await getMyConsoleCertificates({ api })
await requestEnrolmentCode({ api })
await revokeConsoleCertificate('c'.repeat(32), 'lost', { api })
assert.deepEqual(calls, [
  { path: '/api/tfd/console-certificates/mine/', method: 'GET', body: undefined },
  { path: '/api/tfd/console-certificates/mine/enrolment-code/', method: 'POST', body: undefined },
  { path: `/api/tfd/console-certificates/${'c'.repeat(32)}/revoke/`, method: 'POST', body: JSON.stringify({ reason: 'lost' }) },
])
assert.equal(await getMyConsoleCertificates({ api: async () => { throw Object.assign(new Error('nf'), { status: 404 }) } }), null, 'older Core: the card is left out')
await assert.rejects(() => getMyConsoleCertificates({ api: async () => { throw Object.assign(new Error('boom'), { status: 500 }) } }))
await assert.rejects(() => revokeConsoleCertificate('c'.repeat(32), 'because', { api }), /reason/i)
assert.deepEqual(REVOKE_REASON_VALUES, ['lost', 'left', 'admin', 'other'])

// Card source: no browser storage, no code in the router or the shell state, cleared on expiry and unmount.
for (const text of [card, revoke, src('console-certificates.js')]) {
  assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB/, 'no browser storage')
  assert.doesNotMatch(text, /Authorization|headers\s*:/, 'no hand-built headers')
  assert.doesNotMatch(text, /\bfetch\(/, 'every call goes through api()')
}
assert.doesNotMatch(card, /router\.(push|replace)|\$router|useRouter|state\.context|console\.(log|info|warn|error)/, 'the code never reaches the router, the shell state or a log')
assert.match(card, /onBeforeUnmount\(clearCode\)/, 'cleared on unmount')
assert.match(card, /secondsLeft\.value <= 0\) clearCode\(\)/, 'cleared when the countdown ends')
assert.match(card, /async function enrol\(\) \{[\s\S]{0,120}clearCode\(\)/, 'cleared on a new request')
assert.match(card, /status === 409\) await load\(\)|err\?\.status === 409/, '409 re-reads mine/')
assert.match(card, /copyTextWithFeedback\(link\.value/, 'Copy enrol link copies the whole link (0.13.7)')
assert.match(card, /Manage my certificates/)
assert.match(card, /Enrol this PC/)
// No issue control and no revoke for others on the card: the only revoke is on the person's own rows.
assert.doesNotMatch(card, /issueConsoleEnrolment|cancelConsoleEnrolment|replaceConsoleCa|Allow to enrol/)
// Revoke: a reason, then the plain Yes/No dialog, then the call with {reason}.
assert.match(card, /ConsoleCertificateRevoke/)
assert.match(revoke, /useConfirm\(\)/)
assert.match(revoke, /yesLabel: 'Yes', noLabel: 'No'/)
assert.doesNotMatch(revoke, /<input|v-model="typed|type="text"/, 'nothing is typed')
assert.match(revoke, /revokeConsoleCertificate\(props\.serial, reason\.value\)/)
assert.match(REVOKE_DETAIL, /does not end a session that is already open/)
for (const text of [card, revoke, REVOKE_DETAIL]) assert.doesNotMatch(text, /ends? (the|your|every|all)[^.]{0,20}(tunnel|session)|closes? the tunnel|stops? the tunnel/i, 'no promise that a revoke ends a tunnel')
// Mounted after the Tactical UI card.
assert.ok(account.indexOf('<ConsoleCertificatesCard />') > account.indexOf('<TacticalUiPreferencesCard'), 'the card follows the Tactical UI card')
console.log('console-certificates-0.13.6: PASS')
