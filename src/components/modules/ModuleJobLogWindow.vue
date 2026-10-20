<script setup>
// 0.12.118: one job's full log in the shared kit's floating, read-only EditorWindow (Core 1.17.60). The log is fetched with
// apiRaw so the headers can be read, and it is put in the page with textContent only, never as HTML. The token travels only in
// the Authorization header apiRaw sets: there is no link with a token in it. A path, a token or a package hash is never shown.
// 0.12.119: the source prop opens the same window for a System Updates job (the last 80 lines Core keeps) or a server-maintenance
// job (the log, output and error texts Core returns). Both are text only, nothing is merged, and Download stays off for them until
// Core serves a download route. The object URL of a module-job download is kept 30 seconds and revoked once (object-url-keeper.js).
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { EditorWindow, FormRow } from '../../shared-kit.js'
import { apiRaw } from '../../api'
import { getMaintenanceJob, getSystemUpdateJob } from '../../api'
import { formatDateTime } from '../../date-format'
import { createLatestRequestGate } from '../../admin-session-state'
import { jobSwitchLines } from '../../module-replacement'
import { TRUNCATED_LINE, dispositionFileName, downloadFileName, logErrorSentence, logFromResponse, readJobLog } from '../../module-job-history'
import { CUT_LOG_TEXT, DOWNLOAD_UNAVAILABLE_TEXT, NO_LOG_YET_TEXT, maintenanceLog, systemLogErrorSentence, systemUpdateLog } from '../../system-job-logs'
import { createUrlKeeper } from '../../object-url-keeper'

const props = defineProps({ job: { type: Object, required: true }, source: { type: String, default: 'module' } })
const emit = defineEmits(['close'])

const logEl = ref(null)
const loading = ref(true)
const error = ref('')
const truncated = ref(false)
const markerFallback = ref(false)
const downloadError = ref('')
const downloading = ref(false)
const gate = createLatestRequestGate()
const urlKeeper = createUrlKeeper()
const otherSource = computed(() => props.source === 'system-update' || props.source === 'maintenance')
const note = ref('')

const when = (value) => (value ? formatDateTime(value) : '—')
const details = computed(() => Array.isArray(props.job.detailRows) ? props.job.detailRows.map(([label, value]) => [label, ['Created', 'Started', 'Finished'].includes(label) ? when(value) : value]) : [
  ['Module(s)', props.job.modules],
  ['Action', props.job.action],
  ['Status', props.job.statusWord],
  ['Stage', props.job.stage],
  ['Requested by', props.job.requestedBy],
  ['Created', when(props.job.createdAt)],
  ['Started', when(props.job.startedAt)],
  ['Finished', when(props.job.finishedAt)],
])

const statusText = computed(() => {
  if (loading.value) return 'Loading the log…'
  if (error.value) return ''
  if (otherSource.value) return truncated.value ? 'End shown' : (props.source === 'system-update' ? 'Last 80 lines shown' : 'Whole log shown')
  return truncated.value ? 'Start and end shown' : 'Whole log shown'
})

function show(text) {
  // textContent: a log line such as <img onerror=...> stays text.
  if (logEl.value) logEl.value.textContent = text
}

async function load() {
  const request = gate.begin()
  loading.value = true
  error.value = ''
  truncated.value = false
  markerFallback.value = false
  downloadError.value = ''
  show('')
  note.value = ''
  const id = props.job.id
  if (otherSource.value) return loadOther(id)
  try {
    const response = await readJobLog(id, { apiRaw })
    const log = await logFromResponse(response)
    // The job was switched while this was loading: drop the answer.
    if (!gate.isCurrent(request) || props.job.id !== id) return
    truncated.value = log.truncated
    markerFallback.value = log.source === 'marker'
    loading.value = false
    await nextTick()
    show(log.text)
  } catch (e) {
    if (!gate.isCurrent(request)) return
    error.value = logErrorSentence(e)
    loading.value = false
  }
}

// A System Updates or server-maintenance log. One read, never retried. A 404 says Core no longer holds the log.
async function loadOther(id) {
  const request = gate.begin()
  const source = props.source
  try {
    const payload = source === 'system-update' ? await getSystemUpdateJob(id) : await getMaintenanceJob(id)
    if (!gate.isCurrent(request) || props.job.id !== id) return
    const log = source === 'system-update' ? systemUpdateLog(payload) : maintenanceLog(payload)
    truncated.value = log.truncated
    note.value = log.note
    loading.value = false
    await nextTick()
    show(log.empty ? NO_LOG_YET_TEXT : log.text)
  } catch (e) {
    if (!gate.isCurrent(request)) return
    error.value = systemLogErrorSentence(e, source)
    loading.value = false
  }
}

async function download() {
  if (downloading.value || otherSource.value) return
  downloading.value = true
  downloadError.value = ''
  let url = ''
  try {
    const response = await readJobLog(props.job.id, { apiRaw, download: true })
    const blob = await response.blob()
    const name = dispositionFileName(response.headers) || downloadFileName(props.job)
    url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
    // 0.12.119: kept 30 seconds so Firefox and Safari can take the file, and revoked at once if this window closes first.
    urlKeeper.keep(url)
    url = ''
  } catch (e) {
    downloadError.value = logErrorSentence(e)
  } finally {
    // A URL that was made but never handed to the browser is not kept.
    if (url) URL.revokeObjectURL(url)
    downloading.value = false
  }
}

watch(() => props.job.id, load)
load()
onBeforeUnmount(() => { gate.begin(); urlKeeper.flush() })
</script>

<template>
  <EditorWindow :title="`Log · ${job.modules} · ${job.action}`" floating read-only :status="statusText" @close="emit('close')">
    <template #actions>
      <button class="btn sm" type="button" :disabled="downloading || !!error || otherSource" :title="otherSource ? DOWNLOAD_UNAVAILABLE_TEXT : undefined" @click="download">{{ downloading ? 'Preparing…' : 'Download' }}</button>
    </template>
    <template #properties>
      <FormRow v-for="[label, value] in details" :key="label" :label="label" stacked><span class="mono">{{ value }}</span></FormRow>
      <FormRow v-if="job.error" label="Error" stacked><span>{{ job.error }}</span></FormRow>
      <FormRow v-for="(line, index) in jobSwitchLines(job.switchSource)" :key="'switch' + index" label="Switched" stacked><span>{{ line }}</span></FormRow>
    </template>
    <template #content>
      <div v-if="downloadError" class="state-inline denied" role="alert">{{ downloadError }}</div>
      <div v-if="error" class="state-inline denied mm-log-note" role="alert">{{ error }}</div>
      <template v-else>
        <div v-if="note" class="state-inline mm-log-note" role="status">{{ note }}</div>
        <div v-if="truncated && otherSource" class="state-inline warning mm-log-note" role="status">{{ CUT_LOG_TEXT }}</div>
        <div v-if="truncated && !otherSource" class="state-inline warning mm-log-note" role="status">
          {{ TRUNCATED_LINE }}
          <span v-if="markerFallback" class="muted smalltext"> Your browser could not read Core's length header, so this was found from the marker line.</span>
        </div>
        <div v-if="loading" class="state-inline mm-log-note" role="status">Loading the log…</div>
        <pre v-show="!loading" ref="logEl" class="mm-log" tabindex="0" aria-label="Job log"></pre>
      </template>
    </template>
  </EditorWindow>
</template>
