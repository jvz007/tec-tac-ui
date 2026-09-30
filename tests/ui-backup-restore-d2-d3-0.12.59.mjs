import assert from 'node:assert/strict'
import { restoreConfirmationState, restoreReviewRows, canStartRestore } from '../src/backup-restore-state.js'

const validated = restoreConfirmationState({
  ok: true,
  source_identity: { installation_id: 'install-old', server_name: 'old-rmm', created_at: '2026-09-29T10:00:00Z', core_version: '1.15.83' },
  archive_verification: { status: 'not_verified', reason: 'sha256 companion missing' },
  version_transition: {
    current_core_version: '1.15.188', restored_core_version: '1.15.83', is_core_downgrade: true,
    notice: 'Restoring this bundle downgrades Tec-Tac Core from 1.15.188 to 1.15.83.',
  },
})
assert.equal(validated.ready, true)
assert.equal(validated.review.sourceServerName, 'old-rmm')
assert.equal(validated.review.installationId, 'install-old')
assert.equal(validated.review.createdAt, '2026-09-29T10:00:00Z')
assert.equal(validated.review.sourceCoreVersion, '1.15.83')
assert.equal(validated.review.integrityNotVerified, true)
assert.equal(validated.review.downgradeHeadline, 'This puts Core back to 1.15.83.')
assert.equal(validated.review.transitionLabel, 'Core 1.15.188 → 1.15.83')

const rows = restoreReviewRows(validated)
assert.deepEqual(rows.map((row) => [row.id, row.value]), [
  ['server_name', 'old-rmm'],
  ['installation_id', 'install-old'],
  ['created_at', '2026-09-29T10:00:00Z'],
  ['core_version', '1.15.83'],
  ['integrity', 'Not verified'],
])
assert.equal(canStartRestore({ confirmationState: validated, selectedBackup: { backup_ref: 'b1' }, selectedDestination: { id: 'd1' }, busy: false, validationJobId: 'job-1' }), true)
assert.equal(canStartRestore({ confirmationState: validated, selectedBackup: { backup_ref: 'b1' }, selectedDestination: { id: 'd1' }, busy: false, validationJobId: '' }), false)
assert.equal(canStartRestore({ confirmationState: restoreConfirmationState({ ok: false }), selectedBackup: { backup_ref: 'b1' }, selectedDestination: { id: 'd1' }, busy: false, validationJobId: 'job-1' }), false)

console.log('ui backup restore D2/D3 behavioral review model 0.12.59: PASS')
