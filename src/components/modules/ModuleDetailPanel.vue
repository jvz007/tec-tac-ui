<script setup>
// 0.12.119: the module detail panel on the brand board (P2: properties as stacked facts, then the actions). Presentational only:
// values come in as props with the names ModulesView.vue gives them, and Hide, Show, Disable, Enable, Remove and Open leave as events
// with the handler's name. The words are the ones 0.12.118 showed; the confirmation steps stay in ModulesView.vue.
import { categoryBadge, categoryNote } from '../../module-category'
import { replacementSummary } from '../../module-replacement'

defineProps({
  selected: { type: Object, required: true },
  selectedLoad: { type: Object, required: true },
  canOpenSelected: { type: Boolean, default: false },
  canManage: { type: Boolean, default: false },
  jobRunning: { type: Boolean, default: false },
  // The page's satisfiedFor(row, id): the line under a dependency that says what satisfies it.
  satisfiedFor: { type: Function, required: true },
})
const emit = defineEmits(['openSelectedModule', 'setVisibility', 'ask'])
</script>

<template>
  <aside class="module-detail card mm-card mm-detail">
    <div class="cardhead mm-cardhead"><div><span class="eyebrow">MODULE DETAIL</span><h3>{{ selected.id }}</h3></div><div class="module-detail-head-actions"><span class="pill" :class="selected.enabled?'ok':'warn'">{{ selected.enabled?'ENABLED':'DISABLED' }}</span><button v-if="canOpenSelected" class="btn primary sm module-open-btn" type="button" @click="emit('openSelectedModule')">Open</button></div></div>
    <dl class="mm-facts module-kv">
      <div class="mm-fact"><dt>Extension</dt><dd class="mono">v{{ selected.extension_version }}</dd></div>
      <div class="mm-fact"><dt>ReportSet</dt><dd class="mono">v{{ selected.reportset_version }}</dd></div>
      <div class="mm-fact"><dt>Managed</dt><dd>{{ selected.managed?'yes':'no' }}</dd></div>
      <div v-if="categoryBadge(selected).known" class="mm-fact"><dt>Category</dt><dd><span class="pill" :class="categoryBadge(selected).tone">{{ categoryBadge(selected).label }}</span></dd></div>
      <div class="mm-fact"><dt>Navigation</dt><dd>{{ selected.visible!==false?'visible':'hidden' }}</dd></div>
      <div class="mm-fact"><dt>UI load</dt><dd><span class="pill" :class="{ok:selectedLoad.state==='loaded',warn:['skipped','unknown'].includes(selectedLoad.state),danger:['failed','runtime-error'].includes(selectedLoad.state)}">{{ selectedLoad.label }}</span></dd></div>
      <div class="mm-fact"><dt>Source</dt><dd class="module-source">{{ selected.source?.repository_name || selected.source?.repository_id || 'local / offline' }}</dd></div>
      <div class="mm-fact"><dt>SHA256</dt><dd class="mono module-source">{{ selected.source?.package_sha256 ? selected.source.package_sha256.slice(0,16)+'…' : '—' }}</dd></div>
      <div class="mm-fact"><dt>Permissions</dt><dd>{{ selected.permission_count||0 }}</dd></div>
      <template v-if="selected.publisher_trust">
        <div class="mm-fact"><dt>Package trust</dt><dd><span class="pill" :class="selected.publisher_trust.verified&&selected.publisher_trust.trusted?'ok':(selected.publisher_trust.state==='unsigned'?'':'danger')">{{ selected.publisher_trust.verified&&selected.publisher_trust.trusted?'verified':(selected.publisher_trust.state||'unknown') }}</span></dd></div>
        <div class="mm-fact"><dt>Signed by</dt><dd>{{ selected.publisher_trust.publisher_display_name || selected.publisher_trust.publisher_id || '—' }}</dd></div>
        <div class="mm-fact"><dt>Signing key</dt><dd class="mono">{{ selected.publisher_trust.key_id || '—' }}</dd></div>
      </template>
    </dl>
    <div v-if="selectedLoad.state==='failed'" class="state-inline denied module-load-error"><b>Authenticated UI failed to load.</b><code>{{ selectedLoad.detail }}</code><span>Runtime and visibility state are unchanged; fix the module UI package and reload Tec-Tac.</span></div>
    <div v-else-if="selectedLoad.state==='runtime-error'" class="state-inline denied module-load-error"><b>Authenticated UI raised a runtime error.</b><code>{{ selectedLoad.detail }}</code><span>Core contained the failure; the rest of Tec-Tac is unaffected. Reload Tec-Tac or fix the module UI.</span></div>
    <div v-else-if="selectedLoad.state==='skipped' || selectedLoad.state==='unknown'" class="state-inline warning module-load-error"><b>Authenticated UI {{ selectedLoad.label }}.</b><code>{{ selectedLoad.detail }}</code></div>
    <div v-for="(line,index) in categoryNote(selected)" :key="'cat'+index" class="state-inline warning module-category-note">{{ line }}</div>
    <template v-if="replacementSummary(selected).lines.length">
      <div class="section-divider">Replacement <span v-if="replacementSummary(selected).badge" class="pill" :class="replacementSummary(selected).tone">{{ replacementSummary(selected).badge }}</span></div>
      <div v-for="(line,index) in replacementSummary(selected).lines" :key="index" class="muted smalltext">{{ line }}</div>
    </template>
    <div class="section-divider">Hard dependencies</div>
    <div v-if="!Object.keys(selected.dependencies||{}).length" class="muted smalltext">None</div>
    <div v-for="(constraint,id) in selected.dependencies" :key="id" class="module-meta"><b>{{ id }}</b><span class="mono">{{ constraint }}</span><span v-if="satisfiedFor(selected,id)" class="muted smalltext">{{ satisfiedFor(selected,id) }}</span></div>
    <div class="section-divider">Required by</div>
    <div v-if="!selected.dependants?.length" class="muted smalltext">No installed dependants</div>
    <div v-for="d in selected.dependants" :key="d.id" class="module-meta"><b>{{ d.id }}</b><span class="mono">{{ d.constraint }}</span></div>
    <div v-if="selected.runtime_requirements?.length" class="section-divider">Runtime requirements</div>
    <div v-for="r in selected.runtime_requirements" :key="r.component" class="module-meta"><b>{{ r.component }}</b><span class="mono">{{ r.current||'unknown' }} / {{ r.constraint }} {{ r.satisfied?'✓':'✕' }}</span></div>
    <div v-if="selected.managed" class="module-actions mm-actions"><button v-if="selected.visible!==false" class="btn" :disabled="!canManage||jobRunning" title="Keep the module active but remove its top-level navigation entry" @click="emit('setVisibility', selected, false)">Hide</button><button v-else class="btn" :disabled="!canManage||jobRunning" title="Restore the module's top-level navigation entry" @click="emit('setVisibility', selected, true)">Show</button><button v-if="selected.enabled" class="btn warnbtn" :disabled="!canManage||jobRunning" @click="emit('ask', selected, 'disable')">Disable</button><button v-else class="btn primary" :disabled="!canManage||jobRunning" @click="emit('ask', selected, 'enable')">Enable</button><button class="btn danger" :disabled="!canManage||jobRunning" @click="emit('ask', selected, 'remove')">Remove</button></div>
  </aside>
</template>
