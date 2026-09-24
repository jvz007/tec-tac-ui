<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  checkOnlineSystemUpdate,
  discardSystemUpdatePackage,
  getSystemUpdateBranches,
  getSystemUpdateJob,
  getSystemUpdateStatus,
  inspectSystemUpdatePackage,
  installSystemUpdatePackage,
  stageOnlineSystemUpdate,
} from '../api'

const status = ref(null)
const loading = ref(true)
const error = ref('')
const online = ref({ framework: null, ui: null })
const onlineBusy = ref({ framework: false, ui: false })
const advancedUnlocked = ref(false)
const branches = ref({ framework: [], ui: [] })
const selectedBranch = ref({ framework: 'main', ui: 'main' })
const branchBusy = ref({ framework: false, ui: false })
const stage = ref(null)
const stageBusy = ref(false)
const offlineInput = ref(null)
const offlineFile = ref(null)
const offlineDropActive = ref(false)
const allowDowngrade = ref(false)
const job = ref(null)
const pollTimer = ref(null)
const reloadTimer = ref(null)
const reloadCountdown = ref(0)
const releaseRefreshTimer = ref(null)

const systemJobProgress = computed(() => {
  const current = job.value
  if (!current) return 0
  if (current.status === 'succeeded' || current.stage === 'complete') return 100
  if (current.status === 'failed') return 100
  const stage = String(current.stage || current.status || '').toLowerCase()
  if (stage.includes('rollback')) return 88
  if (stage.includes('verify')) return 86
  if (stage.includes('install')) return 62
  if (stage.includes('source') || stage.includes('deploy')) return 46
  if (stage.includes('backup')) return 32
  if (stage.includes('preflight')) return 22
  if (stage.includes('dispatch')) return 12
  if (current.status === 'running') return 38
  return 6
})
const systemJobProgressLabel = computed(() => {
  if (!job.value) return ''
  if (job.value.status === 'succeeded') return reloadCountdown.value > 0 ? `Complete · reloading in ${reloadCountdown.value}s` : 'Complete'
  if (job.value.status === 'failed') return 'Failed'
  return String(job.value.stage || job.value.status || 'queued').replace(/-/g, ' ')
})
const systemJobFailureTail = computed(() => {
  if (job.value?.status !== 'failed') return []
  return (job.value?.log_tail || []).filter((line) => String(line || '').trim()).slice(-8)
})

const components = computed(() => [
  {
    id: 'framework',
    label: 'Tec-Tac Framework',
    version: status.value?.framework?.version || 'unknown',
    repository: status.value?.framework?.repository || 'unknown',
  },
  {
    id: 'ui',
    label: 'Tec-Tac UI',
    version: status.value?.ui?.version || 'unknown',
    repository: status.value?.ui?.repository || 'unknown',
  },
])

function humanOperation(value) {
  return String(value || '').toUpperCase() || 'UNKNOWN'
}

function systemTrustLabel(trust) {
  if (!trust) return 'NOT REPORTED'
  if (trust.verified && trust.trusted) return 'VERIFIED'
  if (trust.signed && trust.manifest_verified && trust.trusted) return 'SIGNED'
  if (trust.legacy) return 'UNSIGNED / LEGACY'
  if (trust.state === 'unsigned' || trust.signed === false) return 'UNSIGNED'
  return String(trust.state || 'UNTRUSTED').toUpperCase()
}

function systemTrustClass(trust) {
  if (trust?.verified && trust?.trusted) return 'ok'
  if (trust?.signed && trust?.manifest_verified && trust?.trusted) return 'ok'
  if (trust?.state === 'unsigned' || trust?.signed === false) return 'warn'
  return 'danger'
}

async function loadStatus() {
  loading.value = true
  error.value = ''
  try {
    status.value = await getSystemUpdateStatus()
    for (const component of ['framework', 'ui']) {
      const cached = status.value?.release_cache?.[component]
      if (cached?.latest_release) online.value[component] = cached
    }
  } catch (err) {
    error.value = err?.message || 'Unable to load system update status.'
  } finally {
    loading.value = false
  }
}

