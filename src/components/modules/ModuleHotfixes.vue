<script setup>
// 0.12.119: the Hotfixes tab of the Module Manager on the brand board (P3 cards, P1 kit tables). Presentational only: values come in as
// props with the names ModulesView.vue gives them and the handlers leave as events with the handler's name. The apply flow, the inspect,
// the discard, the job log and the plain Yes or No on rollback are ModulesView.vue's and work as before.
// The board keeps buttons out of table rows, so Roll back moved from the row to an action bar above the applied table: select a row,
// press Roll back hotfix. Only the newest hotfix can be rolled back, with the same two titles as before.
import { computed, ref, watch } from 'vue'
import { DataTable } from '../../shared-kit.js'
import { formatDateTime } from '../../date-format'
import { HOTFIX_APPLIED_COLUMNS, HOTFIX_TARGET_COLUMNS, hotfixAppliedCell, hotfixTargetCell } from '../../module-manager-tables'

const props = defineProps({
  canManage: { type: Boolean, default: false },
  modules: { type: Array, default: () => [] },
  hotfixFiles: { type: Array, default: () => [] },
  hotfixZip: { type: Object, default: null },
  hotfixSignature: { type: Object, default: null },
  hotfixMetadata: { type: Object, default: null },
  hotfixInspecting: { type: Boolean, default: false },
  hotfixStaged: { type: Object, default: null },
  hotfixPreview: { type: Object, default: null },
  hotfixTrust: { type: Object, default: null },
  hotfixJob: { type: Object, default: null },
  hotfixJobError: { type: String, default: '' },
  hotfixJobRunning: { type: Boolean, default: false },
  hotfixSelectedModuleId: { type: String, default: null },
  hotfixRows: { type: Array, default: () => [] },
  hotfixLoading: { type: Boolean, default: false },
})
const emit = defineEmits(['chooseHotfixFile', 'inspectHotfix', 'discardHotfixStage', 'applyHotfix', 'rollbackHotfix', 'loadHotfixRows', 'update:hotfixSelectedModuleId'])

const appliedCell = hotfixAppliedCell((value) => formatDateTime(value))
const targetRows = computed(() => (props.hotfixPreview?.targets || []).map((target) => ({ ...target, key: `${target.component}:${target.path}` })))
const pickedId = ref(null)
// A different module, or a list that changed (an apply or a rollback finished), clears the pick.
watch(() => [props.hotfixSelectedModuleId, props.hotfixRows], () => { pickedId.value = null })
// index is the position of the picked row (-1 when none), so the old rule reads the same: only the last row, the newest, can be rolled back.
const index = computed(() => props.hotfixRows.findIndex((row) => row.id === pickedId.value))
const pickedRow = computed(() => (index.value >= 0 ? props.hotfixRows[index.value] : null))

function moduleChosen(event) {
  const value = event.target.value
  const id = value === '' ? null : value
  emit('update:hotfixSelectedModuleId', id)
  emit('loadHotfixRows', id)
}
</script>

