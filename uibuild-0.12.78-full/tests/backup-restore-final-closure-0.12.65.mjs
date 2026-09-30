import assert from 'node:assert/strict'

globalThis.window = { _env_: { PROD_URL: 'https://api.example.test' }, location: { origin: 'https://ui.example.test' }, dispatchEvent() {} }
globalThis.localStorage = { getItem: (key) => key === 'access_token' ? 'token' : null, setItem() {}, removeItem() {} }

const calls = []
function response(payload) {
  return {
    ok: true, status: 200, statusText: 'OK', headers: { get: () => 'application/json' },
    async json() { return payload }, async text() { return JSON.stringify(payload) }, clone() { return this },
  }
}
globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname
  let body = null
  try { body = options.body ? JSON.parse(options.body) : null } catch {}
  calls.push({ path, options, body })
  if (path === '/api/tfd/system/backups/restore/' && options.method === 'POST' && body?.action === 'validate') {
    return response({ job_id: 'validate-job', status: 'queued' })
  }
  if (path === '/api/tfd/system/backups/restore/jobs/validate-job/') {
    return response({ job: {
      job_id: 'validate-job', status: 'succeeded', result: {
        ok: true,
        recovery_signer: {
          installation_id: 'install-old', server_name: 'old-rmm', key_id: 'old-key', public_key_sha256: 'deadbeef',
        },
        version_transition: {
          current_core_version: '1.15.171', restored_core_version: '1.15.83', is_core_downgrade: true,
          notice: 'This restore puts Core back to 1.15.83.',
        },
      },
    } })
  }
  if (path === '/api/tfd/system/backups/restore/' && options.method === 'POST' && body?.action === 'restore') {
    return response({ job_id: 'restore-job', status: 'queued' })
  }
  if (path === '/api/tfd/system/backups/restore/jobs/restore-job/') {
    return response({ job: { job_id: 'restore-job', status: 'succeeded', result: { restored_core_version: '1.15.83' } } })
  }
  throw new Error(`unexpected request ${path}`)
}

const api = await import('../src/api.js')
const workflows = await import('../src/backup-restore-workflows.js')
const stateModel = await import('../src/backup-restore-state.js')
const pollJob = async (jobId) => (await api.getBackupRestoreJob(jobId)).job

// D2/D3: validate the selected recovery bundle through the production API/workflow.
const validationResult = await workflows.validateRestoreWorkflow({
  backupRef: 'destination:local:old.tgz', destinationId: 'local', restoreMode: 'full',
}, { startRestoreValidation: api.startRestoreValidation, pollJob })
assert.equal(validationResult.validationJobId, 'validate-job')
const confirmation = stateModel.restoreConfirmationState(validationResult.validation)
assert.equal(confirmation.ready, true)
assert.equal(confirmation.review.sourceServerName, 'old-rmm')
assert.equal(confirmation.review.installationId, 'install-old')
assert.equal(confirmation.review.signerKeyId, 'old-key')
assert.equal(confirmation.review.signerFingerprint, 'deadbeef')
assert.equal(confirmation.review.downgradeHeadline, 'This puts Core back to 1.15.83.')
assert.equal(confirmation.review.transitionLabel, 'Core 1.15.171 → 1.15.83')
assert.equal(stateModel.canStartRestore({
  confirmationState: confirmation,
  selectedBackup: { backup_ref: 'destination:local:old.tgz' },
  selectedDestination: { id: 'local' },
  busy: false,
  validationJobId: validationResult.validationJobId,
}), true)

// The restore request must carry the exact validation job that produced the
// visible source identity/version transition.
const restoreResult = await workflows.startRestoreWorkflow({
  backupRef: 'destination:local:old.tgz', destinationId: 'local', restoreMode: 'full', validationJobId: validationResult.validationJobId,
}, { startServerRestore: api.startServerRestore, pollJob })
assert.equal(restoreResult.job.status, 'succeeded')
const restoreCall = calls.find((row) => row.path === '/api/tfd/system/backups/restore/' && row.body?.action === 'restore')
assert.equal(restoreCall.body.validation_job_id, 'validate-job')
assert.equal(restoreCall.body.confirmed, true)
assert.equal(restoreCall.body.backup_ref, 'destination:local:old.tgz')

console.log('backup restore final D2/D3 closure 0.12.65: PASS')
