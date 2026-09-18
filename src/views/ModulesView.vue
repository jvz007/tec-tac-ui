<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  checkModuleRemoval,
  discardModuleArtifact,
  getModuleJob,
  inspectModulePackages,
  installModuleArtifact,
  listModules,
  removeModule,
  setModuleEnabled,
} from '../modules'

const state = inject('tecTacState')
const modules = ref([])
const loading = ref(true)
const error = ref('')
const query = ref('')
const selectedId = ref(null)
const managerAllowed = ref(false)
const fileInput = ref(null)
const pendingFiles = ref([])
const dropActive = ref(false)
const inspecting = ref(false)
const staged = ref(null)
const installOrder = ref([])
const queueWarning = ref('')
const dragId = ref(null)
const activeJob = ref(null)
const confirmTarget = ref(null)
const confirmMode = ref('')
const confirmText = ref('')
const cascade = ref(false)
let pollTimer = null

const canManage = computed(() => managerAllowed.value && state.context.capabilities?.manage_modules !== false)
const filtered = computed(() => modules.value.filter((x) => !query.value.trim() || [x.id, x.status, x.extension_version].some((v) => String(v || '').toLowerCase().includes(query.value.toLowerCase()))))
const selected = computed(() => modules.value.find((x) => x.id === selectedId.value) || null)
const enabledCount = computed(() => modules.value.filter((x) => x.managed && x.enabled).length)
const disabledCount = computed(() => modules.value.filter((x) => x.managed && !x.enabled).length)
const dependencyCount = computed(() => modules.value.reduce((n, x) => n + Object.keys(x.dependencies || {}).length, 0))
const jobRunning = computed(() => activeJob.value && !['succeeded', 'failed', 'dispatch_failed'].includes(activeJob.value.status))
const preview = computed(() => staged.value?.preview || staged.value)
const plan = computed(() => preview.value?.plan || staged.value?.plan || null)
const artifactKind = computed(() => staged.value?.kind || preview.value?.kind || 'artifact')

const stagedRows = computed(() => {
  if (!staged.value) return []
  let rows = []
  if (artifactKind.value === 'batch') rows = (staged.value.packages || []).map((item) => item.preview || item)
  else if (artifactKind.value === 'bundle') rows = preview.value?.packages || []
  else rows = preview.value ? [preview.value] : []
  const actions = new Map((plan.value?.actions || []).map((item) => [item.id, item]))
  return rows.map((item) => ({ ...item, ...(actions.get(item.id) || {}) }))
})

const orderedRows = computed(() => {
  const byId = new Map(stagedRows.value.map((row) => [row.id, row]))
  return installOrder.value.map((id) => byId.get(id)).filter(Boolean)
})

async function refresh(preferred = null) {
  error.value = ''
  try {
    const payload = await listModules()
    modules.value = payload.modules || []
    managerAllowed.value = !!payload.manage
    selectedId.value = (preferred && modules.value.some((x) => x.id === preferred))
      ? preferred
      : (modules.value.some((x) => x.id === selectedId.value) ? selectedId.value : modules.value[0]?.id || null)
  } catch (e) {
    error.value = e.message || 'Unable to load modules.'
  } finally {
    loading.value = false
  }
}

function pick() {
  if (canManage.value && !jobRunning.value && !inspecting.value && !staged.value) fileInput.value?.click()
}

function fileKey(file) { return `${file.name}:${file.size}:${file.lastModified}` }

function addFiles(files) {
  if (!canManage.value || jobRunning.value || inspecting.value || staged.value) return
  const allowed = [...files].filter((file) => /\.(zip|tgz|tar\.gz)$/i.test(file.name))
  if (!allowed.length) {
    queueWarning.value = 'No supported Tec-Tac package files were added. Use .zip, .tgz or .tar.gz.'
    return
  }
  const seen = new Set(pendingFiles.value.map(fileKey))
  for (const file of allowed) {
    if (!seen.has(fileKey(file))) pendingFiles.value.push(file)
  }
  queueWarning.value = allowed.length === files.length ? '' : 'Unsupported files were ignored.'
}

function filesChosen(event) {
  addFiles(event.target.files || [])
  event.target.value = ''
}

