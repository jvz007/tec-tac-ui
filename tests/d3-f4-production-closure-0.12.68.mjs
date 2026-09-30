import assert from 'node:assert/strict'
import fs from 'node:fs'

const backupState = await import('../src/backup-restore-state.js')
const workflows = await import('../src/my-account-workflows.js')

// D3/AD-3: restore state is provenance + archive integrity, with no signer-trust action.
const validation = {
  ok: true,
  source_identity: { installation_id: 'source-installation', server_name: 'source-rmm', created_at: '2026-09-29T10:00:00Z', core_version: '1.15.83' },
  archive_verification: { status: 'verified', sha256: 'aa'.repeat(32) },
}
const confirmation = backupState.restoreConfirmationState(validation)
assert.equal(confirmation.review.sourceServerName, 'source-rmm')
assert.equal(confirmation.review.installationId, 'source-installation')
assert.equal(confirmation.review.createdAt, '2026-09-29T10:00:00Z')
assert.equal(confirmation.review.sourceCoreVersion, '1.15.83')
assert.equal(confirmation.review.integrityVerified, true)

const backupView = fs.readFileSync(new URL('../src/views/BackupRestoreView.vue', import.meta.url), 'utf8')
assert.match(backupView, /Archive SHA-256 verified/)
assert.match(backupView, /Archive not externally verified/)
assert.match(backupView, /item\.core_version/)
assert.match(backupView, /item\.installation_id/)
assert.doesNotMatch(backupView, /Signer fingerprint|Trust this signer|trustRecoverySignerWorkflow/)

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
