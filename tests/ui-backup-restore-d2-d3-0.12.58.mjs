import assert from 'node:assert/strict'
import fs from 'node:fs'
import { restoreConfirmationState } from '../src/backup-restore-state.js'

const normal = restoreConfirmationState({
  ok: true,
  recovery_signer: { installation_id: 'install-a', server_name: 'source-rmm', key_id: 'recovery-a', public_key_sha256: 'abc123' },
  version_transition: { current_core_version: '1.15.162', restored_core_version: '1.15.161', is_core_downgrade: false },
})
assert.equal(normal.ready, true)
assert.equal(normal.signer.installation_id, 'install-a')
assert.equal(normal.signer.server_name, 'source-rmm')
assert.equal(normal.signer.public_key_sha256, 'abc123')
assert.equal(normal.downgradeNotice, '')

const downgrade = restoreConfirmationState({
  ok: true,
  recovery_signer: { installation_id: 'install-old', server_name: 'old-rmm', key_id: 'old-key', public_key_sha256: 'deadbeef' },
  version_transition: { current_core_version: '1.15.162', restored_core_version: '1.15.83', is_core_downgrade: true, notice: 'Restoring this bundle downgrades Tec-Tac Core from 1.15.162 to 1.15.83.' },
})
assert.equal(downgrade.ready, true)
assert.equal(downgrade.downgrade, true)
assert.equal(downgrade.restoredVersion, '1.15.83')
assert.match(downgrade.downgradeNotice, /1\.15\.83/)

assert.equal(restoreConfirmationState({ ok: false }).ready, false)
assert.equal(restoreConfirmationState(null).ready, false)

const view = fs.readFileSync(new URL('../src/views/BackupRestoreView.vue', import.meta.url), 'utf8')
assert.match(view, /restoreConfirmationState/)
assert.match(view, /This puts Core back to/)
assert.match(view, /installation_id/)
assert.match(view, /public_key_sha256/)
assert.match(view, /:disabled="!canRestore"/)
assert.match(view, /startRestoreValidation/)
assert.match(view, /startServerRestore/)
assert.match(view, /validationJobId/)
assert.match(view, /validation_job_id|validationJobId/)

const nav = fs.readFileSync(new URL('../src/core-navigation.js', import.meta.url), 'utf8')
assert.match(nav, /Backup & Restore/)
assert.match(nav, /to: '\/system\/backups'/)
assert.match(nav, /visible: superuser/)

console.log('ui backup restore D2/D3 0.12.58: PASS')
