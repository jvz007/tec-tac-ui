<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { discardModulePackage, getModuleJob, inspectModulePackage, installModulePackage, listModules, removeModule } from '../modules'

const state = inject('tecTacState')
const modules = ref([])
const loading = ref(true)
const error = ref('')
const query = ref('')
const selectedId = ref(null)
const managerAllowed = ref(false)
const fileInput = ref(null)
const inspecting = ref(false)
const staged = ref(null)
const replaceConfirmed = ref(false)
const removeTarget = ref(null)
const removeConfirm = ref('')
const activeJob = ref(null)
const pollFailures = ref(0)
let pollTimer = null

const canManage = computed(() => managerAllowed.value && state.context.capabilities?.manage_modules !== false)
const filtered = computed(() => modules.value.filter((item) => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return true
  return [item.id, item.status, item.extension_version, item.reportset_version]
    .filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))
}))
const selected = computed(() => modules.value.find((item) => item.id === selectedId.value) || null)
const installedCount = computed(() => modules.value.filter((item) => item.managed).length)
const adminUiCount = computed(() => modules.value.filter((item) => item.authenticated_ui_enabled).length)
const publicUiCount = computed(() => modules.value.filter((item) => item.public_ui_enabled).length)
const protectedCount = computed(() => modules.value.filter((item) => !item.managed).length)
const stagedPreview = computed(() => staged.value?.preview || null)
const jobRunning = computed(() => activeJob.value && !['succeeded','failed','dispatch_failed'].includes(activeJob.value.status))

async function refreshCatalog(preferred = null) {
  error.value = ''
  try {
    const payload = await listModules()
    modules.value = payload.modules || []
    managerAllowed.value = !!payload.manage
    const next = preferred || selectedId.value
    if (next && modules.value.some((item) => item.id === next)) selectedId.value = next
    else selectedId.value = modules.value[0]?.id || null
  } catch (err) {
    error.value = err.message || 'Unable to load module catalog.'
  } finally {
    loading.value = false
  }
}

function chooseModule(id) { selectedId.value = id }
function openPackagePicker() { if (canManage.value && !jobRunning.value) fileInput.value?.click() }

async function packageChosen(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  inspecting.value = true
  error.value = ''
  staged.value = null
  replaceConfirmed.value = false
  try { staged.value = await inspectModulePackage(file) }
  catch (err) { error.value = err.message || 'Package inspection failed.' }
  finally { inspecting.value = false }
}

async function closeStage() {
  if (jobRunning.value) return
  const uploadId = staged.value?.upload_id
  staged.value = null
  replaceConfirmed.value = false
  if (uploadId) {
    try { await discardModulePackage(uploadId) } catch {}
  }
}

async function queueInstall() {
  const preview = stagedPreview.value
  if (!preview || !staged.value?.upload_id) return
  if (preview.replace_required && !replaceConfirmed.value) return
  error.value = ''
  try {
    const job = await installModulePackage(staged.value.upload_id, !!preview.replace_required)
    staged.value = null
    replaceConfirmed.value = false
    beginPolling(job)
  } catch (err) { error.value = err.message || 'Unable to queue module installation.' }
}

function askRemove(item) {
  if (!canManage.value || !item?.managed || jobRunning.value) return
  removeTarget.value = item
  removeConfirm.value = ''
}
function closeRemove() { if (!jobRunning.value) { removeTarget.value = null; removeConfirm.value = '' } }
async function confirmRemove() {
  if (!removeTarget.value || removeConfirm.value !== removeTarget.value.id) return
  error.value = ''
  try {
    const job = await removeModule(removeTarget.value.id)
    removeTarget.value = null
    removeConfirm.value = ''
    beginPolling(job)
  } catch (err) { error.value = err.message || 'Unable to queue module removal.' }
}