<template>
  <div class="grid g2 mb mm-hotfixes">
    <section class="card mm-card">
      <div class="cardhead mm-cardhead"><div><span class="eyebrow">MANAGED HOTFIX</span><h3>Inspect & apply</h3><p class="mm-lede">Hotfixes are exact-version, SHA-256-bound module file replacements managed by Core.</p></div><span v-if="hotfixStaged" class="pill ok">INSPECTED</span></div>
      <div v-if="!hotfixStaged" class="mm-drop mm-drop-hotfix" :class="{disabled:!canManage||hotfixInspecting||hotfixJobRunning}" role="button" tabindex="0" @click="emit('chooseHotfixFile')" @keydown.enter.prevent="emit('chooseHotfixFile')">
        <div><b>{{ hotfixZip?.name || 'Choose signed hotfix files' }}</b><span>{{ hotfixZip ? `${hotfixFiles.length} file${hotfixFiles.length===1?'':'s'} selected` : 'ZIP + detached .sig + .release.json' }}</span></div>
      </div>
      <div v-if="hotfixZip&&!hotfixStaged" class="state-inline mt" :class="{warning:!hotfixSignature||!hotfixMetadata}"><b>Publisher trust.</b> <span v-if="hotfixSignature&&hotfixMetadata">Detached signature and release metadata detected. Core will verify them again as root immediately before apply.</span><span v-else>Signature companions are incomplete. Production trust policy will reject unsigned hotfixes; development systems follow the configured root trust floor.</span></div>
      <div v-if="hotfixZip&&!hotfixStaged" class="mm-footer"><button class="btn" @click="emit('discardHotfixStage')">Clear</button><span class="spacer"></span><button class="btn primary" :disabled="hotfixInspecting||hotfixJobRunning" @click="emit('inspectHotfix')">{{hotfixInspecting?'Inspecting…':'Inspect hotfix'}}</button></div>
      <div v-if="hotfixStaged" class="hotfix-preview mm-hotfix-preview">
        <dl class="mm-facts mm-facts-two"><div class="mm-fact"><dt>Module</dt><dd class="mono">{{hotfixPreview?.module_id}}</dd></div><div class="mm-fact"><dt>Hotfix</dt><dd class="mono">{{hotfixPreview?.id}}</dd></div><div class="mm-fact"><dt>Base version</dt><dd class="mono">{{hotfixPreview?.base_version}}</dd></div><div class="mm-fact"><dt>Files</dt><dd>{{hotfixPreview?.targets?.length||0}}</dd></div><div class="mm-fact"><dt>Reload</dt><dd class="mono">{{hotfixPreview?.reload||'none'}}</dd></div><div class="mm-fact"><dt>UI sync</dt><dd>{{hotfixPreview?.ui_sync?'yes':'no'}}</dd></div><div class="mm-fact"><dt>Package trust</dt><dd><span class="pill" :class="hotfixTrust?.verified&&hotfixTrust?.trusted?'ok':(hotfixTrust?.state==='unsigned'?'warn':'danger')">{{ hotfixTrust?.verified&&hotfixTrust?.trusted?'verified':(hotfixTrust?.state||'unknown') }}</span></dd></div><div class="mm-fact"><dt>Publisher</dt><dd>{{ hotfixTrust?.publisher_display_name || hotfixTrust?.publisher_id || '—' }}</dd></div><div class="mm-fact"><dt>Signing key</dt><dd class="mono">{{ hotfixTrust?.key_id || '—' }}</dd></div></dl>
        <p class="compact-copy">{{hotfixPreview?.description||'No description supplied.'}}</p>
        <DataTable :columns="HOTFIX_TARGET_COLUMNS" :rows="targetRows" row-key="key" empty-title="No files" empty-text="This hotfix lists no files." aria-label="Hotfix files" :footer="`${targetRows.length} file${targetRows.length===1?'':'s'}`" :cell="hotfixTargetCell" />
        <div class="mm-footer"><button class="btn" :disabled="hotfixJobRunning" @click="emit('discardHotfixStage')">Discard</button><span class="spacer"></span><button class="btn primary" :disabled="hotfixJobRunning" @click="emit('applyHotfix')">Apply hotfix</button></div>
      </div>
      <div v-if="hotfixJobError" class="auth-error mt">{{hotfixJobError}}</div>
      <div v-if="hotfixJob" class="state-inline mt" :class="{warning:hotfixJobRunning,denied:['failed','dispatch_failed'].includes(hotfixJob.status)}"><b>{{hotfixJob.action}} {{hotfixJob.hotfix_id}}</b> · {{hotfixJob.status}} · <span class="mono">{{hotfixJob.stage}}</span><pre v-if="hotfixJob.log_tail?.length" class="job-log mm-joblog">{{hotfixJob.log_tail.join('\n')}}</pre></div>
    </section>
    <section class="card mm-card">
      <div class="cardhead mm-cardhead"><div><span class="eyebrow">APPLIED STATE</span><h3>Module hotfixes</h3><p class="mm-lede">Rollback is newest-first and fails closed if files changed after application.</p></div></div>
      <label class="field"><span>Module</span><select :value="hotfixSelectedModuleId" @change="moduleChosen"><option :value="null">Select module</option><option v-for="item in modules.filter(x=>x.managed)" :key="item.id" :value="item.id">{{item.id}} · {{item.extension_version}} · {{item.hotfixes?.count||0}} hotfixes</option></select></label>
      <div v-if="hotfixLoading" class="state-inline">Loading applied hotfixes…</div>
      <div v-else-if="hotfixSelectedModuleId&&!hotfixRows.length" class="state-inline"><b>No active hotfixes.</b> This module is running its normal installed package state.</div>
      <template v-else-if="hotfixRows.length">
        <div class="mm-actionbar" role="toolbar" aria-label="Hotfix actions"><span class="muted smalltext">{{ pickedRow ? `Selected: ${pickedRow.id}` : 'Select a hotfix to roll it back.' }}</span><span class="spacer"></span><button class="btn sm danger" type="button" :disabled="hotfixJobRunning||index!==hotfixRows.length-1" :title="!pickedRow?'Select a hotfix in the table first':(index!==hotfixRows.length-1?'Roll back newer hotfixes first':'Roll back this hotfix')" @click="emit('rollbackHotfix', pickedRow)">Roll back hotfix</button></div>
        <DataTable :columns="HOTFIX_APPLIED_COLUMNS" :rows="hotfixRows" row-key="id" :selected-key="pickedId" aria-label="Applied hotfixes" :footer="`${hotfixRows.length} hotfix${hotfixRows.length===1?'':'es'}, newest last`" :cell="appliedCell" @select="(row) => pickedId = row.id" @activate="(row) => pickedId = row.id" />
      </template>
    </section>
  </div>
</template>
