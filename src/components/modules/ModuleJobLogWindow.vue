<script setup>
// 0.12.118: one job's full log in the shared kit's floating, read-only EditorWindow (Core 1.17.60). The log is fetched with
// apiRaw so the headers can be read, and it is put in the page with textContent only, never as HTML. The token travels only in
// the Authorization header apiRaw sets: there is no link with a token in it. A path, a token or a package hash is never shown.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { EditorWindow, FormRow } from '../../shared-kit.js'
import { apiRaw } from '../../api'
import { formatDateTime } from '../../date-format'
import { createLatestRequestGate } from '../../admin-session-state'
import { jobSwitchLines } from '../../module-replacement'
import { TRUNCATED_LINE, dispositionFileName, downloadFileName, logErrorSentence, logFromResponse, readJobLog } from '../../module-job-history'

const props = defineProps({ job: { type: Object, required: true } })
const emit = defineEmits(['close'])

const logEl = ref(null)
const loading = ref(true)
const error = ref('')
const truncated = ref(false)
const markerFallback = ref(false)
const downloadError = ref('')
const downloading = ref(false)
const gate = createLatestRequestGate()

const when = (value) => (value ? formatDateTime(value) : '—')
const details = computed(() => [
  ['Module(s)', props.job.modules],
  ['Action', props.job.action],
  ['Status', props.job.statusWord],
  ['Stage', props.job.stage],
  ['Requested by', props.job.requestedBy],
  ['Created', when(props.job.createdAt)],
  ['Started', when(props.job.startedAt)],
  ['Finished', when(props.job.finishedAt)],
])

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
  const id = props.job.id
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

async function download() {
  if (downloading.value) return
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
  } catch (e) {
    downloadError.value = logErrorSentence(e)
  } finally {
    // The object URL is revoked once the browser has taken the file.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 0)
    downloading.value = false
  }
}

watch(() => props.job.id, load)
load()
onBeforeUnmount(() => { gate.begin() })
</script>

<template>
  <EditorWindow :title="`Log · ${job.modules} · ${job.action}`" floating read-only :status="loading ? 'Loading the log…' : (error ? '' : (truncated ? 'Start and end shown' : 'Whole log shown'))" @close="emit('close')">
    <template #actions>
      <button class="btn sm" type="button" :disabled="downloading || !!error" @click="download">{{ downloading ? 'Preparing…' : 'Download' }}</button>
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
