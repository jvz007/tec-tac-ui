<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  getBackupRestoreDestinations,
  getBackupRestoreJob,
  getRecoveryTrustJob,
  startBackupInventory,
  startRestoreValidation,
  startServerRestore,
  startRecoverySignerTrust,
} from '../api'
import { restoreConfirmationState, restoreReviewRows, canStartRestore } from '../backup-restore-state'
import { validateRestoreWorkflow, startRestoreWorkflow } from '../backup-restore-workflows'

const loading = ref(true)
const busy = ref(false)
const error = ref('')
const destinations = ref([])
const selectedDestinationId = ref('')
const backups = ref([])
const selectedBackupRef = ref('')
const restoreMode = ref('full')
const validation = ref(null)
const validationJobId = ref('')
const activeJob = ref(null)
const confirmRestore = ref(false)
let stopped = false
let pollTimer = null

const selectedBackup = computed(() => backups.value.find((item) => item.backup_ref === selectedBackupRef.value) || null)
const selectedDestination = computed(() => destinations.value.find((item) => item.id === selectedDestinationId.value) || null)
const confirmationState = computed(() => restoreConfirmationState(validation.value))
const versionTransition = computed(() => confirmationState.value.transition)
const reviewRows = computed(() => restoreReviewRows(confirmationState.value))
const canRestore = computed(() => canStartRestore({ confirmationState: confirmationState.value, selectedBackup: selectedBackup.value, selectedDestination: selectedDestination.value, busy: busy.value, validationJobId: validationJobId.value }))
const downgradeNotice = computed(() => confirmationState.value.downgradeNotice)
const review = computed(() => confirmationState.value.review)
const signerNeedsTrust = computed(() => review.value.signerTrustRequired === true)

function fmtBytes(value) {
  let n = Number(value || 0); const units = ['B','KB','MB','GB','TB']; let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}
function fmtDate(value) { return value ? new Date(value).toLocaleString() : '—' }
function clearValidation() { validation.value = null; validationJobId.value = ''; confirmRestore.value = false }
function selectBackup(refValue) { selectedBackupRef.value = refValue; clearValidation() }

async function pollJob(jobId) {
  if (pollTimer) clearTimeout(pollTimer)
  const response = await getBackupRestoreJob(jobId)
  if (stopped) return null
  const job = response?.job || null
  activeJob.value = job
  if (!job || ['succeeded', 'failed', 'dispatch_failed'].includes(job.status)) return job
  return new Promise((resolve, reject) => {
    pollTimer = setTimeout(() => pollJob(jobId).then(resolve, reject), 900)
  })
}

async function pollTrustJob(jobId) {
  if (pollTimer) clearTimeout(pollTimer)
  const response = await getRecoveryTrustJob(jobId)
  if (stopped) return null
  const job = response?.job || null
  activeJob.value = job
  if (!job || ['succeeded', 'failed', 'dispatch_failed'].includes(job.status)) return job
  return new Promise((resolve, reject) => {
    pollTimer = setTimeout(() => pollTrustJob(jobId).then(resolve, reject), 900)
  })
}

async function trustSigner() {
  const signer = confirmationState.value.signer
  if (!selectedBackup.value || !selectedDestination.value || !signerNeedsTrust.value || !signer) return
  const fingerprint = String(signer.public_key_sha256 || '')
  if (!window.confirm(`Trust recovery signer ${signer.key_id || ''} with fingerprint ${fingerprint}?`)) return
  busy.value = true; error.value = ''
  try {
    const queued = await startRecoverySignerTrust({
      backupRef: selectedBackup.value.backup_ref,
      destinationId: selectedDestinationId.value,
      signer,
    })
    const job = await pollTrustJob(queued.job_id)
    if (job?.status !== 'succeeded') throw new Error(job?.error || 'Recovery signer trust failed.')
    await validateSelection()
  } catch (e) { error.value = e.message || 'Unable to trust recovery signer.' }
  finally { busy.value = false }
}

async function loadDestinations() {
  loading.value = true; error.value = ''
  try {
    const response = await getBackupRestoreDestinations()
    destinations.value = response?.destinations || []
    if (!destinations.value.some((item) => item.id === selectedDestinationId.value)) {
      selectedDestinationId.value = destinations.value[0]?.id || ''
    }
  } catch (e) { error.value = e.message || 'Unable to load registered backup destinations.' }
  finally { loading.value = false }
}

