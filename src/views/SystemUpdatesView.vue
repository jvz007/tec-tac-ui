<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  checkOnlineSystemUpdate,
  discardSystemUpdatePackage,
  getSystemUpdateBranches,
  getSystemUpdateJob,
  getSystemUpdateStatus,
  getUpdateTrustPolicy,
  inspectSystemUpdatePackage,
  installSystemUpdatePackage,
  setUpdateTrustPolicy,
  stageOnlineSystemUpdate,
} from '../api'
import ReleaseTrustBadge from '../components/ReleaseTrustBadge.vue'
import { copyTextWithFeedback } from '../copy-feedback'
import { canEditRuntimeSettings } from '../runtime-settings'
import {
  branchComparison,
  discoveredVersion,
  describeStageSource,
  describeUpdateSource,
  normalizeUpdateSources,
  saveUpdateSource,
  sourceDraftState,
  stableRelease,
  stageSourceCheck,
  supportsUpdateSource,
} from '../update-source'
import { createKeyedLatestRequestGate } from '../latest-request-gate'
import { trustPopoverDomId, trustPopoverOpen, trustPopoverTransition } from '../system-trust-popover-state'

const help = inject('tecTacHelp', null)
const appState = inject('tecTacState', null)
const status = ref(null)
const loading = ref(true)
const error = ref('')
const online = ref({ framework: null, ui: null })
// Core 1.17.4: the release_cache row for a branch source, so the Stable release line shows before the first check.
const cachedStable = ref({ framework: null, ui: null })
const checkedAtLocal = ref({ framework: null, ui: null })
const onlineBusy = ref({ framework: false, ui: false })
const advancedUnlocked = ref(false)
const branches = ref({ framework: [], ui: [] })
const selectedBranch = ref({ framework: 'main', ui: 'main' })
const branchBusy = ref({ framework: false, ui: false })
const onlineRequestGate = createKeyedLatestRequestGate(['framework', 'ui'])
const branchRequestGate = createKeyedLatestRequestGate(['framework', 'ui'])
// Remembered update source (Core 1.17.2): the draft is what the control shows,
// status.update_sources is what Core saved.
const sourceDraft = ref({ framework: { type: 'release', ref: '' }, ui: { type: 'release', ref: '' } })
const sourceSaving = ref({ framework: false, ui: false })
const sourceError = ref({ framework: '', ui: '' })
const branchListFailed = ref({ framework: false, ui: false })
const canEditSource = computed(() => canEditRuntimeSettings(appState?.context))
const sourcesSupported = computed(() => supportsUpdateSource(status.value))
const savedSources = computed(() => normalizeUpdateSources(status.value))
const stage = ref(null)
// What the page asked Core to stage: { component, type, ref, oneOff }. Null for an offline file.
const stageRequest = ref(null)
const stageCheck = computed(() => stageSourceCheck({
  requested: stageRequest.value,
  preview: stage.value?.preview,
  saved: stageRequest.value ? savedSources.value[stageRequest.value.component] : null,
}))
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
const trustPolicyOpen = ref(false)
const trustPolicy = ref(null)
const trustPolicyDraft = ref('unsigned')
const trustPolicySaving = ref(false)
const trustPolicyError = ref('')
const trustPolicyGuidance = ref(null)
const trustPolicyCommandCopied = ref(false)
const trustPopoverHover = ref(null)
const trustPopoverFocus = ref(null)

function trustPopoverKey(scope, id = '') {
  return `${scope}:${id}`
}

function isTrustPopoverOpen(key) {
  return trustPopoverOpen({ hover: trustPopoverHover.value, focus: trustPopoverFocus.value }, key)
}

function trustPopoverId(key) {
  return trustPopoverDomId(key)
}

function setTrustPopover(channel, key = null) {
  const next = trustPopoverTransition({ hover: trustPopoverHover.value, focus: trustPopoverFocus.value }, channel, key)
  trustPopoverHover.value = next.hover
  trustPopoverFocus.value = next.focus
}

function closeTrustPopover(event = null) {
  setTrustPopover('close')
  event?.currentTarget?.blur?.()
}