function onDrop(event) {
  dropActive.value = false
  addFiles(event.dataTransfer?.files || [])
}

function removePending(index) { pendingFiles.value.splice(index, 1) }
function movePending(index, offset) {
  const target = index + offset
  if (target < 0 || target >= pendingFiles.value.length) return
  const next = [...pendingFiles.value]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  pendingFiles.value = next
}

async function inspectPending() {
  if (!pendingFiles.value.length || inspecting.value) return
  inspecting.value = true
  error.value = ''
  queueWarning.value = ''
  try {
    staged.value = await inspectModulePackages(pendingFiles.value)
    installOrder.value = [...(plan.value?.order || stagedRows.value.map((item) => item.id))]
    pendingFiles.value = []
  } catch (err) {
    error.value = err.message || 'Inspection failed.'
  } finally {
    inspecting.value = false
  }
}

function dependencyViolation(order) {
  const position = new Map(order.map((id, index) => [id, index]))
  const rows = new Map(stagedRows.value.map((row) => [row.id, row]))
  for (const id of order) {
    const row = rows.get(id)
    for (const dependency of Object.keys(row?.dependencies || {})) {
      if (position.has(dependency) && position.get(dependency) > position.get(id)) {
        return `${id} requires ${dependency} to be installed first.`
      }
    }
  }
  return ''
}

function requestMove(id, targetIndex) {
  const from = installOrder.value.indexOf(id)
  if (from < 0 || targetIndex < 0 || targetIndex >= installOrder.value.length || from === targetIndex) return
  const next = [...installOrder.value]
  next.splice(from, 1)
  next.splice(targetIndex, 0, id)
  const violation = dependencyViolation(next)
  if (violation) {
    queueWarning.value = `Required sequence enforced: ${violation}`
    return
  }
  installOrder.value = next
  queueWarning.value = ''
}

function moveInspected(id, offset) {
  const from = installOrder.value.indexOf(id)
  requestMove(id, from + offset)
}

function dragStart(id) { dragId.value = id }
function dropOn(id) {
  if (!dragId.value) return
  requestMove(dragId.value, installOrder.value.indexOf(id))
  dragId.value = null
}

async function clearStaged() {
  const uploadId = staged.value?.upload_id
  staged.value = null
  installOrder.value = []
  queueWarning.value = ''
  if (!uploadId) return
  try { await discardModuleArtifact(uploadId) } catch (e) { error.value = e.message || 'Unable to discard staged packages.' }
}

async function install() {
  if (!staged.value?.upload_id || plan.value?.valid === false) return
  const violation = dependencyViolation(installOrder.value)
  if (violation) {
    queueWarning.value = `Required sequence enforced: ${violation}`
    return
  }
  try {
    const job = await installModuleArtifact(
      staged.value.upload_id,
      artifactKind.value === 'batch' ? 'batch' : 'artifact',
      installOrder.value,
    )
    staged.value = null
    installOrder.value = []
    beginPoll(job)
  } catch (e) {
    error.value = e.message
  }
}

function ask(item, mode) { confirmTarget.value = item; confirmMode.value = mode; confirmText.value = ''; cascade.value = false }
function closeConfirm() { confirmTarget.value = null; confirmMode.value = ''; confirmText.value = ''; cascade.value = false }
async function confirmAction() {
  const item = confirmTarget.value
  if (!item || confirmText.value !== item.id) return
  try {
    let job
    if (confirmMode.value === 'enable') job = await setModuleEnabled(item.id, true)
    else if (confirmMode.value === 'disable') job = await setModuleEnabled(item.id, false, cascade.value)
    else {
      const check = await checkModuleRemoval(item.id)
      if (!check.valid) throw new Error(`Cannot remove: required by ${check.dependants.map((x) => x.id).join(', ')}`)
      job = await removeModule(item.id)
    }
    closeConfirm()
    beginPoll(job)
  } catch (e) { error.value = e.message }
}

