import assert from 'node:assert/strict'
import fs from 'node:fs'

function jsonResponse(payload, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return {
    ok, status, statusText,
    headers: { get: () => 'application/json' },
    async json() { return payload },
    async text() { return JSON.stringify(payload) },
  }
}

const storage = new Map([['access_token', 'existing-token']])
globalThis.window = {
  _env_: { PROD_URL: 'https://api.example.test' },
  location: { origin: 'https://ui.example.test', replace() {} },
  dispatchEvent() {},
  addEventListener() {},
}
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
}

const calls = []
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options })
  const parsed = new URL(url)
  if (parsed.pathname === '/api/tfd/system/recovery/trust/' && (options.method || 'GET') === 'POST') {
    return jsonResponse({ job_id: 'trust-job-1', status: 'queued' }, { status: 202 })
  }
  if (parsed.pathname === '/api/tfd/system/recovery/trust/' && parsed.searchParams.get('job_id') === 'trust-job-1') {
    return jsonResponse({ job: { job_id: 'trust-job-1', status: 'succeeded', result: { trusted: true } } })
  }
  throw new Error(`unexpected fetch ${url}`)
}

const api = await import('../src/api.js')
const backupState = await import('../src/backup-restore-state.js')
const workflows = await import('../src/my-account-workflows.js')

// D3: the operator-visible validation state includes the exact recovery signer
// identity, trust requirement and signed-at time returned by Core.
const validation = {
  ok: false,
  recovery_signer: {
    key_id: 'source-key',
    public_key_sha256: 'aa'.repeat(32),
    server_name: 'source-rmm',
    installation_id: 'source-installation',
    signed_at: '2026-09-29T10:00:00Z',
    trusted: false,
    trust_required: true,
  },
}
const confirmation = backupState.restoreConfirmationState(validation)
assert.equal(confirmation.review.signerTrustRequired, true)
assert.equal(confirmation.review.signerKeyId, 'source-key')
assert.equal(confirmation.review.signerFingerprint, 'aa'.repeat(32))
assert.equal(confirmation.review.signerSignedAt, '2026-09-29T10:00:00Z')

await api.startRecoverySignerTrust({
  backupRef: 'destination:local:backup.tgz',
  destinationId: 'local',
  signer: validation.recovery_signer,
})
const trustPost = calls.find((row) => new URL(row.url).pathname === '/api/tfd/system/recovery/trust/' && row.options.method === 'POST')
assert.deepEqual(JSON.parse(trustPost.options.body), {
  backup_ref: 'destination:local:backup.tgz',
  destination_id: 'local',
  expected_key_id: 'source-key',
  expected_fingerprint: 'aa'.repeat(32),
  expected_server_name: 'source-rmm',
  expected_installation_id: 'source-installation',
})
const trustPoll = await api.getRecoveryTrustJob('trust-job-1')
assert.equal(trustPoll.job.status, 'succeeded')

const backupView = fs.readFileSync(new URL('../src/views/BackupRestoreView.vue', import.meta.url), 'utf8')
assert.match(backupView, /Signer fingerprint/)
assert.match(backupView, /signerSignedAt/)
assert.match(backupView, /Trust this signer and re-validate/)
assert.match(backupView, /trustRecoverySignerWorkflow/)
assert.match(backupView, /item\.recovery_signer\?\.public_key_sha256/)

// F4: update the existing runtime context in place. Modules already loaded by
// register(ctx) retain ctx.context, so replacing state.context would leave them
// with a stale object. Both the outer context and existing tactical_ui object
// must therefore retain identity while their values change.
const tacticalUi = { agent_dblclick_action: 'editagent', url_action_id: null, can_run_url_actions: true }
const context = { permissions: ['x'], tactical_ui: tacticalUi }
const moduleHeldContext = context
const moduleHeldTacticalUi = tacticalUi
const returned = workflows.applyTacticalUiPreferences(context, { agent_dblclick_action: 'urlaction', url_action_id: 77 })
assert.equal(returned, context)
assert.equal(moduleHeldContext, context)
assert.equal(moduleHeldContext.tactical_ui, moduleHeldTacticalUi)
assert.equal(moduleHeldTacticalUi.agent_dblclick_action, 'urlaction')
assert.equal(moduleHeldTacticalUi.url_action_id, 77)
assert.equal(moduleHeldTacticalUi.can_run_url_actions, true)

const accountView = fs.readFileSync(new URL('../src/views/MyAccountView.vue', import.meta.url), 'utf8')
assert.match(accountView, /applyTacticalUiPreferences\(state\.context, preferences\)/)
assert.doesNotMatch(accountView, /state\.context\s*=\s*applyTacticalUiPreferences/)

console.log('D3/F4 production closure UI 0.12.68: PASS')