const trustPolicyLowering = computed(() => {
  const current = trustPolicy.value?.minimum_level
  const levels = trustPolicy.value?.levels || []
  const rank = Object.fromEntries(levels.map((item) => [item.id, Number(item.rank)]))
  return current in rank && trustPolicyDraft.value in rank && rank[trustPolicyDraft.value] < rank[current]
})

const trustPolicyDescriptions = {
  unsigned: 'Allow unsigned packages where no stricter component or module-specific rule applies.',
  signed_development: 'Require a trusted development-or-stronger signing tier. Publisher environment isolation still applies.',
  signed_production: 'Require a trusted production signing key. Development-signed packages are rejected.',
  secure_signed: 'Require a trusted production key explicitly marked secure/high-assurance in the local publisher policy.',
}

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
    trustPolicy.value = status.value?.update_trust_policy || trustPolicy.value
    for (const component of ['framework', 'ui']) {
      syncSourceDraft(component)
      // The release cache has no branch data. It only fills the release rows
      // until the first online check returns, and only for a release source.
      const cached = status.value?.release_cache?.[component]
      if (cached?.latest_release && !savedIsBranch(component)) online.value[component] = cached
      cachedStable.value[component] = savedIsBranch(component) && cached && typeof cached === 'object' ? cached : null
    }
  } catch (err) {
    error.value = err?.message || 'Unable to load system update status.'
  } finally {
    loading.value = false
  }
}

async function openTrustPolicy() {
  trustPolicyError.value = ''
  trustPolicyOpen.value = true
  try {
    trustPolicy.value = await getUpdateTrustPolicy()
    trustPolicyDraft.value = trustPolicy.value?.minimum_level || 'unsigned'
    trustPolicyGuidance.value = null
    trustPolicyCommandCopied.value = false
  } catch (err) {
    trustPolicyError.value = err?.message || 'Unable to load update trust policy.'
  }
}

function closeTrustPolicy() {
  if (trustPolicySaving.value) return
  trustPolicyOpen.value = false
  trustPolicyError.value = ''
  trustPolicyGuidance.value = null
  trustPolicyCommandCopied.value = false
}

async function saveTrustPolicy() {
  if (trustPolicySaving.value) return
  trustPolicySaving.value = true
  trustPolicyError.value = ''
  trustPolicyGuidance.value = null
  trustPolicyCommandCopied.value = false
  try {
    const result = await setUpdateTrustPolicy(trustPolicyDraft.value)
    if (result?.status === 'console_required') {
      trustPolicyGuidance.value = result
      return
    }
    trustPolicy.value = result
    if (status.value) status.value.update_trust_policy = trustPolicy.value
    trustPolicyOpen.value = false
    await refreshOnline()
  } catch (err) {
    trustPolicyError.value = err?.message || 'Unable to save update trust policy.'
  } finally {
    trustPolicySaving.value = false
  }
}


function openTrustPolicyHelp() {
  const articleId = trustPolicyGuidance.value?.help_article || 'core.trust-policy'
  try { help?.open?.(articleId) }
  catch { help?.open?.('core.trust-policy') }
}

async function copyTrustPolicyCommand() {
  const command = trustPolicyGuidance.value?.command
  if (!command) return
  trustPolicyError.value = ''
  const result = await copyTextWithFeedback(command, { failureMessage: 'Could not copy the trust-policy console command.' })
  trustPolicyCommandCopied.value = result.copied
  trustPolicyError.value = result.error
  if (result.copied) window.setTimeout(() => { trustPolicyCommandCopied.value = false }, 1800)
}

watch(trustPolicyDraft, () => {
  trustPolicyGuidance.value = null
  trustPolicyCommandCopied.value = false
})


function releaseAccepted(component) {
  const acceptance = online.value[component]?.latest_release?.release_trust?.acceptance_policy
  return acceptance?.accepted !== false
}

function handleKeydown(event) {
  if (event.key !== 'Escape') return
  if (trustPopoverHover.value || trustPopoverFocus.value) {
    closeTrustPopover()
    document.activeElement?.blur?.()
    return
  }
  if (trustPolicyOpen.value) closeTrustPolicy()
}

function syncSourceDraft(component) {
  const saved = savedSources.value[component]
  sourceDraft.value[component] = { type: saved.type, ref: saved.ref || '' }
  sourceError.value[component] = ''
}