async function checkOnline(component, { force = false, background = false } = {}) {
  onlineBusy.value[component] = !background
  if (!background) error.value = ''
  try {
    online.value[component] = await checkOnlineSystemUpdate(component, { force })
  } catch (err) {
    if (!background) error.value = err?.message || 'Unable to check repository release.'
  } finally {
    onlineBusy.value[component] = false
  }
}

async function refreshStableReleases() {
  await Promise.allSettled(['framework', 'ui'].map((component) => checkOnline(component, { background: true })))
}

function formatCheckedAt(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

async function unlockAdvanced() {
  advancedUnlocked.value = true
  await Promise.all(['framework', 'ui'].map(loadBranches))
}

async function loadBranches(component) {
  branchBusy.value[component] = true
  try {
    const result = await getSystemUpdateBranches(component)
    branches.value[component] = result.branches || []
    if (!branches.value[component].some((item) => item.name === selectedBranch.value[component])) {
      selectedBranch.value[component] = branches.value[component][0]?.name || ''
    }
  } catch (err) {
    error.value = err?.message || 'Unable to list repository branches.'
  } finally {
    branchBusy.value[component] = false
  }
}

async function stageOnline(component, sourceType) {
  offlineFile.value = null
  offlineDropActive.value = false
  stageBusy.value = true
  error.value = ''
  try {
    stage.value = await stageOnlineSystemUpdate(
      component,
      sourceType,
      sourceType === 'branch' ? selectedBranch.value[component] : null,
    )
    allowDowngrade.value = false
  } catch (err) {
    error.value = err?.message || 'Unable to stage online update.'
  } finally {
    stageBusy.value = false
  }
}

function pickOfflinePackage() {
  if (stageBusy.value || stage.value) return
  offlineInput.value?.click()
}

function selectOfflinePackage(file) {
  if (!file) return
  const name = String(file.name || '').toLowerCase()
  if (!(name.endsWith('.zip') || name.endsWith('.tgz') || name.endsWith('.tar.gz'))) {
    error.value = 'Offline system updates must be .zip, .tgz, or .tar.gz packages.'
    return
  }
  offlineFile.value = file
  offlineDropActive.value = false
  error.value = ''
}

function onFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  selectOfflinePackage(file)
}

function onOfflineDrop(event) {
  offlineDropActive.value = false
  const files = [...(event.dataTransfer?.files || [])]
  if (!files.length) return
  if (files.length > 1) {
    error.value = 'System Updates accepts one offline framework or UI package at a time.'
    return
  }
  selectOfflinePackage(files[0])
}

function clearOfflineFile() {
  offlineFile.value = null
  offlineDropActive.value = false
}

async function inspectOfflinePackage() {
  if (!offlineFile.value || stageBusy.value) return
  stageBusy.value = true
  error.value = ''
  try {
    stage.value = await inspectSystemUpdatePackage(offlineFile.value)
    offlineFile.value = null
    allowDowngrade.value = false
  } catch (err) {
    error.value = err?.message || 'Unable to inspect update package.'
  } finally {
    stageBusy.value = false
  }
}

async function clearStage() {
  if (!stage.value?.upload_id) return
  try { await discardSystemUpdatePackage(stage.value.upload_id) } catch { /* consumed/expired is harmless */ }
  stage.value = null
  allowDowngrade.value = false
}

async function installStage() {
  if (!stage.value?.upload_id || stageBusy.value) return
  const preview = stage.value.preview || {}
  if (preview.operation === 'downgrade' && !allowDowngrade.value) return
  stageBusy.value = true
  error.value = ''
  try {
    job.value = await installSystemUpdatePackage(stage.value.upload_id, allowDowngrade.value)
    stage.value = null
    startPolling()
  } catch (err) {
    error.value = err?.message || 'Unable to start system update.'
  } finally {
    stageBusy.value = false
  }
}

