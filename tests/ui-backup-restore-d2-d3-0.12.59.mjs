import assert from 'node:assert/strict'
import fs from 'node:fs'
import { restoreConfirmationState } from '../src/backup-restore-state.js'

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

// The SFC consumes the behavioral review model rather than rebuilding identity
// or downgrade copy itself. That keeps the tested state and displayed state one path.
const view = fs.readFileSync(new URL('../src/views/BackupRestoreView.vue', import.meta.url), 'utf8')
assert.match(view, /const review = computed\(\(\) => confirmationState\.value\.review\)/)
assert.match(view, /review\.sourceServerName/)
assert.match(view, /review\.installationId/)
assert.match(view, /review\.signerFingerprint/)
assert.match(view, /review\.downgradeHeadline/)
assert.match(view, /:disabled="!canRestore"/)
assert.match(view, /validationJobId/)

console.log('ui backup restore D2/D3 behavioral review model 0.12.59: PASS')