function draftState(component) {
  return sourceDraftState({ saved: savedSources.value[component], draft: sourceDraft.value[component] })
}

function savedSourceLabel(component) {
  return describeUpdateSource(savedSources.value[component])
}

function savedBranchRef(component) {
  const saved = savedSources.value[component]
  return saved.type === 'branch' ? saved.ref : ''
}

// The branch list plus the saved branch, so a branch that vanished from the
// list stays selectable and is flagged instead of silently replaced.
function branchOptions(component) {
  const names = (branches.value[component] || []).map((item) => item.name)
  const saved = savedBranchRef(component)
  if (saved && !names.includes(saved)) names.unshift(saved)
  return names
}

function savedBranchMissing(component) {
  const saved = savedBranchRef(component)
  if (!saved || branchListFailed.value[component] || branchBusy.value[component]) return false
  if (!(branches.value[component] || []).length) return false
  return !(branches.value[component] || []).some((item) => item.name === saved)
}

function onSourceTypeChange(component) {
  const draft = sourceDraft.value[component]
  sourceError.value[component] = ''
  if (draft.type === 'branch' && !draft.ref) {
    draft.ref = savedBranchRef(component) || (branches.value[component] || [])[0]?.name || ''
  }
}

// With a saved source (Core 1.17.2) an unsaved draft blocks Check and Download.
function sourceBlocked(component) {
  return sourcesSupported.value && canEditSource.value && draftState(component).dirty
}

function savedIsBranch(component) {
  return sourcesSupported.value && Boolean(savedBranchRef(component))
}

function discovered(component) {
  return discoveredVersion({ saved: savedSources.value[component], online: online.value[component], sourcesSupported: sourcesSupported.value })
}

// Core 1.17.3 returns no checked_at for a branch source, so show when this page
// received the check. cache.stale means nothing for a branch.
function lastCheckedText(component) {
  if (discovered(component).kind === 'branch') {
    return checkedAtLocal.value[component] ? `${formatCheckedAt(checkedAtLocal.value[component])} (this session)` : 'Never'
  }
  return formatCheckedAt(online.value[component]?.checked_at)
}

function stageShown(component) {
  return savedIsBranch(component) || Boolean(online.value[component]?.latest_release)
}

function stageAllowed(component) {
  return savedIsBranch(component) || releaseAccepted(component)
}

// The branch the online check reports on, only when it is the saved branch.
// A stale answer for another branch, or the release cache, is never shown as a
// finished branch check.
function branchCheck(component) {
  const result = online.value[component]
  const saved = savedBranchRef(component)
  if (!saved || !result || result.source?.type !== 'branch' || result.source?.ref !== saved) return null
  return result
}

function branchView(component) {
  return branchComparison(branchCheck(component)?.branch)
}

function stageLabel(component) {
  if (savedIsBranch(component)) {
    const head = branchView(component)?.headShort
    return `Download & inspect branch ${savedBranchRef(component)}${head ? ` (${head})` : ''}`
  }
  return `Download & inspect ${online.value[component]?.latest_release?.tag || ''}`.trim()
}

async function saveSource(component) {
  const state = draftState(component)
  if (!state.valid || !state.dirty || sourceSaving.value[component]) return
  const draft = sourceDraft.value[component]
  await applySource(component, draft.type, draft.type === 'branch' ? draft.ref : null)
}

// Saves one source for a component, then drops anything in flight for the old
// source and checks again. Shared by the Save button and the stable-release switch.
async function applySource(component, type, ref) {
  sourceSaving.value[component] = true
  sourceError.value[component] = ''
  try {
    const result = await saveUpdateSource(component, type, ref)
    status.value = { ...status.value, update_sources: { ...status.value.update_sources, [component]: result.update_sources[component] } }
    syncSourceDraft(component)
    // Anything still in flight was for the old source.
    onlineRequestGate.invalidate(component)
    await checkOnline(component, { force: true })
  } catch (err) {
    sourceError.value[component] = err?.message || 'Unable to save the update source.'
  } finally {
    sourceSaving.value[component] = false
  }
}

// One click from a branch back to the release source. It stages and installs
// nothing. Core still checks core.runtime_settings.manage.
async function switchToRelease(component) {
  if (!canEditSource.value || !savedIsBranch(component) || sourceSaving.value[component]) return
  await applySource(component, 'release', null)
}

