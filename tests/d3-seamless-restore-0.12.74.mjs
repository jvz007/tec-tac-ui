import assert from 'node:assert/strict'
import fs from 'node:fs'
import { restoreConfirmationState } from '../src/backup-restore-state.js'
import { trustRecoverySignerWorkflow } from '../src/backup-restore-trust-workflow.js'

const signer = {
  key_id: 'source-key',
  public_key_sha256: 'ab'.repeat(32),
  server_name: 'source-rmm',
  installation_id: 'source-installation',
  signed_at: '2026-09-29T10:00:00Z',
  trusted: false,
  trust_required: true,
}
const state = restoreConfirmationState({ ok: false, recovery_signer: signer })
assert.equal(state.review.signerTrustRequired, true)
assert.equal(state.review.signerFingerprint, signer.public_key_sha256)
assert.equal(state.review.signerSignedAt, signer.signed_at)

const events = []
const result = await trustRecoverySignerWorkflow({
  backupRef: 'destination:local:backup.tgz', destinationId: 'local', signer,
}, {
  confirmTrust: ({ keyId, fingerprint }) => {
    events.push(['confirm', keyId, fingerprint]); return true
  },
  startRecoverySignerTrust: async (payload) => {
    events.push(['start', payload]); return { job_id: 'job-1' }
  },
  pollTrustJob: async (jobId) => {
    events.push(['poll', jobId]); return { status: 'succeeded' }
  },
  revalidate: async () => { events.push(['revalidate']) },
})
assert.equal(result.cancelled, false)
assert.deepEqual(events[0], ['confirm', 'source-key', signer.public_key_sha256])
assert.deepEqual(events[1][1], { backupRef:'destination:local:backup.tgz', destinationId:'local', signer })
assert.deepEqual(events.at(-1), ['revalidate'])

let revalidated = false
await assert.rejects(() => trustRecoverySignerWorkflow({ backupRef:'x', destinationId:'local', signer }, {
  confirmTrust: () => true,
  startRecoverySignerTrust: async () => ({ job_id:'job-2' }),
  pollTrustJob: async () => ({ status:'failed', error:'fingerprint changed since confirmation' }),
  revalidate: async () => { revalidated = true },
}), /fingerprint changed since confirmation/)
assert.equal(revalidated, false)

const view = fs.readFileSync(new URL('../src/views/BackupRestoreView.vue', import.meta.url), 'utf8')
assert.match(view, /Signer fingerprint/)
assert.match(view, /Signed \{\{ fmtDate\(review\.signerSignedAt\) \}\}/)
assert.match(view, /trustRecoverySignerWorkflow/)
console.log('D3 seamless restore UI workflow 0.12.74: PASS')
