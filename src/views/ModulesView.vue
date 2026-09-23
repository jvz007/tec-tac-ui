<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  addModuleRepository,
  checkModuleRemoval,
  deleteModuleRepository,
  discardModuleArtifact,
  getModuleJob,
  listModuleJobs,
  inspectModulePackages,
  inspectModuleHotfix,
  discardModuleHotfix,
  applyModuleHotfix,
  getModuleHotfixJob,
  listModuleHotfixes,
  rollbackModuleHotfix,
  installModuleArtifact,
  listModuleRepositories,
  listOnlineModuleCatalog,
  listModules,
  removeModule,
  stageOnlineModulePackage,
  syncAllModuleRepositories,
  syncModuleRepository,
  setModuleEnabled,
  setModuleVisible,
  updateModuleRepository,
} from '../modules'

const state = inject('tecTacState')
const dynamicNav = inject('tecTacNavigation', [])
const router = useRouter()
const modules = ref([])
const loading = ref(true)
const error = ref('')
const query = ref('')
const activeTab = ref('installed')
const repositories = ref([])
const jobHistory = ref([])
const historyLoading = ref(false)
const historySelectedId = ref(null)
const hotfixFileInput = ref(null)
const hotfixFile = ref(null)
const hotfixInspecting = ref(false)
const hotfixStaged = ref(null)
const hotfixJob = ref(null)
const hotfixJobError = ref('')
const hotfixSelectedModuleId = ref(null)
const hotfixRows = ref([])
const hotfixLoading = ref(false)
let hotfixPollTimer = null
const onlineCatalog = ref([])
const onlineQuery = ref('')
const repositoryBusy = ref(false)
const catalogBusy = ref(false)
const selectedRepositoryId = ref(null)
const repositoryDraft = ref({ name: '', url: '', priority: 100, trust: 'custom', enabled: true })
const editingRepository = ref(false)
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
const jobPollError = ref('')
const confirmTarget = ref(null)
const confirmMode = ref('')
const confirmText = ref('')
const cascade = ref(false)
const reinstallTarget = ref(null)
let pollTimer = null
let reloadTimer = null
const reloadCountdown = ref(0)

const canManage = computed(() => managerAllowed.value && state.context.capabilities?.manage_modules !== false)
const filtered = computed(() => modules.value.filter((x) => !query.value.trim() || [x.id, x.status, x.extension_version].some((v) => String(v || '').toLowerCase().includes(query.value.toLowerCase()))))
const filteredOnline = computed(() => onlineCatalog.value.filter((x) => !onlineQuery.value.trim() || [x.id, x.name, x.installed_version, x.latest_version, x.selected_repository_name].some((v) => String(v || '').toLowerCase().includes(onlineQuery.value.toLowerCase()))))
const updatesAvailable = computed(() => onlineCatalog.value.filter((x) => x.update_available).length)
const repositoryErrors = computed(() => repositories.value.filter((x) => x.sync?.status === 'error').length)
const selectedRepository = computed(() => repositories.value.find((x) => x.id === selectedRepositoryId.value) || null)
const selected = computed(() => modules.value.find((x) => x.id === selectedId.value) || null)
const selectedHistory = computed(() => jobHistory.value.find((x) => x.id === historySelectedId.value) || null)
const hotfixedModules = computed(() => modules.value.filter((x) => Number(x.hotfixes?.count || 0) > 0))
const hotfixPreview = computed(() => hotfixStaged.value?.preview || null)
const hotfixJobRunning = computed(() => hotfixJob.value && !['succeeded','failed','dispatch_failed'].includes(hotfixJob.value.status))
const enabledCount = computed(() => modules.value.filter((x) => x.managed && x.enabled).length)
const disabledCount = computed(() => modules.value.filter((x) => x.managed && !x.enabled).length)
const hiddenCount = computed(() => modules.value.filter((x) => x.managed && x.enabled && x.visible === false).length)
const dependencyCount = computed(() => modules.value.reduce((n, x) => n + Object.keys(x.dependencies || {}).length, 0))
const jobRunning = computed(() => activeJob.value && !['succeeded', 'failed', 'dispatch_failed'].includes(activeJob.value.status))
const moduleJobProgress = computed(() => {
  const job = activeJob.value
  if (!job) return 0
  if (job.status === 'succeeded' || job.stage === 'complete') return 100
  if (['failed', 'dispatch_failed'].includes(job.status)) return 100
  const stage = String(job.stage || job.status || '').toLowerCase()
  if (stage.includes('rollback')) return 85
  if (stage.includes('runtime-sync') || stage.includes('ui-sync')) return 82
  if (stage.includes('lifecycle') || stage.includes('install')) return 55
  if (stage.includes('dispatch')) return 18
  if (job.status === 'running') return 35
  return 8
})
const moduleJobProgressLabel = computed(() => {
  if (!activeJob.value) return ''
  if (activeJob.value.status === 'succeeded') return reloadCountdown.value > 0 ? `Complete · reloading in ${reloadCountdown.value}s` : 'Complete'
  if (['failed', 'dispatch_failed'].includes(activeJob.value.status)) return 'Failed'
  return String(activeJob.value.stage || activeJob.value.status || 'queued').replace(/-/g, ' ')
})
const preview = computed(() => staged.value?.preview || staged.value)
const plan = computed(() => preview.value?.plan || staged.value?.plan || null)
const artifactKind = computed(() => staged.value?.kind || preview.value?.kind || 'artifact')
const stagedSourceLabel = computed(() => staged.value?.source?.repository_name || staged.value?.source?.type || 'offline')
const stagedHash = computed(() => staged.value?.sha256 || staged.value?.source?.package_sha256 || '—')
const stagedArtifactLabel = computed(() => {
  if (staged.value?.filename) return staged.value.filename
  if (artifactKind.value === 'batch') return 'Multiple packages'
  if (artifactKind.value === 'bundle') return preview.value?.id || 'Bundle'
  return preview.value?.id || 'Module package'
})
const failedModuleLoads = computed(() => state.moduleLoad?.failed || [])
const skippedModuleLoads = computed(() => state.moduleLoad?.skipped || [])
const loadedModuleIds = computed(() => new Set(state.moduleLoad?.loaded || []))