// The secondary Stable release line under a branch source. Null draws nothing.
function stable(component) {
  return stableRelease({
    saved: savedSources.value[component],
    online: online.value[component],
    cached: cachedStable.value[component],
    sourcesSupported: sourcesSupported.value,
  })
}

async function checkOnline(component, { force = false, background = false } = {}) {
  const requestId = onlineRequestGate.begin(component)
  onlineBusy.value[component] = !background
  if (!background) error.value = ''
  try {
    const result = await checkOnlineSystemUpdate(component, { force })
    if (!onlineRequestGate.isCurrent(component, requestId)) return
    online.value[component] = result
    checkedAtLocal.value[component] = new Date().toISOString()
  } catch (err) {
    if (onlineRequestGate.isCurrent(component, requestId) && !background) {
      error.value = err?.message || 'Unable to check repository release.'
    }
  } finally {
    if (onlineRequestGate.isCurrent(component, requestId)) onlineBusy.value[component] = false
  }
}

async function refreshOnline() {
  await Promise.allSettled(['framework', 'ui'].map((component) => checkOnline(component, { background: true })))
}

function formatCheckedAt(value) {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

async function unlockAdvanced() {
  advancedUnlocked.value = true
  await Promise.all(['framework', 'ui'].map((component) => (
    branches.value[component].length ? Promise.resolve() : loadBranches(component)
  )))
}

// quiet: the remembered-source control loads the list on its own. A failure
// (403, offline) only switches that control to a typed branch name.
async function loadBranches(component, { quiet = false } = {}) {
  const requestId = branchRequestGate.begin(component)
  branchBusy.value[component] = true
  try {
    const result = await getSystemUpdateBranches(component)
    if (!branchRequestGate.isCurrent(component, requestId)) return
    branches.value[component] = result.branches || []
    branchListFailed.value[component] = false
    if (!branches.value[component].some((item) => item.name === selectedBranch.value[component])) {
      selectedBranch.value[component] = branches.value[component][0]?.name || ''
    }
  } catch (err) {
    if (branchRequestGate.isCurrent(component, requestId)) {
      branchListFailed.value[component] = true
      if (!quiet) error.value = err?.message || 'Unable to list repository branches.'
    }
  } finally {
    if (branchRequestGate.isCurrent(component, requestId)) branchBusy.value[component] = false
  }
}

// No sourceType: stage the saved update source the page displays, sent
// explicitly (release sends a null ref). 'branch' is the one-off Advanced stage
// and is never saved. An older Core without saved sources only knows the
// explicit source, so it still gets 'release'.
async function stageOnline(component, sourceType = null) {
  const oneOff = Boolean(sourceType)
  const saved = savedSources.value[component]
  let type = 'release'
  let ref = null
  if (oneOff) {
    type = sourceType
    ref = sourceType === 'branch' ? selectedBranch.value[component] : null
  } else if (sourcesSupported.value) {
    type = saved.type
    ref = saved.type === 'branch' ? saved.ref : null
  }
  offlineFile.value = null
  offlineDropActive.value = false
  stageBusy.value = true
  error.value = ''
  try {
    stage.value = await stageOnlineSystemUpdate(component, type, ref)
    stageRequest.value = { component, type, ref, oneOff }
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
    stageRequest.value = null
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
  stageRequest.value = null
  allowDowngrade.value = false
}

async function installStage() {
  if (!stage.value?.upload_id || stageBusy.value || stageCheck.value.blocked) return
  const preview = stage.value.preview || {}
  if (preview.operation === 'downgrade' && !allowDowngrade.value) return
  stageBusy.value = true
  error.value = ''
  try {
    job.value = await installSystemUpdatePackage(stage.value.upload_id, allowDowngrade.value)
    stage.value = null
    stageRequest.value = null
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
  window.addEventListener('keydown', handleKeydown)
  await loadStatus()
  const lists = sourcesSupported.value && canEditSource.value
    ? Promise.allSettled(['framework', 'ui'].map((component) => loadBranches(component, { quiet: true })))
    : Promise.resolve()
  await Promise.all([refreshOnline(), lists])
  // The backend cache makes this cheap: GitHub is contacted only when the
  // persisted release lookup is at least 24 hours old.
  releaseRefreshTimer.value = window.setInterval(refreshOnline, 60 * 60 * 1000)
})
onBeforeUnmount(() => {
  for (const component of ['framework', 'ui']) { onlineRequestGate.invalidate(component); branchRequestGate.invalidate(component) }
  window.removeEventListener('keydown', handleKeydown)
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
      <div class="phead-actions trust-policy-head">
        <span v-if="trustPolicy" class="pill" :class="trustPolicy.minimum_level === 'unsigned' ? 'warn' : 'ok'">{{ trustPolicy.minimum_label }}</span>
        <button class="btn" type="button" @click="openTrustPolicy">Trust policy</button>
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
          <dt v-if="sourcesSupported">Update source</dt>
          <dd v-if="sourcesSupported" data-test="saved-update-source"><span class="pill" :class="savedSources[component.id].type === 'branch' ? 'warn' : 'ok'">{{ savedSourceLabel(component.id) }}</span><span class="sub">Saved. Check and Download use this source.</span></dd>
          <template v-if="discovered(component.id).kind === 'branch'">
            <dt>Discovered version</dt>
            <dd data-test="discovered-version">
              <template v-if="discovered(component.id).checked"><span class="mono">{{ discovered(component.id).ref }} {{ discovered(component.id).headShort || 'unknown' }}</span><span v-if="discovered(component.id).headDate" class="sub">{{ formatCheckedAt(discovered(component.id).headDate) }}</span></template>
              <span v-else-if="!discovered(component.id).branchError" class="muted">{{ onlineBusy[component.id] ? 'Checking the branch…' : 'Not checked yet. Use Check for updates.' }}</span>
              <span v-else class="muted">Not available</span>
            </dd>
            <template v-if="discovered(component.id).checked">
              <dt>Installed</dt>
              <dd><span class="mono">{{ discovered(component.id).comparison.installedShort }}</span><span v-if="discovered(component.id).comparison.installedNote" class="sub">{{ discovered(component.id).comparison.installedNote }}</span></dd>
              <dt>Comparison</dt>
              <dd><span class="pill" :class="discovered(component.id).comparison.pillClass">{{ discovered(component.id).comparison.label }}</span><span class="sub">{{ discovered(component.id).comparison.text }}</span></dd>
            </template>
            <template v-if="stable(component.id)">
              <dt data-test="stable-release-label">Stable release</dt>
              <dd data-test="stable-release">
                <template v-if="stable(component.id).none"><span class="muted">Not checked yet</span></template>
                <template v-else>
                  <span class="mono">{{ stable(component.id).tag }}</span>
                  <span v-if="stable(component.id).date" class="sub">{{ formatCheckedAt(stable(component.id).date) }}</span>
                  <span v-if="stable(component.id).stale" class="pill muted ml">STALE</span>
                  <ReleaseTrustBadge
                    :trust="stable(component.id).trust"
                    :label="systemTrustLabel(stable(component.id).trust)"
                    :tone="systemTrustClass(stable(component.id).trust)"
                    :open="isTrustPopoverOpen(trustPopoverKey('stable', component.id))"
                    :popover-id="trustPopoverId(trustPopoverKey('stable', component.id))"
                    @trust-hover="setTrustPopover('hover', trustPopoverKey('stable', component.id))"
                    @trust-leave="setTrustPopover('hover', null)"
                    @trust-focus="setTrustPopover('focus', trustPopoverKey('stable', component.id))"
                    @trust-blur="setTrustPopover('focus', null)"
                    @trust-close="closeTrustPopover($event)"
                  />
                  <span v-if="stable(component.id).acceptance" class="sub"><span class="pill" :class="stable(component.id).acceptance.accepted ? 'ok' : 'danger'">{{ stable(component.id).acceptance.accepted ? 'ACCEPTED' : 'BLOCKED' }}</span> {{ stable(component.id).acceptance.actual_label || 'Unknown' }} · minimum {{ stable(component.id).acceptance.minimum_label }}</span>
                  <span v-if="stable(component.id).operation" class="sub">{{ humanOperation(stable(component.id).operation) }}</span>
                </template>
                <span v-if="stable(component.id).error" class="sub muted" data-test="stable-release-error">{{ stable(component.id).error }}</span>
                <button v-if="canEditSource && savedIsBranch(component.id)" class="btn sm" type="button" data-test="use-stable-release" :disabled="sourceSaving[component.id]" @click="switchToRelease(component.id)">{{ sourceSaving[component.id] ? 'Switching…' : 'Use stable release' }}</button>
              </dd>
            </template>
          </template>
          <template v-else-if="discovered(component.id).kind === 'none'">
            <dt>Discovered version</dt>
            <dd class="muted">Not checked yet. Use Check for updates.</dd>
          </template>
          <template v-if="discovered(component.id).kind === 'release'">
          <dt>Stable release</dt>
          <dd>
            <span v-if="online[component.id]?.latest_release" class="mono">{{ online[component.id].latest_release.tag }}</span>
            <span v-else class="muted">No cached release yet</span>
          </dd>
          <dt>Release trust</dt>
          <dd>
            <ReleaseTrustBadge
              v-if="online[component.id]?.latest_release"
              :trust="online[component.id].latest_release.release_trust"
              :label="systemTrustLabel(online[component.id].latest_release.release_trust)"
              :tone="systemTrustClass(online[component.id].latest_release.release_trust)"
              :open="isTrustPopoverOpen(trustPopoverKey('release', component.id))"
              :popover-id="trustPopoverId(trustPopoverKey('release', component.id))"
              @trust-hover="setTrustPopover('hover', trustPopoverKey('release', component.id))"
              @trust-leave="setTrustPopover('hover', null)"
              @trust-focus="setTrustPopover('focus', trustPopoverKey('release', component.id))"
              @trust-blur="setTrustPopover('focus', null)"
              @trust-close="closeTrustPopover($event)"
            />
            <span v-else class="muted">Not checked</span>
          </dd>
          <template v-if="online[component.id]?.latest_release?.release_trust?.acceptance_policy">
            <dt>Acceptance</dt>
            <dd><span class="pill" :class="online[component.id].latest_release.release_trust.acceptance_policy.accepted ? 'ok' : 'danger'">{{ online[component.id].latest_release.release_trust.acceptance_policy.accepted ? 'ACCEPTED' : 'BLOCKED' }}</span><span class="sub">{{ online[component.id].latest_release.release_trust.acceptance_policy.actual_label || 'Unknown' }} · minimum {{ online[component.id].latest_release.release_trust.acceptance_policy.minimum_label }}</span></dd>
          </template>
          </template>
          <dt>Last checked</dt><dd class="smalltext">{{ lastCheckedText(component.id) }}<span v-if="discovered(component.id).kind !== 'branch' && online[component.id]?.cache?.stale" class="pill warn ml">STALE</span></dd>
        </dl>

        <div v-if="discovered(component.id).kind !== 'branch' && online[component.id]?.release_error" class="state-inline warning mt">{{ online[component.id].release_error }}</div>

        <div v-if="sourcesSupported" class="update-source-control mt">
          <div class="section-divider">Update source</div>
          <form v-if="canEditSource" class="update-source-form" @submit.prevent="saveSource(component.id)">
            <label class="field compact-field">
              <span>Source</span>
              <select v-model="sourceDraft[component.id].type" :disabled="sourceSaving[component.id]" @change="onSourceTypeChange(component.id)">
                <option value="release">Release</option>
                <option value="branch">Branch</option>
              </select>
            </label>
            <label v-if="sourceDraft[component.id].type === 'branch'" class="field compact-field">
              <span>Branch</span>
              <input v-if="branchListFailed[component.id]" v-model.trim="sourceDraft[component.id].ref" class="mono" type="text" maxlength="200" spellcheck="false" autocomplete="off" :disabled="sourceSaving[component.id]" />
              <select v-else v-model="sourceDraft[component.id].ref" :disabled="sourceSaving[component.id] || branchBusy[component.id]">
                <option v-for="name in branchOptions(component.id)" :key="name" :value="name">{{ name }}{{ name === savedBranchRef(component.id) && savedBranchMissing(component.id) ? ' (not in the branch list)' : '' }}</option>
              </select>
            </label>
            <button class="btn primary" type="submit" :disabled="sourceSaving[component.id] || !draftState(component.id).valid || !draftState(component.id).dirty">{{ sourceSaving[component.id] ? 'Saving…' : 'Save' }}</button>
          </form>
          <p v-else class="compact-copy muted">Only a superuser, or an administrator with the core.privileged_operations or core.runtime_settings.manage permission, can change the update source.</p>
          <p v-if="canEditSource && branchListFailed[component.id] && sourceDraft[component.id].type === 'branch'" class="compact-copy muted">The branch list is not available. Type the branch name.</p>
          <p v-if="savedBranchMissing(component.id)" class="compact-copy update-source-warn">The saved branch {{ savedBranchRef(component.id) }} is not in the repository's branch list. It may have been deleted.</p>
          <p v-if="canEditSource && draftState(component.id).message" class="compact-copy" :class="draftState(component.id).valid ? 'muted' : 'update-source-warn'">{{ draftState(component.id).message }}</p>
          <div v-if="sourceError[component.id]" class="state-inline denied mt">{{ sourceError[component.id] }}</div>
        </div>

        <div v-if="discovered(component.id).kind === 'branch' && discovered(component.id).branchError" class="state-inline warning mt" data-test="branch-check">{{ discovered(component.id).branchError }}</div>

        <div class="system-update-actions">
          <button class="btn" :disabled="onlineBusy[component.id] || stageBusy || sourceBlocked(component.id)" :title="sourceBlocked(component.id) ? 'Save to use this source.' : ''" @click="checkOnline(component.id, { force: true })">
            {{ onlineBusy[component.id] ? 'Checking…' : 'Check for updates' }}
          </button>
          <button
            v-if="stageShown(component.id)"
            class="btn primary"
            :disabled="stageBusy || sourceBlocked(component.id) || !stageAllowed(component.id)"
            :title="sourceBlocked(component.id) ? 'Save to use this source.' : (!stageAllowed(component.id) ? 'Release is below the configured trust acceptance level.' : '')"
            @click="stageOnline(component.id)"
          >
            {{ stageLabel(component.id) }}
          </button>
        </div>

        <div class="section-divider">Advanced source (one-off)</div>
        <div v-if="!advancedUnlocked" class="advanced-lock">
          <div>
            <span class="pill warn">LOCKED</span>
            <p>Stage a different branch once. It is not saved. Branch builds may be untagged, custom, or incompatible. Unlocking applies only to this browser session.</p>
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
          <button class="btn" :disabled="!selectedBranch[component.id] || stageBusy" @click="stageOnline(component.id, 'branch')">Download & inspect this branch once</button>
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
        <div><span>Source</span><b class="mono" data-test="stage-source">{{ describeStageSource(stage.preview.source) }}</b></div>
        <div><span>Trust</span><span class="system-trust-badge"><span class="pill system-trust-trigger" tabindex="0" :class="systemTrustClass(stage.preview.release_trust)" @mouseenter="setTrustPopover('hover', trustPopoverKey('stage'))" @mouseleave="setTrustPopover('hover', null)" @focus="setTrustPopover('focus', trustPopoverKey('stage'))" @blur="setTrustPopover('focus', null)" @click="closeTrustPopover($event)" @keydown.esc.stop.prevent="closeTrustPopover($event)" :aria-describedby="isTrustPopoverOpen(trustPopoverKey('stage')) ? trustPopoverId(trustPopoverKey('stage')) : undefined">{{ systemTrustLabel(stage.preview.release_trust) }}</span><span :id="trustPopoverId(trustPopoverKey('stage'))" v-if="isTrustPopoverOpen(trustPopoverKey('stage'))" class="system-trust-popover" role="tooltip"><b>{{ stage.preview.release_trust?.publisher_display_name || (stage.preview.release_trust?.legacy ? 'Legacy unsigned release' : 'Unsigned source') }}</b><span v-if="stage.preview.release_trust?.publisher_id">Publisher ID: <span class="mono">{{ stage.preview.release_trust.publisher_id }}</span></span><span v-if="stage.preview.release_trust?.key_id">Key ID: <span class="mono">{{ stage.preview.release_trust.key_id }}</span></span><span v-if="stage.preview.release_trust?.algorithm">Algorithm: {{ stage.preview.release_trust.algorithm }}</span><span v-if="stage.preview.release_trust?.file_count">Verified files: {{ stage.preview.release_trust.file_count }}</span><span v-if="stage.preview.release_trust?.details">{{ stage.preview.release_trust.details }}</span></span></span></div>
        <div><span>SHA256</span><b class="mono hash-short">{{ stage.sha256 }}</b></div>
      </div>
      <div v-if="stageCheck.state === 'mismatch'" class="state-inline denied" data-test="stage-source-mismatch" role="alert">{{ stageCheck.message }}</div>
      <div v-else-if="stageCheck.state === 'oneoff'" class="state-inline warning" data-test="stage-source-oneoff">{{ stageCheck.message }}</div>
      <div v-if="!stage.preview.installable" class="state-inline denied">{{ stage.preview.install_block_reason }}</div>
      <label v-if="stage.preview.operation === 'downgrade'" class="warning-check checkline">
        <input v-model="allowDowngrade" type="checkbox" />
        <span>I understand this installs an older system component and may be incompatible with installed modules.</span>
      </label>
      <div class="module-actions">
        <button class="btn primary" :disabled="stageBusy || stageCheck.blocked || !stage.preview.installable || (stage.preview.operation === 'downgrade' && !allowDowngrade)" @click="installStage">{{ stageBusy ? 'Starting…' : 'Install package' }}</button>
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

    <div v-if="trustPolicyOpen" class="modal-backdrop" @click.self="closeTrustPolicy">
      <section class="modal-panel trust-policy-modal" role="dialog" aria-modal="true" aria-labelledby="trust-policy-title">
        <div class="cardhead">
          <div><span class="eyebrow">UPDATE TRUST POLICY</span><h3 id="trust-policy-title">Minimum acceptance level</h3></div>
          <span class="pill">GLOBAL</span>
        </div>
        <p class="compact-copy muted">This Core-enforced minimum applies to both System Updates and Module Management. Existing component/module rules may be stricter. Publisher environment isolation remains enforced.</p>
        <div v-if="trustPolicyError" class="auth-error" role="alert">{{ trustPolicyError }}</div>
        <div class="trust-level-list" role="radiogroup" aria-label="Minimum package trust level">
          <label v-for="level in (trustPolicy?.levels || [])" :key="level.id" class="trust-level-option" :class="{ selected: trustPolicyDraft === level.id }">
            <input v-model="trustPolicyDraft" type="radio" name="trust-level" :value="level.id" />
            <span class="trust-level-copy"><b>{{ level.label }}</b><span>{{ trustPolicyDescriptions[level.id] }}</span></span>
            <span class="mono trust-rank">L{{ level.rank }}</span>
          </label>
        </div>
        <div v-if="trustPolicyLowering" class="state-inline mt">
          <b>Lowering the trust floor is a console-controlled operation.</b> Saving this selection will provide the temporary root-console command; it will not change the policy from the web process.
        </div>
        <div v-if="trustPolicyGuidance" class="trust-console-guidance mt" role="status">
          <div class="state-inline">
            <b>Console change required.</b> Run the command below from the Tec-Tac server with normal <span class="mono">sudo</span> authentication. Temporary reductions automatically revert to the previous level.
          </div>
          <div class="trust-console-command">
            <code class="mono">{{ trustPolicyGuidance.command }}</code>
            <button class="btn sm" type="button" @click="copyTrustPolicyCommand">{{ trustPolicyCommandCopied ? 'Copied' : 'Copy command' }}</button>
          </div>
          <button v-if="trustPolicyGuidance.help_article" class="btn sm ghost mt" type="button" @click="openTrustPolicyHelp">How to change the trust level</button>
        </div>
        <div class="state-inline warning mt"><b>Policy changes take effect immediately for new inspections and install requests.</b> Raising the level can block unsigned or lower-tier module packages and system releases.</div>
        <div class="modal-actions"><button class="btn" type="button" :disabled="trustPolicySaving" @click="closeTrustPolicy">Cancel</button><button class="btn primary" type="button" :disabled="trustPolicySaving || !trustPolicy?.levels?.length" @click="saveTrustPolicy">{{ trustPolicySaving ? 'Saving…' : 'Save policy' }}</button></div>
      </section>
    </div>

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