function beginPolling(job) {
  activeJob.value = job
  pollFailures.value = 0
  schedulePoll(800)
}
function schedulePoll(delay = 1800) {
  clearTimeout(pollTimer)
  pollTimer = setTimeout(pollJob, delay)
}
async function pollJob() {
  if (!activeJob.value?.id) return
  try {
    const job = await getModuleJob(activeJob.value.id)
    activeJob.value = job
    pollFailures.value = 0
    if (['succeeded','failed','dispatch_failed'].includes(job.status)) {
      if (job.status === 'succeeded') await refreshCatalog(job.action === 'install' ? job.plugin_id : null)
      return
    }
  } catch (err) {
    // Lifecycle jobs restart Tactical services. Brief API failures while the
    // backend is cycling are expected, so keep polling instead of declaring
    // the job failed client-side.
    pollFailures.value += 1
  }
  schedulePoll(pollFailures.value ? 2600 : 1800)
}
function clearJob() { if (!jobRunning.value) activeJob.value = null }
function reloadTecTac() { window.location.reload() }

onMounted(refreshCatalog)
onBeforeUnmount(() => clearTimeout(pollTimer))
</script>

<template>
  <section>
    <div class="phead">
      <div><span class="eyebrow">MODULE LIFECYCLE</span><h1>Modules</h1><p>Discover installed Tec-Tac extension/ReportSet pairs, inspect release packages before deployment, and run controlled install, replace, or removal jobs without modifying Tactical tracked source.</p></div>
      <div class="module-head-actions">
        <input ref="fileInput" class="sr-only" type="file" accept=".zip,.tgz,.gz,application/zip,application/gzip" @change="packageChosen" />
        <button class="btn primary" :disabled="!canManage || inspecting || jobRunning" @click="openPackagePicker">{{ inspecting ? 'Inspecting…' : '+ Install package' }}</button>
      </div>
    </div>

    <div v-if="error" class="auth-error">{{ error }}</div>
    <div v-if="state.context.capabilities && !canManage" class="state-inline warning"><b>Read-only module catalog.</b> Tactical <span class="mono">can_do_server_maint</span> is required for installation and removal.</div>

    <div class="grid g4 mb">
      <article class="tile"><div class="lbl">Catalog entries</div><div class="big">{{ modules.length }}</div><div class="brk">first-class + protected compatibility</div></article>
      <article class="tile"><div class="lbl">Managed modules</div><div class="big">{{ installedCount }}</div><div class="brk">installable/removable pairs</div></article>
      <article class="tile"><div class="lbl">Admin UI</div><div class="big">{{ adminUiCount }}</div><div class="brk">authenticated runtime surfaces</div></article>
      <article class="tile"><div class="lbl">Public UI</div><div class="big">{{ publicUiCount }}</div><div class="brk">anonymous extension surfaces</div></article>
    </div>

    <div v-if="loading" class="callout mono">Discovering installed Tec-Tac modules…</div>
    <div v-else class="module-layout">
      <div>
        <div class="toolbar">
          <label class="compact-input"><span class="sr-only">Search modules</span><input v-model="query" placeholder="Search modules…" /></label>
          <span class="muted mono">{{ filtered.length }} shown</span>
          <span class="spacer"></span>
          <button class="btn sm" @click="refreshCatalog(selectedId)">Refresh</button>
        </div>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Module</th><th>Extension</th><th>ReportSet</th><th>Admin UI</th><th>Public UI</th><th>Permissions</th><th>Status</th></tr></thead>
            <tbody>
              <tr v-for="item in filtered" :key="item.id" class="clickrow" :class="{ selected: selectedId === item.id }" @click="chooseModule(item.id)">
                <td><b>{{ item.id }}</b><span v-if="item.legacy" class="sub">legacy compatibility</span><span v-else-if="item.protected" class="sub">framework protected</span></td>
                <td class="mono">{{ item.extension_version || '—' }}</td>
                <td class="mono">{{ item.reportset_version || '—' }}</td>
                <td><span class="pill" :class="item.authenticated_ui_enabled ? 'ok' : ''">{{ item.authenticated_ui_enabled ? 'enabled' : 'none' }}</span></td>
                <td><span class="pill" :class="item.public_ui_enabled ? 'ok' : ''">{{ item.public_ui_enabled ? 'enabled' : 'none' }}</span></td>
                <td class="mono">{{ item.permission_count }}</td>
                <td><span class="pill" :class="item.status === 'installed' ? 'ok' : 'warn'">{{ item.status }}</span></td>
              </tr>
              <tr v-if="!filtered.length"><td colspan="7" class="empty">No matching modules.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <aside class="module-detail card" v-if="selected">
        <div class="cardhead"><div><span class="eyebrow">MODULE DETAIL</span><h3>{{ selected.id }}</h3></div><span class="pill" :class="selected.status === 'installed' ? 'ok' : 'warn'">{{ selected.status }}</span></div>
        <dl class="kvlist module-kv">
          <dt>Extension</dt><dd class="mono">v{{ selected.extension_version || '—' }}</dd>
          <dt>ReportSet</dt><dd class="mono">{{ selected.reportset_version ? `v${selected.reportset_version}` : '—' }}</dd>
          <dt>Versions</dt><dd>{{ selected.versions_match === false ? 'mismatch' : (selected.versions_match === true ? 'aligned' : 'n/a') }}</dd>
          <dt>Admin UI</dt><dd>{{ selected.authenticated_ui_enabled ? `v${selected.ui?.version || '0.0.0'}` : 'not provided' }}</dd>
          <dt>Public UI</dt><dd>{{ selected.public_ui_enabled ? selected.ui?.public?.base_path : 'not provided' }}</dd>
          <dt>Django apps</dt><dd class="mono">{{ selected.django_apps?.length || 0 }}</dd>
          <dt>Permissions</dt><dd class="mono">{{ selected.permission_count || 0 }}</dd>
          <dt>Managed</dt><dd>{{ selected.managed ? 'yes' : 'no' }}</dd>
        </dl>
        <div v-if="selected.ui_error" class="state-inline warning mt"><b>UI manifest invalid.</b> {{ selected.ui_error }}</div>
        <div v-if="selected.authenticated_ui_enabled" class="section-divider">Authenticated UI registration</div>
        <div v-if="selected.authenticated_ui_enabled" class="module-meta">
          <span class="mono">{{ selected.ui.entry }}</span>
          <span>{{ selected.ui.navigation?.section || 'Extensions' }} / {{ selected.ui.navigation?.label || selected.id }}</span>
        </div>
        <div v-if="selected.public_ui_enabled" class="section-divider">Public UI registration</div>
        <div v-if="selected.public_ui_enabled" class="module-meta">
          <span class="mono">{{ selected.ui.public.entry }}</span>
          <span class="mono">{{ selected.ui.public.base_path }}</span>
        </div>
        <div v-if="selected.permission_groups?.length" class="section-divider">Permission groups</div>
        <div v-for="group in selected.permission_groups" :key="group.name" class="module-meta"><b>{{ group.name }}</b><span class="mono">{{ group.permissions.length }} grant{{ group.permissions.length === 1 ? '' : 's' }}</span></div>
        <div class="module-actions">
          <button v-if="selected.managed" class="btn danger" :disabled="!canManage || jobRunning" @click="askRemove(selected)">Remove module</button>
          <span v-else class="muted smalltext">Protected modules cannot be removed from the UI.</span>
        </div>
      </aside>
      <aside v-else class="module-detail card empty-editor">Select a module to inspect.</aside>
    </div>

    <div v-if="activeJob" class="job-panel card mt" aria-live="polite">
      <div class="cardhead"><div><span class="eyebrow">MODULE JOB</span><h3>{{ activeJob.action }} / {{ activeJob.plugin_id }}</h3></div><span class="pill" :class="activeJob.status === 'succeeded' ? 'ok' : (activeJob.status === 'failed' || activeJob.status === 'dispatch_failed' ? 'warn' : '')">{{ activeJob.status }}</span></div>
      <p v-if="jobRunning" class="compact-copy">The lifecycle worker is running outside the Tactical web process. Temporary API interruptions are expected while Tactical services restart.</p>
      <div v-if="pollFailures" class="state-inline warning">Tactical is temporarily unavailable while the job is running. Polling will continue automatically.</div>
      <div v-if="activeJob.error" class="auth-error">{{ activeJob.error }}</div>
      <pre v-if="activeJob.log_tail?.length" class="job-log">{{ activeJob.log_tail.join('\n') }}</pre>
      <div v-if="activeJob.status === 'succeeded'" class="row"><button class="btn primary" @click="reloadTecTac">Reload Tec-Tac</button><button class="btn" @click="clearJob">Dismiss</button></div>
      <div v-else-if="!jobRunning" class="row"><button class="btn" @click="clearJob">Dismiss</button></div>
    </div>

    <div v-if="staged" class="modal-backdrop" role="presentation" @click.self="closeStage">
      <section class="modal-panel module-package-dialog" role="dialog" aria-modal="true" aria-labelledby="package-title">
        <div class="cardhead"><div><span class="eyebrow">PACKAGE INSPECTION</span><h3 id="package-title">{{ stagedPreview.id }}</h3></div><span class="pill" :class="stagedPreview.already_installed ? 'warn' : 'ok'">{{ stagedPreview.already_installed ? 'REPLACE' : 'NEW' }}</span></div>
        <div class="package-summary">
          <div><span>Extension</span><b class="mono">v{{ stagedPreview.extension_version }}</b></div>
          <div><span>ReportSet</span><b class="mono">v{{ stagedPreview.reportset_version }}</b></div>
          <div><span>Permissions</span><b class="mono">{{ stagedPreview.permission_count }}</b></div>
          <div><span>Admin UI</span><b>{{ stagedPreview.authenticated_ui_enabled ? `v${stagedPreview.ui.version}` : 'none' }}</b></div>
          <div><span>Public UI</span><b>{{ stagedPreview.public_ui_enabled ? stagedPreview.ui.public.base_path : 'none' }}</b></div>
        </div>
        <div class="state-inline" :class="stagedPreview.versions_match ? '' : 'warning'"><b>{{ stagedPreview.versions_match ? 'Package pair validated.' : 'Version mismatch — installation blocked.' }}</b> Extension and ReportSet IDs were registry-validated before this package was staged.</div>
        <div v-if="!stagedPreview.installable && stagedPreview.install_block_reason" class="state-inline warning mt"><b>Installation blocked.</b> {{ stagedPreview.install_block_reason }}</div>
        <div class="state-inline warning trust-warning"><b>Trusted code boundary.</b> Installing a module deploys server and optional browser code. Install only packages you have reviewed and approved.</div>
        <div v-if="stagedPreview.current" class="replace-comparison">
          <span class="eyebrow">INSTALLED VERSION</span>
          <div class="mono">extension {{ stagedPreview.current.extension_version }} → {{ stagedPreview.extension_version }}</div>
          <div class="mono">reportset {{ stagedPreview.current.reportset_version }} → {{ stagedPreview.reportset_version }}</div>
        </div>
        <label v-if="stagedPreview.replace_required" class="checkline warning-check"><input v-model="replaceConfirmed" type="checkbox" /><span>I understand this will replace the installed module after creating a code backup.</span></label>
        <div class="package-hash"><span>SHA-256</span><code>{{ staged.sha256 }}</code><span>{{ staged.size }} bytes</span></div>
        <div class="modal-actions"><button class="btn primary" :disabled="!stagedPreview.installable || (stagedPreview.replace_required && !replaceConfirmed)" @click="queueInstall">{{ stagedPreview.replace_required ? 'Replace module' : 'Install module' }}</button><button class="btn" @click="closeStage">Cancel</button></div>
      </section>
    </div>

    <div v-if="removeTarget" class="modal-backdrop" role="presentation" @click.self="closeRemove">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="remove-module-title">
        <div class="cardhead"><div><span class="eyebrow">REMOVE MODULE</span><h3 id="remove-module-title">{{ removeTarget.id }}</h3></div><span class="pill warn">CODE REMOVAL</span></div>
        <p class="compact-copy">Tec-Tac will back up and remove the extension/ReportSet code while preserving database objects and data. Tactical services will restart.</p>
        <label class="field"><span>Type {{ removeTarget.id }} to confirm</span><input v-model="removeConfirm" autocomplete="off" /></label>
        <div class="modal-actions"><button class="btn danger" :disabled="removeConfirm !== removeTarget.id" @click="confirmRemove">Remove module</button><button class="btn" @click="closeRemove">Cancel</button></div>
      </section>
    </div>
  </section>
</template>