async function loadBackups() {
  if (!selectedDestinationId.value) return
  busy.value = true; error.value = ''; backups.value = []; selectedBackupRef.value = ''; clearValidation()
  try {
    const queued = await startBackupInventory([selectedDestinationId.value])
    const job = await pollJob(queued.job_id)
    if (job?.status !== 'succeeded') throw new Error(job?.error || 'Backup inventory failed.')
    backups.value = job.result?.backups || []
  } catch (e) { error.value = e.message || 'Unable to list backups.' }
  finally { busy.value = false }
}

async function validateSelection() {
  if (!selectedBackup.value) return
  busy.value = true; error.value = ''; clearValidation()
  try {
    const result = await validateRestoreWorkflow({
      backupRef: selectedBackup.value.backup_ref,
      destinationId: selectedDestinationId.value,
      restoreMode: restoreMode.value,
    }, { startRestoreValidation, pollJob })
    validation.value = result.validation
    validationJobId.value = result.validationJobId
    if (!validation.value?.ok) error.value = 'Restore validation completed but the target is not ready. Review the checks below.'
  } catch (e) { error.value = e.message || 'Unable to validate restore.' }
  finally { busy.value = false }
}

async function restoreNow() {
  if (!canRestore.value) return
  busy.value = true; error.value = ''; confirmRestore.value = false
  try {
    const result = await startRestoreWorkflow({
      backupRef: selectedBackup.value.backup_ref,
      destinationId: selectedDestinationId.value,
      restoreMode: restoreMode.value,
      validationJobId: validationJobId.value,
    }, { startServerRestore, pollJob })
    activeJob.value = { ...result.job, stage_label: 'Restore completed' }
  } catch (e) { error.value = e.message || 'Restore failed.' }
  finally { busy.value = false }
}

onMounted(loadDestinations)
onBeforeUnmount(() => { stopped = true; if (pollTimer) clearTimeout(pollTimer) })
</script>