function moduleLoadDiagnostic(item) {
  if (!item) return { state: 'unknown', label: 'unknown', detail: '' }
  if (!item.authenticated_ui_enabled) {
    if (item.public_ui_enabled) return { state: 'public', label: 'public only', detail: 'No authenticated UI entry is registered for this module.' }
    return { state: 'none', label: 'none', detail: 'This module does not expose an authenticated UI entry.' }
  }
  if (!item.enabled) return { state: 'disabled', label: 'disabled', detail: 'Runtime is disabled, so the authenticated UI is not loaded.' }

  const failed = failedModuleLoads.value.find((entry) => entry.id === item.id)
  if (failed) return { state: 'failed', label: 'failed', detail: failed.message || 'Module import or registration failed.' }

  const skipped = skippedModuleLoads.value.find((entry) => entry.id === item.id)
  if (skipped) return { state: 'skipped', label: 'skipped', detail: skipped.reason || 'Module UI was skipped.' }

  if (loadedModuleIds.value.has(item.id)) return { state: 'loaded', label: 'loaded', detail: 'Authenticated UI imported and registered successfully.' }
  return { state: 'unknown', label: 'not reported', detail: 'The module has an authenticated UI entry but the current shell has not reported a load result.' }
}

const selectedLoad = computed(() => moduleLoadDiagnostic(selected.value))
const selectedNavigation = computed(() => dynamicNav.find((item) => item?.moduleId === selected.value?.id && item?.to) || null)
const canOpenSelected = computed(() => Boolean(selected.value?.enabled && selectedLoad.value.state === 'loaded' && selectedNavigation.value?.to))
function openSelectedModule() { if (canOpenSelected.value) router.push(selectedNavigation.value.to) }

const stagedRows = computed(() => {
  if (!staged.value) return []
  let rows = []
  if (artifactKind.value === 'batch') {
    const artifacts = new Map((staged.value.artifacts || []).map((item) => [item.upload_id, item]))
    rows = (staged.value.packages || []).map((item) => {
      const previewRow = item.preview || item
      const artifact = artifacts.get(item.source_upload_id) || {}
      const sourceKind = item.source_kind || artifact.kind || 'package'
      return {
        ...previewRow,
        intake_filename: item.source_filename || artifact.filename || previewRow.id || 'package',
        intake_source: sourceKind === 'bundle'
          ? `bundle · ${item.source_bundle_id || item.source_filename || 'package'}`
          : (artifact.source?.repository_name || artifact.source?.type || 'offline'),
        intake_sha256: item.sha256 || artifact.sha256 || artifact.source?.package_sha256 || '',
      }
    })
  } else if (artifactKind.value === 'bundle') {
    rows = (preview.value?.packages || []).map((item) => ({
      ...item,
      intake_filename: staged.value.filename || preview.value?.id || 'bundle',
      intake_source: `bundle · ${preview.value?.id || staged.value.filename || 'package'}`,
      intake_sha256: staged.value.sha256 || '',
    }))
  } else {
    rows = preview.value ? [{
      ...preview.value,
      intake_filename: staged.value.filename || preview.value.id || 'package',
      intake_source: stagedSourceLabel.value,
      intake_sha256: stagedHash.value === '—' ? '' : stagedHash.value,
    }] : []
  }
  const actions = new Map((plan.value?.actions || []).map((item) => [item.id, item]))
  return rows.map((item) => ({ ...item, ...(actions.get(item.id) || {}) }))
})

function moduleTargetVersion(row) { return row?.version || row?.extension_version || '—' }
function moduleRequirements(row) {
  const entries = Object.entries(row?.dependencies || {})
  return entries.length ? entries.map(([id, constraint]) => `${id} ${constraint}`).join(' · ') : 'none'
}
function compactHash(value) {
  const hash = String(value || '').trim()
  return hash ? `${hash.slice(0, 12)}…` : '—'
}

const orderedRows = computed(() => {
  const byId = new Map(stagedRows.value.map((row) => [row.id, row]))
  return installOrder.value.map((id) => byId.get(id)).filter(Boolean)
})

async function loadRepositories() {
  try {
    const payload = await listModuleRepositories()
    repositories.value = payload.repositories || []
    if (selectedRepositoryId.value && !repositories.value.some((x) => x.id === selectedRepositoryId.value)) selectedRepositoryId.value = null
  } catch (e) {
    error.value = e.message || 'Unable to load module repositories.'
  }
}

async function loadOnlineCatalog() {
  catalogBusy.value = true
  try {
    const payload = await listOnlineModuleCatalog()
    onlineCatalog.value = payload.modules || []
    if (payload.repositories) repositories.value = payload.repositories
  } catch (e) {
    error.value = e.message || 'Unable to load online module catalog.'
  } finally {
    catalogBusy.value = false
  }
}

async function syncAllRepositories() {
  if (!canManage.value || repositoryBusy.value) return
  repositoryBusy.value = true
  error.value = ''
  try {
    await syncAllModuleRepositories()
    await Promise.all([loadRepositories(), loadOnlineCatalog()])
  } catch (e) {
    error.value = e.message || 'Unable to sync module repositories.'
  } finally {
    repositoryBusy.value = false
  }
}

async function syncRepository(item) {
  if (!item || !canManage.value || repositoryBusy.value) return
  repositoryBusy.value = true
  error.value = ''
  try {
    await syncModuleRepository(item.id)
    await Promise.all([loadRepositories(), loadOnlineCatalog()])
  } catch (e) {
    error.value = e.message || `Unable to sync ${item.name}.`
  } finally {
    repositoryBusy.value = false
  }
}

function newRepository() {
  selectedRepositoryId.value = null
  repositoryDraft.value = { name: '', url: '', priority: 100, trust: 'custom', enabled: true }
  editingRepository.value = true
}

function editRepository(item) {
  selectedRepositoryId.value = item.id
  repositoryDraft.value = { name: item.name, url: item.url, priority: item.priority, trust: item.trust, enabled: item.enabled }
  editingRepository.value = true
}

function cancelRepositoryEdit() {
  editingRepository.value = false
  selectedRepositoryId.value = null
}

