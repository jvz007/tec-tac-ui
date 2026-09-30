import assert from 'node:assert/strict'
import fs from 'node:fs'
import { restoreConfirmationState } from '../src/backup-restore-state.js'

const normal = restoreConfirmationState({
  ok: true,
  source_identity: { installation_id: 'install-a', server_name: 'source-rmm', created_at: '2026-09-30T05:00:00Z', core_version: '1.15.188' },
  archive_verification: { status: 'verified', sha256: 'ab'.repeat(32) },
  version_transition: { current_core_version: '1.15.188', restored_core_version: '1.15.188', is_core_downgrade: false },
})
assert.equal(normal.ready, true)
assert.equal(normal.review.installationId, 'install-a')
assert.equal(normal.review.sourceServerName, 'source-rmm')
assert.equal(normal.review.sourceCoreVersion, '1.15.188')
assert.equal(normal.review.integrityVerified, true)
assert.equal(normal.review.integrityLabel, 'SHA-256 verified')
assert.equal(normal.downgradeNotice, '')

const downgrade = restoreConfirmationState({
  ok: true,
  source_identity: { installation_id: 'install-old', server_name: 'old-rmm', created_at: '2026-09-29T10:00:00Z', core_version: '1.15.83' },
  archive_verification: { status: 'not_verified', reason: 'sha256 companion missing' },
  version_transition: { current_core_version: '1.15.188', restored_core_version: '1.15.83', is_core_downgrade: true, notice: 'Restoring this bundle downgrades Tec-Tac Core from 1.15.188 to 1.15.83.' },
})
assert.equal(downgrade.ready, true)
assert.equal(downgrade.downgrade, true)
assert.equal(downgrade.restoredVersion, '1.15.83')
assert.equal(downgrade.review.integrityNotVerified, true)
assert.match(downgrade.downgradeNotice, /1\.15\.83/)

assert.equal(restoreConfirmationState({ ok: false }).ready, false)
assert.equal(restoreConfirmationState(null).ready, false)

const view = fs.readFileSync(new URL('../src/views/BackupRestoreView.vue', import.meta.url), 'utf8')
assert.match(view, /restoreConfirmationState/)
assert.match(view, /review\.downgradeHeadline/)
assert.match(view, /review\.installationId/)
assert.match(view, /review\.integrityLabel/)
assert.doesNotMatch(view, /Trust this signer|Signer fingerprint|trustRecoverySignerWorkflow/)
assert.match(view, /:disabled="!canRestore"/)
assert.match(view, /startRestoreValidation/)
assert.match(view, /startServerRestore/)
assert.match(view, /validationJobId/)

const nav = fs.readFileSync(new URL('../src/core-navigation.js', import.meta.url), 'utf8')
assert.match(nav, /Backup & Restore/)
assert.match(nav, /to: '\/system\/backups'/)
assert.match(nav, /visible: superuser/)

console.log('ui backup restore D2/D3 0.12.58: PASS')
