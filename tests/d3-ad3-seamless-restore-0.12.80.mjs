import assert from 'node:assert/strict'
import fs from 'node:fs'
import { restoreConfirmationState, restoreReviewRows, canStartRestore } from '../src/backup-restore-state.js'

const verified = restoreConfirmationState({
  ok: true,
  source_identity: { installation_id:'i-123', server_name:'tec-tac-a', created_at:'2026-09-30T05:45:00Z', core_version:'1.15.188' },
  archive_verification: { status:'verified', sha256:'12'.repeat(32) },
  version_transition: { current_core_version:'1.15.188', restored_core_version:'1.15.188', is_core_downgrade:false },
})
assert.equal(verified.ready, true)
assert.equal(verified.review.integrityLabel, 'SHA-256 verified')
assert.deepEqual(restoreReviewRows(verified).map(x => x.id), ['server_name','installation_id','created_at','core_version','integrity'])
assert.equal(canStartRestore({ confirmationState:verified, selectedBackup:{backup_ref:'b'}, selectedDestination:{id:'d'}, busy:false, validationJobId:'v' }), true)

const noHash = restoreConfirmationState({
  ok: true,
  source_identity: { installation_id:'old-i', server_name:'old-rmm', created_at:'2026-09-27T09:00:00Z', core_version:'1.15.87' },
  archive_verification: { status:'not_verified', reason:'sha256 companion missing' },
})
assert.equal(noHash.ready, true, 'missing companion must not block restore under AD-3')
assert.equal(noHash.review.integrityNotVerified, true)

const view = fs.readFileSync(new URL('../src/views/BackupRestoreView.vue', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8')
assert.match(view, /item\.server_name/)
assert.match(view, /item\.installation_id/)
assert.match(view, /item\.core_version/)
assert.match(view, /item\.created_at/)
assert.match(view, /Archive SHA-256 verified/)
assert.match(view, /Archive not externally verified/)
assert.doesNotMatch(view, /recovery signer|Signer fingerprint|trustRecoverySignerWorkflow/i)
assert.doesNotMatch(api, /system\/recovery\/trust/)
console.log('D3 AD-3 seamless restore 0.12.80: PASS')