async function saveRepository() {
  if (!canManage.value || repositoryBusy.value) return
  repositoryBusy.value = true
  error.value = ''
  try {
    if (selectedRepositoryId.value) await updateModuleRepository(selectedRepositoryId.value, repositoryDraft.value)
    else await addModuleRepository(repositoryDraft.value)
    editingRepository.value = false
    selectedRepositoryId.value = null
    await loadRepositories()
  } catch (e) {
    error.value = e.message || 'Unable to save module repository.'
  } finally {
    repositoryBusy.value = false
  }
}

async function toggleRepository(item) {
  if (!canManage.value || repositoryBusy.value) return
  repositoryBusy.value = true
  error.value = ''
  try {
    await updateModuleRepository(item.id, { ...item, enabled: !item.enabled })
    await Promise.all([loadRepositories(), loadOnlineCatalog()])
  } catch (e) {
    error.value = e.message || 'Unable to change repository state.'
  } finally {
    repositoryBusy.value = false
  }
}

async function removeRepository(item) {
  if (!item || !canManage.value || repositoryBusy.value) return
  if (!window.confirm(`Remove repository ${item.name}? Installed modules remain installed and keep their recorded source provenance.`)) return
  repositoryBusy.value = true
  error.value = ''
  try {
    await deleteModuleRepository(item.id)
    await Promise.all([loadRepositories(), loadOnlineCatalog()])
  } catch (e) {
    error.value = e.message || 'Unable to remove repository.'
  } finally {
    repositoryBusy.value = false
  }
}

function sameOnlineVersion(item) {
  return Boolean(
    item?.installed
    && item?.installed_version
    && item?.latest_version
    && String(item.installed_version) === String(item.latest_version)
  )
}

function requestStageOnline(item) {
  if (sameOnlineVersion(item)) {
    reinstallTarget.value = item
    return
  }
  stageOnline(item)
}

function closeReinstallConfirm() { reinstallTarget.value = null }

async function confirmReinstall() {
  const item = reinstallTarget.value
  if (!item) return
  reinstallTarget.value = null
  await stageOnline(item)
}

async function stageOnline(item) {
  if (!item?.selected_repository_id || !item?.latest_version || !canManage.value || inspecting.value || jobRunning.value) return
  inspecting.value = true
  error.value = ''
  try {
    staged.value = await stageOnlineModulePackage(item.selected_repository_id, item.id, item.latest_version)
    installOrder.value = [...(plan.value?.order || stagedRows.value.map((row) => row.id))]
    activeTab.value = 'installed'
  } catch (e) {
    error.value = e.message || 'Unable to download and inspect online module package.'
  } finally {
    inspecting.value = false
  }
}

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


async function setVisibility(item, visible) {
  if (!item || !canManage.value || jobRunning.value) return
  try {
    const job = await setModuleVisible(item.id, visible)
    beginPoll(job)
  } catch (e) {
    error.value = e.message || 'Unable to change module visibility.'
  }
}

async function loadJobHistory(){
  if(!canManage.value) return
  historyLoading.value=true
  try{const data=await listModuleJobs(250);jobHistory.value=data.jobs||[];if(historySelectedId.value&&!jobHistory.value.some(x=>x.id===historySelectedId.value))historySelectedId.value=null}catch(e){error.value=e?.message||'Unable to load module history.'}finally{historyLoading.value=false}
}
function historyTime(value){return value?new Date(value).toLocaleString():'—'}
function historyModules(job){return (job.module_ids?.length?job.module_ids:[job.plugin_id]).filter(Boolean).join(', ')||'—'}

function chooseHotfixFile(){ hotfixFileInput.value?.click() }
function hotfixFileChanged(event){ hotfixFile.value=event?.target?.files?.[0]||null; hotfixStaged.value=null; hotfixJobError.value='' }
async function inspectHotfix(){
  if(!hotfixFile.value||!canManage.value||hotfixInspecting.value) return
  hotfixInspecting.value=true; hotfixJobError.value=''
  try{ hotfixStaged.value=await inspectModuleHotfix(hotfixFile.value); hotfixSelectedModuleId.value=hotfixPreview.value?.module_id||null; if(hotfixSelectedModuleId.value) await loadHotfixRows(hotfixSelectedModuleId.value) }
  catch(e){ hotfixJobError.value=e?.message||'Unable to inspect hotfix.' }
  finally{ hotfixInspecting.value=false }
}
async function discardHotfixStage(){
  const id=hotfixStaged.value?.upload_id
  try{ if(id) await discardModuleHotfix(id) }catch{}
  hotfixStaged.value=null; hotfixFile.value=null; if(hotfixFileInput.value) hotfixFileInput.value.value=''
}
async function loadHotfixRows(moduleId=hotfixSelectedModuleId.value){
  if(!moduleId||!canManage.value){hotfixRows.value=[];return}
  hotfixSelectedModuleId.value=moduleId; hotfixLoading.value=true; hotfixJobError.value=''
  try{ const data=await listModuleHotfixes(moduleId); hotfixRows.value=data.hotfixes||[] }
  catch(e){ hotfixRows.value=[]; hotfixJobError.value=e?.message||'Unable to load applied hotfixes.' }
  finally{ hotfixLoading.value=false }
}
async function applyHotfix(){
  const id=hotfixStaged.value?.upload_id
  if(!id||hotfixJobRunning.value) return
  hotfixJobError.value=''
  try{ hotfixJob.value=await applyModuleHotfix(id); beginHotfixPoll() }
  catch(e){ hotfixJobError.value=e?.message||'Unable to apply hotfix.' }
}
async function rollbackHotfix(row){
  const moduleId=hotfixSelectedModuleId.value
  if(!moduleId||!row?.id||hotfixJobRunning.value) return
  if(!window.confirm(`Roll back hotfix ${row.id} from ${moduleId}? Hotfixes must be rolled back newest first.`)) return
  hotfixJobError.value=''
  try{ hotfixJob.value=await rollbackModuleHotfix(moduleId,row.id); beginHotfixPoll() }
  catch(e){ hotfixJobError.value=e?.message||'Unable to roll back hotfix.' }
}
function beginHotfixPoll(){ clearTimeout(hotfixPollTimer); hotfixPollTimer=setTimeout(pollHotfixJob,100) }
async function pollHotfixJob(){
  if(!hotfixJob.value?.id) return
  try{
    hotfixJob.value=await getModuleHotfixJob(hotfixJob.value.id); hotfixJobError.value=''
    if(['succeeded','failed','dispatch_failed'].includes(hotfixJob.value.status)){
      if(hotfixJob.value.status==='succeeded'){
        const moduleId=hotfixJob.value.module_id||hotfixSelectedModuleId.value
        await refresh(moduleId); await loadHotfixRows(moduleId); hotfixStaged.value=null; hotfixFile.value=null; if(hotfixFileInput.value) hotfixFileInput.value.value=''
      }
      return
    }
  }catch(e){ hotfixJobError.value=e?.message||'Unable to refresh hotfix job status.' }
  hotfixPollTimer=setTimeout(pollHotfixJob,1500)
}
function beginPoll(job) {
  activeJob.value = job
  jobPollError.value = ''
  reloadCountdown.value = 0
  clearTimeout(pollTimer)
  clearInterval(reloadTimer)
  pollTimer = setTimeout(poll, 100)
}
function scheduleReload() {
  if (reloadTimer) return
  reloadCountdown.value = 5
  reloadTimer = window.setInterval(() => {
    reloadCountdown.value -= 1
    if (reloadCountdown.value <= 0) {
      clearInterval(reloadTimer)
      reloadTimer = null
      window.location.reload()
    }
  }, 1000)
}
async function poll() {
  if (!activeJob.value?.id) return
  try {
    activeJob.value = await getModuleJob(activeJob.value.id)
    jobPollError.value = ''
    if (['succeeded', 'failed', 'dispatch_failed'].includes(activeJob.value.status)) {
      await loadJobHistory()
      if (activeJob.value.status === 'succeeded') {
        // Module lifecycle jobs may replace dynamically imported browser code.
        // sync-modules.sh has already regenerated content-versioned entry URLs;
        // reload the shell so the browser consumes the new manifest and module.
        scheduleReload()
        return
      }
      await refresh(activeJob.value.plugin_id)
      await loadOnlineCatalog()
      return
    }
  } catch (e) {
    jobPollError.value = e?.message || 'Unable to refresh module job status.'
  }
  pollTimer = setTimeout(poll, 1800)
}
function reloadTecTac() { window.location.reload() }
onMounted(async () => { await refresh(); await Promise.all([loadRepositories(), loadOnlineCatalog(), loadJobHistory()]) })
onBeforeUnmount(() => { clearTimeout(pollTimer); clearTimeout(hotfixPollTimer); clearInterval(reloadTimer) })
</script>

