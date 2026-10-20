<script setup>
// 0.12.118: the Module Manager History tab (Core 1.17.60). Brand board P1 list page on the shared kit DataTable: search,
// filters, count and paging footer, Enter or double-click to open. A row has no log text and no path. The tab is shown only to
// people who can manage modules (the parent decides; this component also loads nothing without canManage).
// 0.12.119 (Q83): a Log source select. Module and hotfix jobs is the list as it was. System updates lists the finished jobs Core sends
// with the System Updates status; Server maintenance lists Core's maintenance jobs. Each opens its own log in the same window. The
// three logs are not merged.
import { computed, h, onMounted, ref } from 'vue'
import { DataTable } from '../../shared-kit.js'
import { formatDateTime } from '../../date-format'
import { createLatestRequestGate } from '../../admin-session-state'
import { listModuleJobHistory } from '../../modules'
import { listMaintenanceJobs, listSystemUpdateJobs } from '../../api'
import { jobSwitchLines } from '../../module-replacement'
import { NO_LOG_TEXT, historyErrorSentence, historyMeta, historyRows } from '../../module-job-history'
import { LOG_SOURCES, maintenanceRows, sourceLabel, systemLogErrorSentence, systemUpdateRows } from '../../system-job-logs'
import ModuleJobLogWindow from './ModuleJobLogWindow.vue'

const props = defineProps({ canManage: { type: Boolean, default: false } })
const emit = defineEmits(['total'])

const rows = ref([])
const meta = ref({ page: 1, pages: 0, total: 0 })
const loading = ref(false)
const error = ref('')
const openJob = ref(null)
const source = ref('module')
const otherRows = ref([])
const otherLoading = ref(false)
const otherError = ref('')
const otherTotal = ref(0)
const filters = ref({ module: '', action: '', status: '', kind: '' })
const applied = ref({ module: '', action: '', status: '', kind: '' })
const gate = createLatestRequestGate()
const PAGE_SIZE = 50

const ACTIONS = ['install', 'enable', 'disable', 'remove', 'visibility', 'apply', 'rollback']
const STATUSES = [['queued', 'Waiting to start'], ['dispatched', 'Starting'], ['running', 'Running'], ['succeeded', 'Done'], ['failed', 'Failed'], ['dispatch_failed', 'Could not start']]

const columns = [
  { key: 'when', label: 'When' },
  { key: 'modules', label: 'Module(s)' },
  { key: 'action', label: 'Action' },
  { key: 'requestedBy', label: 'Requested by' },
  { key: 'status', label: 'Status' },
  { key: 'stage', label: 'Stage' },
  { key: 'error', label: 'Error' },
  { key: 'log', label: 'Log' },
]

async function load(page = meta.value.page) {
  if (!props.canManage) return
  const request = gate.begin()
  loading.value = true
  error.value = ''
  try {
    const target = Math.max(1, Number(page) || 1)
    const payload = await listModuleJobHistory({ page: target, pageSize: PAGE_SIZE, ...applied.value })
    // A slower answer to an earlier request must not replace a newer one.
    if (!gate.isCurrent(request)) return
    rows.value = historyRows(payload)
    meta.value = historyMeta(payload, target)
    emit('total', meta.value.total)
  } catch (e) {
    if (!gate.isCurrent(request)) return
    error.value = historyErrorSentence(e)
  } finally {
    if (gate.isCurrent(request)) loading.value = false
  }
}
function apply() {
  applied.value = { ...filters.value, module: filters.value.module.trim() }
  load(1)
}
function clear() {
  filters.value = { module: '', action: '', status: '', kind: '' }
  apply()
}
function openable(row) { return row?.canOpen ?? row?.hasLog }
function open(row) { if (openable(row)) openJob.value = row }
// System updates and Server maintenance: one read each, no paging UI (at most 100 rows). 0.12.120: System updates reads Core's job list
// (jobs folder and history merged), no longer the status history.
async function loadOther() {
  const current = source.value
  if (!props.canManage || current === 'module') return
  const request = gate.begin()
  otherLoading.value = true
  otherError.value = ''
  try {
    const payload = current === 'system-update' ? await listSystemUpdateJobs({ page: 1, page_size: 100 }) : await listMaintenanceJobs({ limit: 100 })
    if (!gate.isCurrent(request) || source.value !== current) return
    const rows = current === 'system-update' ? systemUpdateRows(payload) : maintenanceRows(payload)
    otherRows.value = rows
    otherTotal.value = Number.isFinite(payload?.total) ? payload.total : rows.length
  } catch (e) {
    if (!gate.isCurrent(request) || source.value !== current) return
    otherRows.value = []
    otherError.value = systemLogErrorSentence(e, current)
  } finally {
    if (gate.isCurrent(request) && source.value === current) otherLoading.value = false
  }
}
function changeSource() {
  gate.begin()
  openJob.value = null
  loading.value = false
  otherLoading.value = false
  otherRows.value = []
  otherTotal.value = 0
  otherError.value = ''
  if (source.value === 'module') load(1)
  else loadOther()
}
function refreshCurrent() { if (source.value === 'module') load(meta.value.page); else loadOther() }
function go(page) {
  if (loading.value || page < 1 || (meta.value.pages && page > meta.value.pages)) return
  load(page)
}