function startPolling() {
  stopPolling()
  if (reloadTimer.value) window.clearInterval(reloadTimer.value)
  reloadTimer.value = null
  reloadCountdown.value = 0
  pollTimer.value = window.setInterval(refreshJob, 1500)
  refreshJob()
}

function scheduleReload() {
  if (reloadTimer.value) return
  reloadCountdown.value = 5
  reloadTimer.value = window.setInterval(() => {
    reloadCountdown.value -= 1
    if (reloadCountdown.value <= 0) {
      window.clearInterval(reloadTimer.value)
      reloadTimer.value = null
      window.location.reload()
    }
  }, 1000)
}

function stopPolling() {
  if (pollTimer.value) window.clearInterval(pollTimer.value)
  pollTimer.value = null
}

async function refreshJob() {
  if (!job.value?.id) return
  try {
    job.value = await getSystemUpdateJob(job.value.id)
    if (['succeeded', 'failed'].includes(job.value.status)) {
      stopPolling()
      if (job.value.status === 'succeeded') {
        // Framework/UI updates can change runtime contracts or shell assets.
        // The nginx cache policy makes index.html/manifest revalidation explicit.
        scheduleReload()
        return
      }
      await loadStatus()
    }
  } catch (err) {
    // Framework updates may briefly restart the API. Keep polling while the
    // browser still holds the existing UI bundle.
    if (!['succeeded', 'failed'].includes(job.value?.status)) return
    error.value = err?.message || 'Unable to read update job.'
  }
}

function reloadUi() {
  window.location.reload()
}

onMounted(async () => {
  await loadStatus()
  await refreshStableReleases()
  // The backend cache makes this cheap: GitHub is contacted only when the
  // persisted release lookup is at least 24 hours old.
  releaseRefreshTimer.value = window.setInterval(refreshStableReleases, 60 * 60 * 1000)
})
onBeforeUnmount(() => {
  stopPolling()
  if (reloadTimer.value) window.clearInterval(reloadTimer.value)
  if (releaseRefreshTimer.value) window.clearInterval(releaseRefreshTimer.value)
})
</script>