function beginPoll(job) { activeJob.value = job; clearTimeout(pollTimer); pollTimer = setTimeout(poll, 700) }
async function poll() {
  if (!activeJob.value?.id) return
  try {
    activeJob.value = await getModuleJob(activeJob.value.id)
    if (['succeeded', 'failed', 'dispatch_failed'].includes(activeJob.value.status)) {
      if (activeJob.value.status === 'succeeded') await refresh(activeJob.value.plugin_id)
      return
    }
  } catch {}
  pollTimer = setTimeout(poll, 1800)
}
function reloadTecTac() { window.location.reload() }
onMounted(refresh)
onBeforeUnmount(() => clearTimeout(pollTimer))
</script>

<template>
<section>
  <div class="phead">
    <div><span class="eyebrow">MODULE MANAGEMENT V2</span><h1>Modules</h1><p>Install packages or bundles, control runtime state, and validate dependency/version requirements before Tec-Tac changes anything.</p></div>
  </div>

  <div v-if="error" class="auth-error">{{ error }}</div>
  <div v-if="!canManage && !loading" class="state-inline warning"><b>Read-only module catalog.</b> Tactical <span class="mono">can_do_server_maint</span> is required.</div>

  <section class="card package-workspace mb" aria-labelledby="package-workspace-title">
    <div class="cardhead">
      <div><span class="eyebrow">PACKAGE INTAKE</span><h3 id="package-workspace-title">Install packages / bundle</h3></div>
      <span v-if="staged" class="pill" :class="plan?.valid ? 'ok' : 'warn'">{{ plan?.valid ? 'INSPECTED' : 'BLOCKED' }}</span>
    </div>

    <input ref="fileInput" class="sr-only" type="file" multiple accept=".zip,.tgz,.tar.gz,application/zip,application/gzip" @change="filesChosen">

    <div
      v-if="!staged"
      class="drop-zone"
      :class="{ active: dropActive, disabled: !canManage || jobRunning || inspecting }"
      role="button"
      tabindex="0"
      @click="pick"
      @keydown.enter.prevent="pick"
      @keydown.space.prevent="pick"
      @dragenter.prevent="dropActive=true"
      @dragover.prevent="dropActive=true"
      @dragleave.prevent="dropActive=false"
      @drop.prevent="onDrop"
    >
      <div class="drop-icon">⇩</div>
      <div><b>{{ dropActive ? 'Drop packages here' : 'Drag & drop Tec-Tac packages here' }}</b><span>Multiple .zip, .tgz and .tar.gz packages are supported. A bundle can be dropped as a single file.</span></div>
      <button class="btn sm" type="button" :disabled="!canManage || jobRunning || inspecting" @click.stop="pick">Browse files</button>
    </div>

    <div v-if="pendingFiles.length && !staged" class="package-queue">
      <div class="queue-head"><span class="eyebrow">FILES TO INSPECT</span><span class="mono muted">{{ pendingFiles.length }} file{{ pendingFiles.length===1?'':'s' }}</span></div>
      <div v-for="(file,index) in pendingFiles" :key="fileKey(file)" class="queue-row">
        <span class="queue-grip" aria-hidden="true">⋮⋮</span>
        <span class="queue-index mono">{{ index+1 }}</span>
        <div class="queue-main"><b>{{ file.name }}</b><span>{{ (file.size/1024).toFixed(1) }} KB</span></div>
        <div class="queue-actions"><button class="iconbtn" :disabled="index===0" title="Move up" @click="movePending(index,-1)">↑</button><button class="iconbtn" :disabled="index===pendingFiles.length-1" title="Move down" @click="movePending(index,1)">↓</button><button class="iconbtn" title="Remove" @click="removePending(index)">×</button></div>
      </div>
      <div class="queue-footer"><button class="btn" @click="pendingFiles=[]">Clear</button><span class="spacer"></span><button class="btn primary" :disabled="inspecting" @click="inspectPending">{{ inspecting ? 'Inspecting…' : `Inspect ${pendingFiles.length} file${pendingFiles.length===1?'':'s'}` }}</button></div>
    </div>

    <div v-if="staged" class="install-plan-workspace">
      <div class="state-inline" :class="plan?.valid ? '' : 'warning'"><b>{{ plan?.valid ? 'Dependency plan resolved.' : 'Installation blocked.' }}</b> {{ plan?.valid ? 'Required dependency sequence is enforced. Independent packages may be reordered.' : 'Resolve the dependency/version problems before installation.' }}</div>
      <div v-if="queueWarning" class="state-inline warning mt"><b>Order not changed.</b> {{ queueWarning }}</div>

      <div class="queue-head mt"><span class="eyebrow">INSTALL SEQUENCE</span><span class="mono muted">{{ orderedRows.length }} package{{ orderedRows.length===1?'':'s' }}</span></div>
      <div
        v-for="(row,index) in orderedRows"
        :key="row.id"
        class="queue-row inspected"
        draggable="true"
        @dragstart="dragStart(row.id)"
        @dragover.prevent
        @drop.prevent="dropOn(row.id)"
      >
        <span class="queue-grip" title="Drag to reorder independent packages">⋮⋮</span>
        <span class="queue-index mono">{{ index+1 }}</span>
        <div class="queue-main"><b>{{ row.id }}</b><span class="mono">v{{ row.version || row.extension_version || '—' }}</span></div>
        <div class="queue-deps"><span class="label">REQUIRES</span><span class="mono">{{ Object.keys(row.dependencies||{}).length ? Object.entries(row.dependencies||{}).map(([id,v])=>`${id} ${v}`).join(' · ') : 'none' }}</span></div>
        <span class="pill" :class="row.action==='replace'?'warn':'ok'">{{ row.action || 'install' }}</span>
        <div class="queue-actions"><button class="iconbtn" :disabled="index===0" title="Move up" @click="moveInspected(row.id,-1)">↑</button><button class="iconbtn" :disabled="index===orderedRows.length-1" title="Move down" @click="moveInspected(row.id,1)">↓</button></div>
      </div>

      <template v-if="plan?.problems?.length">
        <div class="section-divider">Blocking problems</div>
        <div v-for="(problem,index) in plan.problems" :key="index" class="state-inline warning mt"><span class="mono">{{ problem.module || 'plan' }}</span> — {{ problem.type }}<span v-if="problem.dependency">: {{ problem.dependency }} {{ problem.constraint }}</span></div>
      </template>

      <div class="queue-footer"><button class="btn" @click="clearStaged">Cancel / discard</button><span class="spacer"></span><span class="muted smalltext">The framework validates this sequence again before execution.</span><button class="btn primary" :disabled="!plan?.valid || !orderedRows.length" @click="install">Install {{ orderedRows.length }} package{{ orderedRows.length===1?'':'s' }}</button></div>
    </div>
  </section>

  <div class="grid g4 mb"><article class="tile"><div class="lbl">Installed</div><div class="big">{{ modules.filter(x=>x.managed).length }}</div><div class="brk">managed modules</div></article><article class="tile"><div class="lbl">Enabled</div><div class="big">{{ enabledCount }}</div><div class="brk">active at runtime</div></article><article class="tile"><div class="lbl">Disabled</div><div class="big">{{ disabledCount }}</div><div class="brk">installed, inactive</div></article><article class="tile"><div class="lbl">Dependencies</div><div class="big">{{ dependencyCount }}</div><div class="brk">hard dependency links</div></article></div>

  <div v-if="loading" class="callout mono">Loading Module Management v2 catalog…</div>
  <div v-else class="module-layout"><div><div class="toolbar"><label class="compact-input"><input v-model="query" placeholder="Search modules…"></label><span class="muted mono">{{ filtered.length }} shown</span><span class="spacer"></span><button class="btn sm" @click="refresh(selectedId)">Refresh</button></div><div class="tablewrap"><table><thead><tr><th>Module</th><th>Version</th><th>Runtime</th><th>Dependencies</th><th>Dependants</th><th>UI</th><th>Status</th></tr></thead><tbody><tr v-for="item in filtered" :key="item.id" class="clickrow" :class="{selected:selectedId===item.id}" @click="selectedId=item.id"><td><b>{{ item.id }}</b><span v-if="item.protected" class="sub">protected</span></td><td class="mono">{{ item.extension_version||'—' }}</td><td><span class="pill" :class="item.enabled?'ok':'warn'">{{ item.enabled?'enabled':'disabled' }}</span></td><td class="mono">{{ Object.keys(item.dependencies||{}).length }}</td><td class="mono">{{ item.dependants?.length||0 }}</td><td>{{ item.authenticated_ui_enabled?'admin':(item.public_ui_enabled?'public':'—') }}</td><td><span class="pill" :class="item.status==='enabled'?'ok':'warn'">{{ item.status }}</span></td></tr></tbody></table></div></div>
    <aside v-if="selected" class="module-detail card"><div class="cardhead"><div><span class="eyebrow">MODULE DETAIL</span><h3>{{ selected.id }}</h3></div><span class="pill" :class="selected.enabled?'ok':'warn'">{{ selected.enabled?'ENABLED':'DISABLED' }}</span></div><dl class="kvlist module-kv"><dt>Extension</dt><dd class="mono">v{{ selected.extension_version }}</dd><dt>ReportSet</dt><dd class="mono">v{{ selected.reportset_version }}</dd><dt>Managed</dt><dd>{{ selected.managed?'yes':'no' }}</dd><dt>Permissions</dt><dd>{{ selected.permission_count||0 }}</dd></dl><div class="section-divider">Hard dependencies</div><div v-if="!Object.keys(selected.dependencies||{}).length" class="muted smalltext">None</div><div v-for="(constraint,id) in selected.dependencies" :key="id" class="module-meta"><b>{{ id }}</b><span class="mono">{{ constraint }}</span></div><div class="section-divider">Required by</div><div v-if="!selected.dependants?.length" class="muted smalltext">No installed dependants</div><div v-for="d in selected.dependants" :key="d.id" class="module-meta"><b>{{ d.id }}</b><span class="mono">{{ d.constraint }}</span></div><div v-if="selected.runtime_requirements?.length" class="section-divider">Runtime requirements</div><div v-for="r in selected.runtime_requirements" :key="r.component" class="module-meta"><b>{{ r.component }}</b><span class="mono">{{ r.current||'unknown' }} / {{ r.constraint }} {{ r.satisfied?'✓':'✕' }}</span></div><div v-if="selected.managed" class="module-actions"><button v-if="selected.enabled" class="btn warnbtn" :disabled="!canManage||jobRunning" @click="ask(selected,'disable')">Disable</button><button v-else class="btn primary" :disabled="!canManage||jobRunning" @click="ask(selected,'enable')">Enable</button><button class="btn danger" :disabled="!canManage||jobRunning" @click="ask(selected,'remove')">Remove</button></div></aside>
  </div>

  <div v-if="activeJob" class="job-panel card mt"><div class="cardhead"><div><span class="eyebrow">MODULE JOB</span><h3>{{ activeJob.action }} / {{ activeJob.plugin_id }}</h3></div><span class="pill" :class="activeJob.status==='succeeded'?'ok':'warn'">{{ activeJob.status }}</span></div><div v-if="activeJob.error" class="auth-error">{{ activeJob.error }}</div><pre v-if="activeJob.log_tail?.length" class="job-log">{{ activeJob.log_tail.join('\n') }}</pre><div v-if="activeJob.status==='succeeded'" class="row"><button class="btn primary" @click="reloadTecTac">Reload Tec-Tac</button></div></div>

  <div v-if="confirmTarget" class="modal-backdrop" @click.self="closeConfirm"><section class="modal-panel"><div class="cardhead"><div><span class="eyebrow">{{ confirmMode.toUpperCase() }} MODULE</span><h3>{{ confirmTarget.id }}</h3></div><span class="pill warn">RUNTIME CHANGE</span></div><p v-if="confirmMode==='disable'&&confirmTarget.dependants?.length" class="compact-copy">Enabled dependants may block this action. Select cascade to disable dependent modules first.</p><label v-if="confirmMode==='disable'&&confirmTarget.dependants?.length" class="checkline warning-check"><input v-model="cascade" type="checkbox"> Disable enabled dependants as part of this job</label><label class="field"><span>Type {{ confirmTarget.id }} to confirm</span><input v-model="confirmText" autocomplete="off"></label><div class="modal-actions"><button class="btn" :class="confirmMode==='enable'?'primary':'danger'" :disabled="confirmText!==confirmTarget.id" @click="confirmAction">{{ confirmMode }} module</button><button class="btn" @click="closeConfirm">Cancel</button></div></section></div>
</section>
</template>