const when = (value) => (value ? formatDateTime(value) : '—')
// Cells are text or small elements built here. No cell uses markup from Core.
function cell(row, column) {
  switch (column.key) {
    case 'when': return when(row.createdAt)
    case 'modules': return row.modules
    case 'action': return h('span', [row.action, ...jobSwitchLines(row.switchSource).map((line) => h('span', { class: 'sub' }, line))])
    case 'requestedBy': return row.requestedBy
    case 'status': return h('span', { class: ['pill', row.statusTone] }, row.statusWord)
    case 'stage': return row.stage
    case 'error': return row.error
    case 'log':
      if (!openable(row)) return h('span', { class: 'muted smalltext' }, NO_LOG_TEXT)
      return h('span', { class: 'mm-log-cell' }, [
        h('button', { class: 'btn sm', type: 'button', onClick: (event) => { event.stopPropagation(); open(row) } }, 'Open'),
        row.warning ? h('span', { class: 'muted smalltext' }, row.warning) : null,
      ])
    default: return ''
  }
}
const footer = computed(() => {
  if (source.value === 'system-update') {
    const n = otherRows.value.length
    return otherTotal.value > n ? `${n} of ${otherTotal.value} finished update jobs` : `${n} finished update job${n === 1 ? '' : 's'}`
  }
  if (source.value === 'maintenance') return `${otherRows.value.length} server maintenance job${otherRows.value.length === 1 ? '' : 's'}`
  const pages = meta.value.pages > 1 ? ` · page ${meta.value.page} of ${meta.value.pages}` : ''
  return `${meta.value.total} lifecycle record${meta.value.total === 1 ? '' : 's'}${pages}`
})
const filtered = computed(() => Object.values(applied.value).some(Boolean))
defineExpose({ reload: () => refreshCurrent() })
onMounted(() => load(1))
</script>

<template>
  <section class="mm-history" aria-label="Module job history">
    <form class="toolbar mm-filters" role="search" @submit.prevent="apply">
      <label class="compact-input"><span class="sr-only">Log source</span>
        <select v-model="source" aria-label="Log source" @change="changeSource"><option v-for="item in LOG_SOURCES" :key="item.key" :value="item.key">{{ item.label }}</option></select></label>
      <template v-if="source === 'module'">
      <label class="compact-input"><span class="sr-only">Module</span><input v-model="filters.module" type="text" placeholder="Module id…" autocomplete="off"></label>
      <label class="compact-input"><span class="sr-only">Action</span>
        <select v-model="filters.action" @change="apply"><option value="">Any action</option><option v-for="a in ACTIONS" :key="a" :value="a">{{ a }}</option></select></label>
      <label class="compact-input"><span class="sr-only">Status</span>
        <select v-model="filters.status" @change="apply"><option value="">Any status</option><option v-for="[v, w] in STATUSES" :key="v" :value="v">{{ w }}</option></select></label>
      <label class="compact-input"><span class="sr-only">Type</span>
        <select v-model="filters.kind" @change="apply"><option value="">Modules and hotfixes</option><option value="module">Modules</option><option value="hotfix">Hotfixes</option></select></label>
      <button class="btn" type="submit" :disabled="loading">Apply</button>
      <button v-if="filtered || filters.module || filters.action || filters.status || filters.kind" class="btn" type="button" @click="clear">Clear</button>
      </template>
      <button class="btn" type="button" :disabled="source === 'module' ? loading : otherLoading" @click="refreshCurrent">Refresh</button>
    </form>
    <template v-if="source !== 'module'">
      <div v-if="otherError" class="state-inline denied" role="alert">{{ otherError }}</div>
      <DataTable
        v-else
        :columns="columns"
        :rows="otherRows"
        row-key="id"
        :loading="otherLoading && !otherRows.length"
        :empty-title="source === 'system-update' ? 'No finished system updates' : 'No server maintenance jobs'"
        :empty-text="source === 'system-update' ? 'Core lists a system update here once it has finished.' : 'Jobs appear here after Core runs a server maintenance action.'"
        :footer="footer"
        :aria-label="sourceLabel(source)"
        :cell="cell"
        @activate="open"
      />
    </template>
    <div v-else-if="error" class="state-inline denied" role="alert">{{ error }}</div>
    <DataTable
      v-else
      :columns="columns"
      :rows="rows"
      row-key="id"
      :loading="loading && !rows.length"
      :empty-title="filtered ? 'No jobs match these filters' : 'No module jobs yet'"
      :empty-text="filtered ? 'Clear the filters to show every job.' : 'Jobs appear here after an install, enable, disable, uninstall or hotfix.'"
      :footer="footer"
      aria-label="Module job history"
      :cell="cell"
      @activate="open"
    />
    <div v-if="source === 'module' && !error && meta.pages > 1" class="toolbar mt">
      <span class="muted mono">Page {{ meta.page }} / {{ meta.pages }}</span>
      <div class="row"><button class="btn sm" :disabled="loading || meta.page <= 1" @click="go(meta.page - 1)">Previous</button><button class="btn sm" :disabled="loading || meta.page >= meta.pages" @click="go(meta.page + 1)">Next</button></div>
    </div>
    <ModuleJobLogWindow v-if="openJob" :job="openJob" :source="source" @close="openJob = null" />
  </section>
</template>
