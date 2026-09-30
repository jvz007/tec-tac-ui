import assert from 'node:assert/strict'
import { restoreConfirmationState, restoreReviewRows, canStartRestore } from '../src/backup-restore-state.js'

const validated = restoreConfirmationState({
  ok: true,
  recovery_signer: {
    installation_id: 'install-old',
    server_name: 'old-rmm',
    key_id: 'old-key',
    public_key_sha256: 'deadbeef',
  },
  version_transition: {
    current_core_version: '1.15.164',
    restored_core_version: '1.15.83',
    is_core_downgrade: true,
    notice: 'Restoring this bundle downgrades Tec-Tac Core from 1.15.164 to 1.15.83.',
  },
})

assert.equal(validated.ready, true)
assert.equal(validated.review.sourceServerName, 'old-rmm')
assert.equal(validated.review.installationId, 'install-old')
assert.equal(validated.review.signerKeyId, 'old-key')
assert.equal(validated.review.signerFingerprint, 'deadbeef')
assert.equal(validated.review.downgradeHeadline, 'This puts Core back to 1.15.83.')
assert.equal(validated.review.transitionLabel, 'Core 1.15.164 → 1.15.83')
assert.match(validated.downgradeNotice, /1\.15\.83/)

const notReady = restoreConfirmationState({ ok: false })
assert.equal(notReady.ready, false)
assert.equal(notReady.review.downgradeHeadline, '')

const rows = restoreReviewRows(validated)
assert.deepEqual(rows.map((row) => [row.id, row.value]), [
  ['server_name', 'old-rmm'],
  ['installation_id', 'install-old'],
  ['signer_key', 'old-key'],
  ['signer_fingerprint', 'deadbeef'],
])
assert.equal(canStartRestore({ confirmationState: validated, selectedBackup: { backup_ref: 'b1' }, selectedDestination: { id: 'd1' }, busy: false, validationJobId: 'job-1' }), true)
assert.equal(canStartRestore({ confirmationState: validated, selectedBackup: { backup_ref: 'b1' }, selectedDestination: { id: 'd1' }, busy: false, validationJobId: '' }), false)
assert.equal(canStartRestore({ confirmationState: notReady, selectedBackup: { backup_ref: 'b1' }, selectedDestination: { id: 'd1' }, busy: false, validationJobId: 'job-1' }), false)

console.log('ui backup restore D2/D3 behavioral review model 0.12.59: PASS')
