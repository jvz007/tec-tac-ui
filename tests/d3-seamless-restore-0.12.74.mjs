import assert from 'node:assert/strict'
import fs from 'node:fs'
import { restoreConfirmationState } from '../src/backup-restore-state.js'

const verified = restoreConfirmationState({
  ok: true,
  source_identity: { installation_id:'source-installation', server_name:'source-rmm', created_at:'2026-09-29T10:00:00Z', core_version:'1.15.83' },
  archive_verification: { status:'verified', sha256:'ab'.repeat(32) },
})
assert.equal(verified.review.integrityVerified, true)
assert.equal(verified.review.integrityLabel, 'SHA-256 verified')

const legacy = restoreConfirmationState({
  ok: true,
  source_identity: { installation_id:'source-installation', server_name:'source-rmm', created_at:'2026-09-29T10:00:00Z', core_version:'1.15.83' },
  archive_verification: { status:'not_verified', reason:'sha256 companion missing' },
})
assert.equal(legacy.ready, true)
assert.equal(legacy.review.integrityNotVerified, true)
assert.equal(legacy.review.integrityLabel, 'Not verified')

const view = fs.readFileSync(new URL('../src/views/BackupRestoreView.vue', import.meta.url), 'utf8')
assert.match(view, /Archive SHA-256 verified/)
assert.match(view, /older backup has no adjacent SHA-256 companion/)
assert.doesNotMatch(view, /Trust this signer|Signer fingerprint|trustRecoverySignerWorkflow/)
console.log('D3 seamless restore UI workflow 0.12.74: PASS')
