<script setup>
// 0.12.119: the module job panel on the brand board (P9 result: title with a status pill, the log in mono, one primary button).
// Presentational only. The job, the poll error and the reload are ModulesView.vue's; this file only draws them.
import { jobSwitchLines } from '../../module-replacement'

defineProps({
  activeJob: { type: Object, required: true },
  jobPollError: { type: String, default: '' },
})
const emit = defineEmits(['reloadTecTac'])
</script>

<template>
  <section class="job-panel card mm-card mm-job mt" aria-label="Module job">
    <div class="cardhead mm-cardhead"><div><span class="eyebrow">MODULE JOB</span><h3>{{ activeJob.action }} / {{ activeJob.plugin_id }}</h3></div><span class="pill" :class="{ok:activeJob.status==='succeeded',danger:['failed','dispatch_failed'].includes(activeJob.status),warn:!['succeeded','failed','dispatch_failed'].includes(activeJob.status)}">{{ activeJob.status }}</span></div>
    <div v-if="jobPollError" class="state-inline warning"><b>Job status refresh failed.</b> {{ jobPollError }} Retrying automatically.</div>
    <div v-for="(line,index) in jobSwitchLines(activeJob)" :key="'sw'+index" class="compact-copy">{{ line }}</div>
    <div v-if="activeJob.error" class="auth-error">{{ activeJob.error }}</div>
    <pre v-if="activeJob.log_tail?.length" class="job-log mm-joblog">{{ activeJob.log_tail.join('\n') }}</pre>
    <div v-if="activeJob.status==='succeeded'" class="mm-footer"><span class="spacer"></span><button class="btn primary" @click="emit('reloadTecTac')">Reload Tec-Tac</button></div>
  </section>
</template>