<template>
<section>
  <div class="phead">
    <div><span class="eyebrow">MODULE MANAGEMENT V2</span><h1>Modules</h1><p>Install packages or bundles, control runtime and navigation visibility, and validate dependency/version requirements before Tec-Tac changes anything.</p></div>
  </div>

  <div v-if="activeJob" class="lifecycle-progress" :class="{ failed: ['failed','dispatch_failed'].includes(activeJob.status), complete: activeJob.status === 'succeeded' }">
    <div class="lifecycle-progress-head"><span><b>Module lifecycle</b> · {{ moduleJobProgressLabel }}</span><span class="mono">{{ moduleJobProgress }}%</span></div>
    <div class="lifecycle-progress-track"><div class="lifecycle-progress-fill" :style="{ width: `${moduleJobProgress}%` }"></div></div>
  </div>

  <div v-if="error" class="auth-error">{{ error }}</div>
  <div v-if="failedModuleLoads.length" class="state-inline denied module-load-summary" role="alert">
    <b>{{ failedModuleLoads.length }} module UI load failure{{ failedModuleLoads.length === 1 ? '' : 's' }}.</b>
    Open the affected module in the table for the browser-side import/register error.
  </div>
  <div v-if="!canManage && !loading" class="state-inline warning"><b>Read-only module catalog.</b> Tactical <span class="mono">can_do_server_maint</span> is required.</div>

  <div class="subtabs module-tabs mb" role="tablist" aria-label="Module management views">
    <button :class="{active:activeTab==='installed'}" role="tab" @click="activeTab='installed'"><b>Installed</b><span>{{ modules.filter(x=>x.managed).length }} managed · {{ failedModuleLoads.length }} UI failures</span></button>
    <button :class="{active:activeTab==='online'}" role="tab" @click="activeTab='online'"><b>Online catalog</b><span>{{ onlineCatalog.length }} modules · {{ updatesAvailable }} updates</span></button>
    <button :class="{active:activeTab==='repositories'}" role="tab" @click="activeTab='repositories'"><b>Repositories</b><span>{{ repositories.length }} configured · {{ repositoryErrors }} errors</span></button>
    <button v-if="canManage" :class="{active:activeTab==='hotfixes'}" role="tab" @click="activeTab='hotfixes'"><b>Hotfixes</b><span>{{ hotfixedModules.length }} hotfixed modules</span></button>
    <button v-if="canManage" :class="{active:activeTab==='history'}" role="tab" @click="activeTab='history';loadJobHistory()"><b>History</b><span>{{ jobHistory.length }} lifecycle records</span></button>
  </div>

  <template v-if="activeTab==='installed'">
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
      <div class="card update-preview module-package-preview">
        <div class="cardhead module-inspection-head">
          <div><span class="eyebrow">PACKAGE INSPECTION</span><h3>{{ orderedRows.length }} module{{ orderedRows.length===1?'':'s' }} ready for review</h3><p>{{ stagedArtifactLabel }} · {{ stagedSourceLabel }}</p></div>
          <span class="pill" :class="plan?.valid ? 'ok' : 'warn'">{{ plan?.valid ? 'INSTALLABLE' : 'BLOCKED' }}</span>
        </div>
        <div class="module-inspection-grid">
          <div class="module-inspection-grid-head" aria-hidden="true">
            <span>Module</span><span>Installed</span><span>Package</span><span>Action</span><span>Source</span><span>SHA256</span><span>Requires</span>
          </div>
          <div v-for="row in orderedRows" :key="`inspect-${row.id}`" class="module-inspection-grid-row">
            <div class="module-inspection-name"><b>{{ row.id }}</b><span class="mono">{{ row.intake_filename }}</span></div>
            <div data-label="Installed" class="mono">{{ row.current_version || 'not installed' }}</div>
            <div data-label="Package" class="mono module-target-version">{{ moduleTargetVersion(row) }}</div>
            <div data-label="Action"><span class="pill" :class="row.action==='replace'?'warn':'ok'">{{ row.action || 'install' }}</span></div>
            <div data-label="Source" class="module-inspection-source">{{ row.intake_source || stagedSourceLabel }}</div>
            <div data-label="SHA256" class="mono module-inspection-hash" :title="row.intake_sha256 || ''">{{ compactHash(row.intake_sha256) }}</div>
            <div data-label="Requires" class="mono module-inspection-requires" :title="moduleRequirements(row)">{{ moduleRequirements(row) }}</div>
          </div>
        </div>
      </div>
      <div class="state-inline mt" :class="plan?.valid ? '' : 'warning'"><b>{{ plan?.valid ? 'Dependency plan resolved.' : 'Installation blocked.' }}</b> {{ plan?.valid ? 'Required dependency sequence is enforced. Independent packages may be reordered.' : 'Resolve the dependency/version problems before installation.' }}</div><div v-if="staged.source" class="state-inline mt"><b>Online source:</b> {{ staged.source.repository_name }} <span class="mono">· {{ staged.source.repository_trust }} · {{ staged.source.package_sha256.slice(0,12) }}…</span></div>
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
        <div class="queue-main"><b>{{ row.id }}</b><span class="mono">{{ row.current_version || 'not installed' }} → {{ row.version || row.extension_version || '—' }}</span></div>
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

  <div class="grid g4 mb"><article class="tile"><div class="lbl">Installed</div><div class="big">{{ modules.filter(x=>x.managed).length }}</div><div class="brk">managed modules</div></article><article class="tile"><div class="lbl">Enabled</div><div class="big">{{ enabledCount }}</div><div class="brk">active at runtime</div></article><article class="tile"><div class="lbl">Disabled</div><div class="big">{{ disabledCount }}</div><div class="brk">installed, inactive</div></article><article class="tile"><div class="lbl">Hidden</div><div class="big">{{ hiddenCount }}</div><div class="brk">active, not in navigation</div></article></div>

  <div v-if="loading" class="callout mono">Loading Module Management v2 catalog…</div>
  <div v-else class="module-layout"><div><div class="toolbar"><label class="compact-input"><input v-model="query" placeholder="Search modules…"></label><span class="muted mono">{{ filtered.length }} shown</span><span class="spacer"></span><button class="btn sm" @click="refresh(selectedId)">Refresh</button></div><div class="tablewrap"><table><thead><tr><th>Module</th><th>Version</th><th>Runtime</th><th>Visibility</th><th>Dependencies</th><th>Dependants</th><th>UI Load</th><th>Status</th></tr></thead><tbody><tr v-for="item in filtered" :key="item.id" class="clickrow" :class="{selected:selectedId===item.id}" @click="selectedId=item.id"><td><b>{{ item.id }}</b><span v-if="item.protected" class="sub">protected</span></td><td class="mono">{{ item.extension_version||'—' }}</td><td><span class="pill" :class="item.enabled?'ok':'warn'">{{ item.enabled?'enabled':'disabled' }}</span></td><td><span class="pill" :class="item.visible!==false?'ok':''">{{ item.visible!==false?'visible':'hidden' }}</span></td><td class="mono">{{ Object.keys(item.dependencies||{}).length }}</td><td class="mono">{{ item.dependants?.length||0 }}</td><td><span class="pill" :class="{ok:moduleLoadDiagnostic(item).state==='loaded',warn:['skipped','unknown'].includes(moduleLoadDiagnostic(item).state),danger:moduleLoadDiagnostic(item).state==='failed'}">{{ moduleLoadDiagnostic(item).label }}</span></td><td><span class="pill" :class="item.status==='enabled'?'ok':'warn'">{{ item.status }}</span></td></tr></tbody></table></div></div>
    <aside v-if="selected" class="module-detail card"><div class="cardhead"><div><span class="eyebrow">MODULE DETAIL</span><h3>{{ selected.id }}</h3></div><div class="module-detail-head-actions"><span class="pill" :class="selected.enabled?'ok':'warn'">{{ selected.enabled?'ENABLED':'DISABLED' }}</span><button v-if="canOpenSelected" class="btn primary sm module-open-btn" type="button" @click="openSelectedModule">Open</button></div></div><dl class="kvlist module-kv"><dt>Extension</dt><dd class="mono">v{{ selected.extension_version }}</dd><dt>ReportSet</dt><dd class="mono">v{{ selected.reportset_version }}</dd><dt>Managed</dt><dd>{{ selected.managed?'yes':'no' }}</dd><dt>Navigation</dt><dd>{{ selected.visible!==false?'visible':'hidden' }}</dd><dt>UI load</dt><dd><span class="pill" :class="{ok:selectedLoad.state==='loaded',warn:['skipped','unknown'].includes(selectedLoad.state),danger:selectedLoad.state==='failed'}">{{ selectedLoad.label }}</span></dd><dt>Source</dt><dd class="module-source">{{ selected.source?.repository_name || selected.source?.repository_id || 'local / offline' }}</dd><dt>SHA256</dt><dd class="mono module-source">{{ selected.source?.package_sha256 ? selected.source.package_sha256.slice(0,16)+'…' : '—' }}</dd><dt>Permissions</dt><dd>{{ selected.permission_count||0 }}</dd></dl><div v-if="selectedLoad.state==='failed'" class="state-inline denied module-load-error"><b>Authenticated UI failed to load.</b><code>{{ selectedLoad.detail }}</code><span>Runtime and visibility state are unchanged; fix the module UI package and reload Tec-Tac.</span></div><div v-else-if="selectedLoad.state==='skipped' || selectedLoad.state==='unknown'" class="state-inline warning module-load-error"><b>Authenticated UI {{ selectedLoad.label }}.</b><code>{{ selectedLoad.detail }}</code></div><div class="section-divider">Hard dependencies</div><div v-if="!Object.keys(selected.dependencies||{}).length" class="muted smalltext">None</div><div v-for="(constraint,id) in selected.dependencies" :key="id" class="module-meta"><b>{{ id }}</b><span class="mono">{{ constraint }}</span></div><div class="section-divider">Required by</div><div v-if="!selected.dependants?.length" class="muted smalltext">No installed dependants</div><div v-for="d in selected.dependants" :key="d.id" class="module-meta"><b>{{ d.id }}</b><span class="mono">{{ d.constraint }}</span></div><div v-if="selected.runtime_requirements?.length" class="section-divider">Runtime requirements</div><div v-for="r in selected.runtime_requirements" :key="r.component" class="module-meta"><b>{{ r.component }}</b><span class="mono">{{ r.current||'unknown' }} / {{ r.constraint }} {{ r.satisfied?'✓':'✕' }}</span></div><div v-if="selected.managed" class="module-actions"><button v-if="selected.visible!==false" class="btn" :disabled="!canManage||jobRunning" title="Keep the module active but remove its top-level navigation entry" @click="setVisibility(selected,false)">Hide</button><button v-else class="btn" :disabled="!canManage||jobRunning" title="Restore the module's top-level navigation entry" @click="setVisibility(selected,true)">Show</button><button v-if="selected.enabled" class="btn warnbtn" :disabled="!canManage||jobRunning" @click="ask(selected,'disable')">Disable</button><button v-else class="btn primary" :disabled="!canManage||jobRunning" @click="ask(selected,'enable')">Enable</button><button class="btn danger" :disabled="!canManage||jobRunning" @click="ask(selected,'remove')">Remove</button></div></aside>
  </div>

  </template>

  <template v-else-if="activeTab==='online'">
    <section class="card online-catalog-head mb">
      <div class="cardhead"><div><span class="eyebrow">ONLINE MODULE CATALOG</span><h3>Available modules</h3></div><button class="btn" :disabled="!canManage || repositoryBusy" @click="syncAllRepositories">{{ repositoryBusy ? 'Syncing…' : 'Sync repositories' }}</button></div>
      <p class="compact-copy muted">Installed modules stay pinned to their recorded repository source. Tec-Tac will not silently switch an installed module to another repository.</p>
    </section>
    <div class="toolbar"><label class="compact-input"><input v-model="onlineQuery" placeholder="Search online catalog…"></label><span class="muted mono">{{ filteredOnline.length }} shown</span><span class="spacer"></span><button class="btn sm" :disabled="catalogBusy" @click="loadOnlineCatalog">{{ catalogBusy ? 'Loading…' : 'Refresh catalog' }}</button></div>
    <div v-if="!repositories.length" class="state-inline warning"><b>No repositories configured.</b> Add a module repository before using the online catalog.</div>
    <div v-else class="tablewrap"><table><thead><tr><th>Module</th><th>Installed</th><th>Available</th><th>Source</th><th>Compatibility</th><th>Status</th><th></th></tr></thead><tbody>
      <tr v-for="item in filteredOnline" :key="item.id">
        <td><b>{{ item.name || item.id }}</b><span class="sub mono">{{ item.id }}</span></td>
        <td class="mono">{{ item.installed_version || '—' }}</td>
        <td class="mono">{{ item.latest_version || '—' }}</td>
        <td><span>{{ item.selected_repository_name || 'local only' }}</span><span v-if="item.selected_repository_trust" class="sub mono">{{ item.selected_repository_trust }}</span></td>
        <td><span v-if="item.compatible===true" class="pill ok">compatible</span><span v-else-if="item.compatible===false" class="pill danger">blocked</span><span v-else class="pill">unknown</span></td>
        <td><span v-if="item.source_conflict" class="pill danger">source unavailable</span><span v-else-if="item.update_available" class="pill warn">update available</span><span v-else-if="item.installed" class="pill ok">up to date</span><span v-else class="pill">available</span></td>
        <td class="catalog-action"><button class="btn sm" :class="item.update_available?'primary':''" :disabled="!canManage || !item.latest_version || item.compatible===false || item.source_conflict || inspecting" @click="requestStageOnline(item)">{{ item.installed ? (item.update_available ? 'Download update' : 'Reinstall') : 'Download & inspect' }}</button></td>
      </tr>
    </tbody></table></div>
  </template>

  <template v-else-if="activeTab==='repositories'">
    <div class="repository-layout">
      <section>
        <div class="toolbar"><span class="muted mono">{{ repositories.length }} repositories</span><span class="spacer"></span><button class="btn" :disabled="!canManage || repositoryBusy" @click="syncAllRepositories">Sync all</button><button class="btn primary" :disabled="!canManage || repositoryBusy" @click="newRepository">Add repository</button></div>
        <div v-if="!repositories.length" class="state-inline"><b>No module repositories configured.</b> Add an official, internal, or custom repository to populate the online catalog.</div>
        <div v-else class="tablewrap"><table><thead><tr><th>Repository</th><th>Trust</th><th>Priority</th><th>State</th><th>Sync</th><th>Modules</th><th></th></tr></thead><tbody>
          <tr v-for="repo in repositories" :key="repo.id" class="clickrow" :class="{selected:selectedRepositoryId===repo.id}" @click="editRepository(repo)">
            <td><b>{{ repo.name }}</b><span class="sub mono">{{ repo.id }}</span></td><td><span class="pill">{{ repo.trust }}</span></td><td class="mono">{{ repo.priority }}</td><td><span class="pill" :class="repo.enabled?'ok':'warn'">{{ repo.enabled?'enabled':'disabled' }}</span></td><td><span class="pill" :class="{ok:repo.sync?.status==='ok',danger:repo.sync?.status==='error',warn:repo.sync?.status==='never'}">{{ repo.sync?.status || 'never' }}</span><span v-if="repo.sync?.error" class="sub dangertext">{{ repo.sync.error }}</span></td><td class="mono">{{ repo.sync?.module_count || 0 }}</td><td><button class="btn sm" :disabled="!canManage || repositoryBusy || !repo.enabled" @click.stop="syncRepository(repo)">Sync</button></td>
          </tr>
        </tbody></table></div>
      </section>
      <aside v-if="editingRepository" class="card repository-editor">
        <div class="cardhead"><div><span class="eyebrow">REPOSITORY</span><h3>{{ selectedRepository ? 'Edit source' : 'Add source' }}</h3></div></div>
        <label class="field"><span>Name</span><input v-model="repositoryDraft.name" autocomplete="off"></label>
        <label class="field"><span>Index URL</span><input v-model="repositoryDraft.url" class="mono" autocomplete="off" placeholder="https://…/index.json"></label>
        <div class="field-grid"><label class="field"><span>Priority</span><input v-model.number="repositoryDraft.priority" type="number" min="0" max="10000"></label><label class="field"><span>Trust</span><select v-model="repositoryDraft.trust"><option value="official">Official</option><option value="internal">Internal</option><option value="custom">Custom</option></select></label></div>
        <label class="checkline"><input v-model="repositoryDraft.enabled" type="checkbox"> Enabled</label>
        <div v-if="selectedRepository?.sync?.error" class="state-inline denied mt"><b>Last sync failed.</b> {{ selectedRepository.sync.error }}</div>
        <div class="editor-actions"><button class="btn primary" :disabled="!canManage || repositoryBusy || !repositoryDraft.name || !repositoryDraft.url" @click="saveRepository">Save</button><button class="btn" @click="cancelRepositoryEdit">Cancel</button><button v-if="selectedRepository" class="btn danger" :disabled="!canManage || repositoryBusy" @click="removeRepository(selectedRepository)">Remove</button></div>
      </aside>
    </div>
  </template>

  <template v-else-if="activeTab==='hotfixes'">
    <div class="grid g2 mb">
      <section class="card">
        <div class="cardhead"><div><span class="eyebrow">MANAGED HOTFIX</span><h3>Inspect & apply</h3><p>Hotfixes are exact-version, SHA-256-bound module file replacements managed by Core.</p></div><span v-if="hotfixStaged" class="pill ok">INSPECTED</span></div>
        <input ref="hotfixFileInput" class="sr-only" type="file" accept=".zip,application/zip" @change="hotfixFileChanged">
        <div v-if="!hotfixStaged" class="drop-zone" :class="{disabled:!canManage||hotfixInspecting||hotfixJobRunning}" role="button" tabindex="0" @click="chooseHotfixFile" @keydown.enter.prevent="chooseHotfixFile">
          <b>{{ hotfixFile?.name || 'Choose managed hotfix ZIP' }}</b><span>{{ hotfixFile ? 'Ready to inspect' : 'tec_tac_hotfix.json + payload/' }}</span>
        </div>
        <div v-if="hotfixFile&&!hotfixStaged" class="row mt"><button class="btn primary" :disabled="hotfixInspecting||hotfixJobRunning" @click="inspectHotfix">{{hotfixInspecting?'Inspecting…':'Inspect hotfix'}}</button><button class="btn" @click="discardHotfixStage">Clear</button></div>
        <div v-if="hotfixStaged" class="hotfix-preview">
          <dl class="kvlist"><dt>Module</dt><dd class="mono">{{hotfixPreview?.module_id}}</dd><dt>Hotfix</dt><dd class="mono">{{hotfixPreview?.id}}</dd><dt>Base version</dt><dd class="mono">{{hotfixPreview?.base_version}}</dd><dt>Files</dt><dd>{{hotfixPreview?.targets?.length||0}}</dd><dt>Reload</dt><dd class="mono">{{hotfixPreview?.reload||'none'}}</dd><dt>UI sync</dt><dd>{{hotfixPreview?.ui_sync?'yes':'no'}}</dd></dl>
          <p class="compact-copy">{{hotfixPreview?.description||'No description supplied.'}}</p>
          <div class="tablewrap"><table><thead><tr><th>Component</th><th>Path</th><th>Before SHA256</th><th>After SHA256</th></tr></thead><tbody><tr v-for="target in hotfixPreview?.targets||[]" :key="`${target.component}:${target.path}`"><td>{{target.component}}</td><td class="mono">{{target.path}}</td><td class="mono">{{compactHash(target.sha256_before)}}</td><td class="mono">{{compactHash(target.sha256_after)}}</td></tr></tbody></table></div>
          <div class="row mt"><button class="btn primary" :disabled="hotfixJobRunning" @click="applyHotfix">Apply hotfix</button><button class="btn" :disabled="hotfixJobRunning" @click="discardHotfixStage">Discard</button></div>
        </div>
        <div v-if="hotfixJobError" class="auth-error mt">{{hotfixJobError}}</div>
        <div v-if="hotfixJob" class="state-inline mt" :class="{warning:hotfixJobRunning,denied:['failed','dispatch_failed'].includes(hotfixJob.status)}"><b>{{hotfixJob.action}} {{hotfixJob.hotfix_id}}</b> · {{hotfixJob.status}} · <span class="mono">{{hotfixJob.stage}}</span><pre v-if="hotfixJob.log_tail?.length" class="job-log">{{hotfixJob.log_tail.join('\n')}}</pre></div>
      </section>
      <section class="card">
        <div class="cardhead"><div><span class="eyebrow">APPLIED STATE</span><h3>Module hotfixes</h3><p>Rollback is newest-first and fails closed if files changed after application.</p></div></div>
        <label class="field"><span>Module</span><select v-model="hotfixSelectedModuleId" @change="loadHotfixRows(hotfixSelectedModuleId)"><option :value="null">Select module</option><option v-for="item in modules.filter(x=>x.managed)" :key="item.id" :value="item.id">{{item.id}} · {{item.extension_version}} · {{item.hotfixes?.count||0}} hotfixes</option></select></label>
        <div v-if="hotfixLoading" class="state-inline">Loading applied hotfixes…</div>
        <div v-else-if="hotfixSelectedModuleId&&!hotfixRows.length" class="state-inline"><b>No active hotfixes.</b> This module is running its normal installed package state.</div>
        <div v-else-if="hotfixRows.length" class="tablewrap"><table><thead><tr><th>Hotfix</th><th>Base</th><th>Applied</th><th>Files</th><th></th></tr></thead><tbody><tr v-for="(row,index) in hotfixRows" :key="row.id"><td><b>{{row.id}}</b><span class="sub">{{row.description||'—'}}</span></td><td class="mono">{{row.base_version}}</td><td>{{historyTime(row.applied_at)}}<span class="sub">{{row.applied_by||'unknown'}}</span></td><td>{{row.targets?.length||0}}</td><td><button class="btn sm danger" :disabled="hotfixJobRunning||index!==hotfixRows.length-1" :title="index!==hotfixRows.length-1?'Roll back newer hotfixes first':'Roll back this hotfix'" @click="rollbackHotfix(row)">Rollback</button></td></tr></tbody></table></div>
      </section>
    </div>
  </template>

  <template v-else-if="activeTab==='history'">
    <div class="toolbar"><span class="muted mono">{{ jobHistory.length }} lifecycle records</span><span class="spacer"></span><button class="btn sm" :disabled="historyLoading" @click="loadJobHistory">{{historyLoading?'Loading…':'Refresh history'}}</button></div>
    <div v-if="historyLoading&&!jobHistory.length" class="state-inline">Loading module lifecycle history…</div>
    <div v-else-if="!jobHistory.length" class="state-inline"><b>No module lifecycle history yet.</b></div>
    <div v-else class="module-history-layout">
      <div class="tablewrap"><table><thead><tr><th>Time</th><th>Action</th><th>Module(s)</th><th>Requested by</th><th>Status</th><th>Stage</th></tr></thead><tbody>
        <tr v-for="job in jobHistory" :key="job.id" class="clickrow" :class="{selected:historySelectedId===job.id}" @click="historySelectedId=job.id"><td class="mono">{{historyTime(job.created_at)}}</td><td><b>{{job.action}}</b><span v-if="job.replace" class="sub">replacement / upgrade</span></td><td class="mono">{{historyModules(job)}}</td><td>{{job.requested_by||'unknown / legacy'}}</td><td><span class="pill" :class="{ok:job.status==='succeeded',danger:['failed','dispatch_failed'].includes(job.status),warn:!['succeeded','failed','dispatch_failed'].includes(job.status)}">{{job.status}}</span></td><td class="mono">{{job.stage||'—'}}</td></tr>
      </tbody></table></div>
      <aside v-if="selectedHistory" class="card module-history-detail"><div class="cardhead"><div><span class="eyebrow">LIFECYCLE RECORD</span><h3>{{selectedHistory.action}} · {{historyModules(selectedHistory)}}</h3></div><span class="pill" :class="{ok:selectedHistory.status==='succeeded',danger:['failed','dispatch_failed'].includes(selectedHistory.status),warn:!['succeeded','failed','dispatch_failed'].includes(selectedHistory.status)}">{{selectedHistory.status}}</span></div><dl class="kvlist"><dt>Created</dt><dd class="mono">{{historyTime(selectedHistory.created_at)}}</dd><dt>Started</dt><dd class="mono">{{historyTime(selectedHistory.started_at)}}</dd><dt>Finished</dt><dd class="mono">{{historyTime(selectedHistory.finished_at)}}</dd><dt>Requested by</dt><dd>{{selectedHistory.requested_by||'unknown / legacy'}}</dd><dt>Job ID</dt><dd class="mono">{{selectedHistory.id}}</dd><dt>Package</dt><dd class="mono">{{selectedHistory.package_filename||'—'}}</dd></dl><div v-if="selectedHistory.error" class="auth-error">{{selectedHistory.error}}</div><div v-if="selectedHistory.log_tail?.length" class="section-divider">Log tail</div><pre v-if="selectedHistory.log_tail?.length" class="job-log">{{selectedHistory.log_tail.join('\n')}}</pre></aside>
    </div>
  </template>

  <div v-if="activeJob" class="job-panel card mt"><div class="cardhead"><div><span class="eyebrow">MODULE JOB</span><h3>{{ activeJob.action }} / {{ activeJob.plugin_id }}</h3></div><span class="pill" :class="{ok:activeJob.status==='succeeded',danger:['failed','dispatch_failed'].includes(activeJob.status),warn:!['succeeded','failed','dispatch_failed'].includes(activeJob.status)}">{{ activeJob.status }}</span></div><div v-if="jobPollError" class="state-inline warning"><b>Job status refresh failed.</b> {{ jobPollError }} Retrying automatically.</div><div v-if="activeJob.error" class="auth-error">{{ activeJob.error }}</div><pre v-if="activeJob.log_tail?.length" class="job-log">{{ activeJob.log_tail.join('\n') }}</pre><div v-if="activeJob.status==='succeeded'" class="row"><button class="btn primary" @click="reloadTecTac">Reload Tec-Tac</button></div></div>

  <div v-if="reinstallTarget" class="modal-backdrop" @click.self="closeReinstallConfirm"><section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="module-reinstall-title"><div class="cardhead"><div><span class="eyebrow">REINSTALL MODULE</span><h3 id="module-reinstall-title">{{ reinstallTarget.name || reinstallTarget.id }}</h3></div><span class="pill warn">SAME VERSION</span></div><p class="compact-copy">Installed version and repository version are both <span class="mono">{{ reinstallTarget.latest_version }}</span>. Continuing will download and inspect the same version for reinstall. The replacement still requires confirmation from the package inspection step.</p><div class="state-inline warning mt"><b>Existing module files will be replaced when the install job runs.</b> Configuration and data remain subject to the module's normal upgrade/reinstall lifecycle.</div><div class="modal-actions"><button class="btn primary" :disabled="inspecting || jobRunning" @click="confirmReinstall">Continue to reinstall</button><button class="btn" @click="closeReinstallConfirm">Cancel</button></div></section></div>

  <div v-if="confirmTarget" class="modal-backdrop" @click.self="closeConfirm"><section class="modal-panel"><div class="cardhead"><div><span class="eyebrow">{{ confirmMode.toUpperCase() }} MODULE</span><h3>{{ confirmTarget.id }}</h3></div><span class="pill warn">RUNTIME CHANGE</span></div><p v-if="confirmMode==='disable'&&confirmTarget.dependants?.length" class="compact-copy">Enabled dependants may block this action. Select cascade to disable dependent modules first.</p><label v-if="confirmMode==='disable'&&confirmTarget.dependants?.length" class="checkline warning-check"><input v-model="cascade" type="checkbox"> Disable enabled dependants as part of this job</label><label class="field"><span>Type {{ confirmTarget.id }} to confirm</span><input v-model="confirmText" autocomplete="off"></label><div class="modal-actions"><button class="btn" :class="confirmMode==='enable'?'primary':'danger'" :disabled="confirmText!==confirmTarget.id" @click="confirmAction">{{ confirmMode }} module</button><button class="btn" @click="closeConfirm">Cancel</button></div></section></div>
</section>
</template>
