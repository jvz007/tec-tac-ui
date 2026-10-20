<script setup>
// 0.12.118: one job's full log in the shared kit's floating, read-only EditorWindow (Core 1.17.60). The log is fetched with
// apiRaw so the headers can be read, and it is put in the page with textContent only, never as HTML. The token travels only in
// the Authorization header apiRaw sets: there is no link with a token in it. A path, a token or a package hash is never shown.
// 0.12.119: the source prop opens the same window for a System Updates job or a server-maintenance job. Nothing is merged. The
// object URL of a download is kept 30 seconds and revoked once (object-url-keeper.js).
// 0.12.120 (Core 1.17.67): both read Core's log route as text, and Download works for both with ?download=1. A System Updates job
// is read first (its detail answers from history and says has_log): with has_log false no log is requested, the plain reason shows
// and Download is off. A maintenance job reads the one combined file (?part=all, three headed sections).
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { EditorWindow, FormRow } from '../../shared-kit.js'
import { apiRaw } from '../../api'
import { getSystemUpdateJob, readMaintenanceLog, readSystemUpdateLog } from '../../api'
import { formatDateTime } from '../../date-format'
import { createLatestRequestGate } from '../../admin-session-state'
import { jobSwitchLines } from '../../module-replacement'
import { TRUNCATED_LINE, dispositionFileName, downloadFileName, logErrorSentence, logFromResponse, readJobLog } from '../../module-job-history'
import { NO_LOG_YET_TEXT, otherDownloadFileName, systemLogErrorSentence } from '../../system-job-logs'
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
// System Updates only: Core's has_log, from the row first and from the detail read once it is in.
const logAvailable = ref(props.job.hasLog === true)
const downloadOff = computed(() => !!error.value || (props.source === 'system-update' && !logAvailable.value))
const downloadTitle = computed(() => (props.source === 'system-update' && !logAvailable.value && !error.value ? NO_LOG_YET_TEXT : undefined))

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
  logAvailable.value = props.job.hasLog === true
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

// A System Updates or server-maintenance log. One read each, never retried. A refusal shows Core's own sentence.
async function loadOther(id) {
  const request = gate.begin()
  const source = props.source
  const current = () => gate.isCurrent(request) && props.job.id === id
  try {
    if (source === 'system-update') {
      const detail = await getSystemUpdateJob(id)
      if (!current()) return
      logAvailable.value = detail?.has_log === true
      if (!logAvailable.value) {
        loading.value = false
        await nextTick()
        show(NO_LOG_YET_TEXT)
        return
      }
    }
    const response = source === 'system-update' ? await readSystemUpdateLog(id) : await readMaintenanceLog(id, { part: 'all' })
    const log = await logFromResponse(response)
    if (!current()) return
    truncated.value = log.truncated
    markerFallback.value = log.source === 'marker'
    loading.value = false
    await nextTick()
    show(log.text.trim() === '' ? NO_LOG_YET_TEXT : log.text)
  } catch (e) {
    if (!gate.isCurrent(request)) return
    error.value = systemLogErrorSentence(e, source)
    loading.value = false
  }
}

async function download() {
  if (downloading.value || downloadOff.value) return
  downloading.value = true
  downloadError.value = ''
  let url = ''
  try {
    const source = props.source
    const response = source === 'system-update' ? await readSystemUpdateLog(props.job.id, { download: true })
      : source === 'maintenance' ? await readMaintenanceLog(props.job.id, { part: 'all', download: true })
        : await readJobLog(props.job.id, { apiRaw, download: true })
    const blob = await response.blob()
    const name = dispositionFileName(response.headers) || (otherSource.value ? otherDownloadFileName(source, props.job) : downloadFileName(props.job))
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
      <button class="btn sm" type="button" :disabled="downloading || downloadOff" :title="downloadTitle" @click="download">{{ downloading ? 'Preparing…' : 'Download' }}</button>
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
        <div v-if="truncated" class="state-inline warning mm-log-note" role="status">
          {{ TRUNCATED_LINE }}
          <span v-if="markerFallback" class="muted smalltext"> Your browser could not read Core's length header, so this was found from the marker line.</span>
        </div>
        <div v-if="loading" class="state-inline mm-log-note" role="status">Loading the log…</div>
        <pre v-show="!loading" ref="logEl" class="mm-log" tabindex="0" aria-label="Job log"></pre>
      </template>
    </template>
  </EditorWindow>
</template>