<template>
  <section>
    <header class="phead">
      <div>
        <span class="eyebrow">SYSTEM / UPDATE CONTROL</span>
        <h1>System Updates</h1>
        <p>Update the Tec-Tac framework or UI from a stable repository release, an explicitly unlocked branch, or an offline ZIP/TAR.GZ package.</p>
      </div>
    </header>

    <div v-if="job" class="lifecycle-progress" :class="{ failed: job.status === 'failed', complete: job.status === 'succeeded' }">
      <div class="lifecycle-progress-head"><span><b>System update</b> · {{ systemJobProgressLabel }}</span><span class="mono">{{ systemJobProgress }}%</span></div>
      <div class="lifecycle-progress-track"><div class="lifecycle-progress-fill" :style="{ width: `${systemJobProgress}%` }"></div></div>
    </div>

    <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
    <div v-if="loading" class="state-inline">Loading installed versions…</div>

    <article v-else class="card package-workspace mb" aria-labelledby="offline-package-title">
      <div class="cardhead">
        <div><span class="eyebrow">PACKAGE INTAKE</span><h3 id="offline-package-title">Upload offline package</h3></div>
        <span v-if="offlineFile" class="pill">SELECTED</span>
      </div>

      <input ref="offlineInput" class="sr-only" type="file" accept=".zip,.tar.gz,.tgz" :disabled="stageBusy || !!stage" @change="onFile" />

      <div
        v-if="!offlineFile && !stage"
        class="drop-zone"
        :class="{ active: offlineDropActive, disabled: stageBusy }"
        role="button"
        tabindex="0"
        @click="pickOfflinePackage"
        @keydown.enter.prevent="pickOfflinePackage"
        @keydown.space.prevent="pickOfflinePackage"
        @dragenter.prevent="offlineDropActive=true"
        @dragover.prevent="offlineDropActive=true"
        @dragleave.prevent="offlineDropActive=false"
        @drop.prevent="onOfflineDrop"
      >
        <div class="drop-icon">⇩</div>
        <div><b>{{ offlineDropActive ? 'Drop update package here' : 'Drag & drop an offline system update here' }}</b><span>Framework and UI packages support .zip, .tgz, and .tar.gz. One system package is inspected at a time.</span></div>
        <button class="btn sm" type="button" :disabled="stageBusy" @click.stop="pickOfflinePackage">Browse files</button>
      </div>

      <div v-if="offlineFile && !stage" class="package-queue">
        <div class="queue-head"><span class="eyebrow">FILE TO INSPECT</span><span class="mono muted">1 package</span></div>
        <div class="queue-row">
          <span class="queue-grip mono" aria-hidden="true">PKG</span>
          <span class="queue-index mono">1</span>
          <div class="queue-main"><b>{{ offlineFile.name }}</b><span>{{ (offlineFile.size/1024).toFixed(1) }} KB</span></div>
          <div class="queue-actions"><button class="iconbtn" title="Remove" :disabled="stageBusy" @click="clearOfflineFile">×</button></div>
        </div>
        <div class="queue-footer"><button class="btn" :disabled="stageBusy" @click="clearOfflineFile">Clear</button><span class="spacer"></span><button class="btn primary" :disabled="stageBusy" @click="inspectOfflinePackage">{{ stageBusy ? 'Inspecting…' : 'Inspect package' }}</button></div>
      </div>

      <div v-if="stage" class="state-inline"><b>Package staged.</b> Review the inspection result below before installation.</div>
    </article>

    <div v-if="!loading" class="system-update-grid">
      <article v-for="component in components" :key="component.id" class="card system-update-card">
        <div class="cardhead">
          <div>
            <span class="eyebrow">{{ component.id === 'framework' ? 'BACKEND' : 'FRONTEND' }}</span>
            <h3>{{ component.label }}</h3>
          </div>
          <span class="pill ok">INSTALLED {{ component.version }}</span>
        </div>

        <dl class="kvlist system-update-kv">
          <dt>Repository</dt><dd class="mono">{{ component.repository }}</dd>
          <dt>Stable release</dt>
          <dd>
            <span v-if="online[component.id]?.latest_release" class="mono">{{ online[component.id].latest_release.tag }}</span>
            <span v-else class="muted">No cached release yet</span>
          </dd>
          <dt>Release trust</dt>
          <dd>
            <span v-if="online[component.id]?.latest_release" class="system-trust-badge" tabindex="0">
              <span class="pill" :class="systemTrustClass(online[component.id].latest_release.release_trust)">{{ systemTrustLabel(online[component.id].latest_release.release_trust) }}</span>
              <span class="system-trust-popover">
                <b>{{ online[component.id].latest_release.release_trust?.publisher_display_name || (online[component.id].latest_release.release_trust?.signed ? 'Signed release' : 'Unsigned release') }}</b>
                <span v-if="online[component.id].latest_release.release_trust?.publisher_id">Publisher ID: <span class="mono">{{ online[component.id].latest_release.release_trust.publisher_id }}</span></span>
                <span v-if="online[component.id].latest_release.release_trust?.key_id">Key ID: <span class="mono">{{ online[component.id].latest_release.release_trust.key_id }}</span></span>
                <span v-if="online[component.id].latest_release.release_trust?.algorithm">Algorithm: {{ online[component.id].latest_release.release_trust.algorithm }}</span>
                <span v-if="online[component.id].latest_release.release_trust?.file_count">Manifest files: {{ online[component.id].latest_release.release_trust.file_count }}</span>
                <span v-if="online[component.id].latest_release.release_trust?.details">{{ online[component.id].latest_release.release_trust.details }}</span>
              </span>
            </span>
            <span v-else class="muted">Not checked</span>
          </dd>
          <dt>Last checked</dt><dd class="smalltext">{{ formatCheckedAt(online[component.id]?.checked_at) }}<span v-if="online[component.id]?.cache?.stale" class="pill warn ml">STALE</span></dd>
        </dl>

        <div v-if="online[component.id]?.release_error" class="state-inline warning mt">{{ online[component.id].release_error }}</div>

        <div class="system-update-actions">
          <button class="btn" :disabled="onlineBusy[component.id] || stageBusy" @click="checkOnline(component.id, { force: true })">
            {{ onlineBusy[component.id] ? 'Checking…' : 'Refresh stable release' }}
          </button>
          <button
            v-if="online[component.id]?.latest_release"
            class="btn primary"
            :disabled="stageBusy"
            @click="stageOnline(component.id, 'release')"
          >
            Download & inspect {{ online[component.id].latest_release.tag }}
          </button>
        </div>

        <div class="section-divider">Advanced source</div>
        <div v-if="!advancedUnlocked" class="advanced-lock">
          <div>
            <span class="pill warn">LOCKED</span>
            <p>Branch builds may be untagged, custom, or incompatible. Unlocking applies only to this browser session.</p>
          </div>
          <button class="btn warnbtn" :disabled="stageBusy" @click="unlockAdvanced">Unlock branch sources</button>
        </div>
        <div v-else class="advanced-source">
          <label class="field compact-field">
            <span>Branch</span>
            <select v-model="selectedBranch[component.id]" :disabled="branchBusy[component.id] || stageBusy">
              <option v-for="branch in branches[component.id]" :key="branch.sha" :value="branch.name">{{ branch.name }} · {{ branch.sha.slice(0, 8) }}</option>
            </select>
          </label>
          <button class="btn" :disabled="!selectedBranch[component.id] || stageBusy" @click="stageOnline(component.id, 'branch')">Download & inspect branch</button>
        </div>
      </article>
    </div>

    <article v-if="stage" class="card update-preview mt">
      <div class="cardhead">
        <div><span class="eyebrow">PACKAGE INSPECTION</span><h3>{{ stage.preview.component_label }}</h3></div>
        <span class="pill" :class="stage.preview.operation === 'downgrade' ? 'warn' : 'ok'">{{ humanOperation(stage.preview.operation) }}</span>
      </div>
      <div class="package-summary system-package-summary">
        <div><span>Installed</span><b class="mono">{{ stage.preview.installed_version || 'none' }}</b></div>
        <div><span>Package</span><b class="mono">{{ stage.preview.version }}</b></div>
        <div><span>Source</span><b>{{ stage.preview.source?.type || 'offline' }}</b></div>
        <div><span>Trust</span><span class="system-trust-badge" tabindex="0"><span class="pill" :class="systemTrustClass(stage.preview.release_trust)">{{ systemTrustLabel(stage.preview.release_trust) }}</span><span class="system-trust-popover"><b>{{ stage.preview.release_trust?.publisher_display_name || (stage.preview.release_trust?.legacy ? 'Legacy unsigned release' : 'Unsigned source') }}</b><span v-if="stage.preview.release_trust?.publisher_id">Publisher ID: <span class="mono">{{ stage.preview.release_trust.publisher_id }}</span></span><span v-if="stage.preview.release_trust?.key_id">Key ID: <span class="mono">{{ stage.preview.release_trust.key_id }}</span></span><span v-if="stage.preview.release_trust?.algorithm">Algorithm: {{ stage.preview.release_trust.algorithm }}</span><span v-if="stage.preview.release_trust?.file_count">Verified files: {{ stage.preview.release_trust.file_count }}</span><span v-if="stage.preview.release_trust?.details">{{ stage.preview.release_trust.details }}</span></span></span></div>
        <div><span>SHA256</span><b class="mono hash-short">{{ stage.sha256 }}</b></div>
      </div>
      <div v-if="!stage.preview.installable" class="state-inline denied">{{ stage.preview.install_block_reason }}</div>
      <label v-if="stage.preview.operation === 'downgrade'" class="warning-check checkline">
        <input v-model="allowDowngrade" type="checkbox" />
        <span>I understand this installs an older system component and may be incompatible with installed modules.</span>
      </label>
      <div class="module-actions">
        <button class="btn primary" :disabled="stageBusy || !stage.preview.installable || (stage.preview.operation === 'downgrade' && !allowDowngrade)" @click="installStage">{{ stageBusy ? 'Starting…' : 'Install package' }}</button>
        <button class="btn" :disabled="stageBusy" @click="clearStage">Discard</button>
      </div>
    </article>

    <article v-if="status?.history?.length" class="tablewrap mt">
      <div class="cardhead system-history-head"><div><span class="eyebrow">RECENT ACTIVITY</span><h3>Update history</h3></div></div>
      <table>
        <thead><tr><th>Component</th><th>Version</th><th>Source</th><th>Trust</th><th>Operator</th><th>Result</th><th>Finished</th></tr></thead>
        <tbody>
          <tr v-for="item in status.history" :key="item.id">
            <td>{{ item.component }}</td>
            <td class="mono">{{ item.installed_version }} → {{ item.version }}</td>
            <td><span class="mono">{{ item.source?.type || 'offline' }}</span><span v-if="item.source?.ref" class="sub">{{ item.source.ref }}</span><span v-if="item.source?.commit" class="sub mono">{{ item.source.commit.slice(0,12) }}</span></td>
            <td><span class="pill" :class="systemTrustClass(item.release_trust)">{{ systemTrustLabel(item.release_trust) }}</span><span v-if="item.release_trust?.publisher_id" class="sub">{{ item.release_trust.publisher_id }} · {{ item.release_trust.key_id }}</span></td>
            <td>{{ item.requested_by || 'unknown' }}</td>
            <td><span class="pill" :class="item.status === 'succeeded' ? 'ok' : 'warn'">{{ item.status }}</span></td>
            <td class="mono smalltext">{{ item.finished_at || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </article>

    <article v-if="job" class="card job-panel mt">
      <div class="cardhead">
        <div><span class="eyebrow">SYSTEM UPDATE JOB</span><h3>{{ job.component }} · {{ job.operation }}</h3></div>
        <span class="pill" :class="job.status === 'succeeded' ? 'ok' : (job.status === 'failed' ? 'warn' : '')">{{ job.status }}</span>
      </div>
      <div class="module-meta"><span>Stage</span><b class="mono">{{ job.stage }}</b></div>
      <div class="module-meta"><span>Version</span><b class="mono">{{ job.installed_version }} → {{ job.version }}</b></div>
      <div v-if="job.rollback?.performed" class="state-inline" :class="job.rollback.status === 'succeeded' ? 'warning' : 'denied'">Rollback {{ job.rollback.status }}<span v-if="job.rollback.version"> · restored {{ job.rollback.version }}</span></div>
      <div v-if="job.error" class="state-inline denied mt"><b>{{ job.error_type }}:</b> {{ job.error }}</div>
      <div v-if="systemJobFailureTail.length" class="state-inline denied mt"><b>Final lifecycle output</b><pre class="job-log">{{ systemJobFailureTail.join('\n') }}</pre></div>
      <pre class="job-log">{{ (job.log_tail || []).join('\n') || 'Waiting for lifecycle output…' }}</pre>
      <div v-if="job.status === 'succeeded' && job.component === 'ui'" class="module-actions"><button class="btn primary" @click="reloadUi">Reload Tec-Tac UI</button></div>
    </article>
  </section>
</template>