<template>
<section>
  <div class="phead"><div><span class="eyebrow">CORE RECOVERY</span><h1>Backup & Restore</h1><p>Inspect registered recovery destinations, validate a recovery bundle non-destructively, and restore only after its source identity and Core version transition are visible.</p></div><button class="btn" :disabled="busy" @click="loadDestinations">Refresh destinations</button></div>
  <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
  <div v-if="loading" class="callout mono">Loading registered backup destinations…</div>
  <template v-else>
    <section class="card mb">
      <div class="cardhead"><div><span class="eyebrow">SOURCE</span><h3>Registered destination</h3></div><span class="pill ok">SERVER-VALIDATED</span></div>
      <div v-if="!destinations.length" class="state-inline warning"><b>No registered destinations.</b> Validate a backup destination through the Core server-backup capability before using restore.</div>
      <div v-else class="formgrid">
        <label><span>Destination</span><select v-model="selectedDestinationId" :disabled="busy" @change="loadBackups"><option v-for="item in destinations" :key="item.id" :value="item.id">{{ item.name || item.id }} · {{ item.type }} · {{ item.location }}</option></select></label>
        <label><span>Restore mode</span><select v-model="restoreMode" :disabled="busy" @change="clearValidation"><option value="full">Full Tactical + Tec-Tac</option><option value="tactical">Tactical only</option><option value="tec_tac">Tec-Tac only</option></select></label>
      </div>
      <div class="queue-footer"><button class="btn" :disabled="busy || !selectedDestinationId" @click="loadBackups">{{ busy ? 'Working…' : 'Load backups' }}</button></div>
    </section>

    <section class="card mb">
      <div class="cardhead"><div><span class="eyebrow">RECOVERY BUNDLES</span><h3>Available backups</h3></div><span class="pill">{{ backups.length }}</span></div>
      <div v-if="!backups.length" class="state-inline">Choose a registered destination and load its backups.</div>
      <div v-else class="tablewrap"><table><thead><tr><th></th><th>Backup</th><th>Created</th><th>Size</th><th>Source</th><th>Signer fingerprint</th><th>Format</th></tr></thead><tbody>
        <tr v-for="item in backups" :key="item.backup_ref">
          <td><input type="radio" name="backup" :checked="selectedBackupRef===item.backup_ref" @change="selectBackup(item.backup_ref)"></td>
          <td><b class="mono">{{ item.archive_name }}</b><span class="sub">{{ item.backup_class }}</span></td>
          <td>{{ fmtDate(item.created_at || item.modified_at) }}</td><td class="mono">{{ fmtBytes(item.size_bytes) }}</td>
          <td><b>{{ item.server_name || 'Unknown server' }}</b><span class="sub mono">{{ item.installation_id || 'No installation ID' }}</span></td>
          <td class="mono">{{ item.recovery_signer?.public_key_sha256 || '—' }}</td>
          <td><span class="pill" :class="item.legacy ? 'warn' : 'ok'">v{{ item.format_version }}</span></td>
        </tr>
      </tbody></table></div>
      <div class="queue-footer"><button class="btn" :disabled="busy || !selectedBackup" @click="validateSelection">Validate restore</button></div>
    </section>

    <section v-if="validation" class="card mb">
      <div class="cardhead"><div><span class="eyebrow">VALIDATION</span><h3>Restore identity & transition</h3></div><span class="pill" :class="validation.ok ? 'ok' : 'warn'">{{ validation.ok ? 'READY' : 'NOT READY' }}</span></div>
      <div class="grid g4 mb">
        <article v-for="item in reviewRows" :key="item.id" class="tile"><div class="lbl">{{ item.label }}</div><div class="big compact" :class="{mono:item.id!=='server_name'}">{{ item.value }}</div><div class="brk">{{ item.hint }}</div></article>
      </div>
      <div v-if="versionTransition" class="state-inline" :class="versionTransition.is_core_downgrade ? 'warning' : ''"><b>Core {{ versionTransition.current_core_version || 'current' }} → {{ versionTransition.restored_core_version || 'backup version' }}</b><span v-if="versionTransition.notice">{{ versionTransition.notice }}</span></div>
      <div v-if="downgradeNotice" class="state-inline warning" role="alert"><b>Downgrade warning:</b> {{ downgradeNotice }}</div>
      <div v-if="validation.warnings?.length" class="state-inline warning"><b>Warnings</b><span v-for="item in validation.warnings" :key="item">{{ item }}</span></div>
      <div v-if="signerNeedsTrust" class="state-inline warning recovery-signer-card" role="alert">
        <b>Recovery signer is valid but not trusted on this server.</b>
        <span>{{ review.sourceServerName || 'Unknown server' }} · {{ review.signerKeyId || 'Unknown key' }}</span>
        <span class="mono">{{ review.signerFingerprint || 'Unknown fingerprint' }}</span>
        <span>Signed {{ fmtDate(review.signerSignedAt) }}</span>
        <button class="btn" :disabled="busy" @click="trustSigner">Trust this signer and re-validate</button>
      </div>
      <div class="queue-footer"><button class="btn danger" :disabled="!canRestore" @click="confirmRestore=true">Restore this backup</button></div>
    </section>

    <div v-if="activeJob" class="state-inline"><b>{{ activeJob.stage_label || activeJob.status }}</b><span class="mono">{{ activeJob.job_id }}</span><span v-if="activeJob.error">{{ activeJob.error }}</span></div>
  </template>

  <div v-if="confirmRestore" class="modal-backdrop" @click.self="confirmRestore=false"><section class="modal-panel"><div class="cardhead"><div><span class="eyebrow">CONFIRM RESTORE</span><h3>Restore this recovery bundle?</h3></div><span class="pill warn">DESTRUCTIVE</span></div>
    <p><b>{{ review.sourceServerName || 'Unknown server' }}</b> · <span class="mono">{{ review.installationId || 'No installation ID' }}</span></p>
    <p>Recovery signer fingerprint: <span class="mono">{{ review.signerFingerprint || 'Unknown' }}</span></p>
    <div v-if="downgradeNotice" class="state-inline warning"><b>{{ review.downgradeHeadline }}</b><span>{{ downgradeNotice }}</span></div>
    <p v-else-if="versionTransition">Core transition: <b>{{ versionTransition.current_core_version || 'current' }} → {{ versionTransition.restored_core_version || 'backup version' }}</b>.</p>
    <p>The restore will only start after this confirmation. Validation must remain successful.</p>
    <div class="modal-actions"><button class="btn danger" :disabled="busy" @click="restoreNow">Confirm restore</button><button class="btn" :disabled="busy" @click="confirmRestore=false">Cancel</button></div>
  </section></div>
</section>
</template>
