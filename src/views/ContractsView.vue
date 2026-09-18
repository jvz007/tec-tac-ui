<script setup>
import { computed, onMounted, ref } from 'vue'
import { downloadDeveloperContracts, getDeveloperContracts } from '../contracts'

const data=ref(null), loading=ref(true), error=ref(''), query=ref(''), exporting=ref('')
const q=computed(()=>query.value.trim().toLowerCase())
const match=(...values)=>!q.value||values.some(v=>String(v??'').toLowerCase().includes(q.value))
const core=computed(()=>(data.value?.core||[]).filter(x=>match(x.area,x.import_path,x.name,x.purpose,x.audience)))
const caps=computed(()=>(data.value?.capabilities||[]).filter(x=>match(x.id,x.module_id,x.capability_version,x.state,x.description,(x.operations||[]).join(' '))))
const actions=computed(()=>(data.value?.scheduler_actions||[]).filter(x=>match(x.id,x.module_id,x.label,x.description,x.permission,(x.target_types||[]).join(' '))))
const permissions=computed(()=>(data.value?.permissions||[]).filter(x=>match(x.id,x.version,(x.permissions||[]).join(' '))))
const http=computed(()=>(data.value?.http||[]).filter(x=>match(x.route,x.name,(x.methods||[]).join(' '))))
async function refresh(){loading.value=true;error.value='';try{data.value=await getDeveloperContracts()}catch(e){error.value=e.message||'Unable to load developer contracts.'}finally{loading.value=false}}
async function exportFile(format){exporting.value=format;error.value='';try{await downloadDeveloperContracts(format)}catch(e){error.value=e.message||'Unable to export developer contracts.'}finally{exporting.value=''}}
function stateClass(state){return state==='available'?'ok':state==='unhealthy'||state==='version-incompatible'?'danger':state&&state!=='available'?'warn':''}
onMounted(refresh)
</script>

<template>
<section>
  <div class="phead"><div><span class="eyebrow">DEVELOPER CONTRACTS</span><h1>Public Contracts</h1><p>Live framework and module contracts that other Tec-Tac modules may safely build against.</p></div><div class="row"><button class="btn" :disabled="!!exporting" @click="exportFile('txt')">{{exporting==='txt'?'Exporting…':'Export Text'}}</button><button class="btn primary" :disabled="!!exporting" @click="exportFile('md')">{{exporting==='md'?'Exporting…':'Export Markdown'}}</button></div></div>
  <div v-if="error" class="auth-error">{{error}}</div>
  <div v-if="loading" class="callout mono">Loading live contract registry…</div>
  <template v-else-if="data">
    <div class="grid g4 mb"><article class="tile"><div class="lbl">Core</div><div class="big">{{data.counts?.core||0}}</div><div class="brk">Python contracts</div></article><article class="tile"><div class="lbl">Capabilities</div><div class="big">{{data.counts?.capabilities||0}}</div><div class="brk">cross-module</div></article><article class="tile"><div class="lbl">Scheduler</div><div class="big">{{data.counts?.scheduler_actions||0}}</div><div class="brk">registered actions</div></article><article class="tile"><div class="lbl">HTTP</div><div class="big">{{data.counts?.http||0}}</div><div class="brk">API routes</div></article></div>
    <div class="contracts-toolbar"><div><span class="label">FRAMEWORK</span><b class="mono">{{data.framework_version}}</b><span class="muted smalltext">Generated {{new Date(data.generated_at).toLocaleString()}}</span></div><label class="search contracts-search"><span class="sr-only">Search contracts</span><input v-model="query" placeholder="Search contracts, modules, permissions…"></label><button class="btn sm" @click="refresh">Refresh</button></div>
    <div class="callout contract-rules"><b>Integration boundary</b><span>Python <span class="mono">tec_tac.*</span> contracts inside the backend; HTTP only from browser/external processes. Optional integrations must soft-fail.</span></div>

    <div class="section-divider">Core Python contracts</div>
    <div class="tablewrap"><table><thead><tr><th>Area</th><th>Import</th><th>Function / signature</th><th>Audience</th><th>Purpose</th></tr></thead><tbody><tr v-for="item in core" :key="item.import_path+item.name"><td class="mono">{{item.area}}</td><td class="mono">{{item.import_path}}</td><td><b class="mono">{{item.name}}{{item.signature||'()'}}</b></td><td>{{item.audience}}</td><td>{{item.purpose}}</td></tr><tr v-if="!core.length"><td colspan="5" class="muted">No core contracts match the current search.</td></tr></tbody></table></div>

    <div class="section-divider">Registered capabilities</div>
    <div class="tablewrap"><table><thead><tr><th>Capability</th><th>Provider</th><th>Contract</th><th>Package</th><th>Operations</th><th>State</th></tr></thead><tbody><tr v-for="item in caps" :key="item.id"><td><b class="mono">{{item.id}}</b><span class="sub">{{item.description||'No description'}}</span><details v-if="item.metadata&&Object.keys(item.metadata).length" class="contract-meta"><summary>Published metadata</summary><pre>{{JSON.stringify(item.metadata,null,2)}}</pre></details></td><td class="mono">{{item.module_id}}</td><td class="mono">{{item.capability_version||'—'}}</td><td class="mono">{{item.installed_version||'—'}}</td><td class="mono">{{(item.operations||[]).join(', ')||'—'}}</td><td><span class="pill" :class="stateClass(item.state)">{{item.state}}</span><span v-if="item.reason" class="sub dangertext">{{item.reason}}</span></td></tr><tr v-if="!caps.length"><td colspan="6" class="muted">No registered capabilities match the current search.</td></tr></tbody></table></div>

    <div class="section-divider">Schedulable actions</div>
    <div class="tablewrap"><table><thead><tr><th>Action</th><th>Module</th><th>Targets</th><th>Permission</th><th>Risk</th></tr></thead><tbody><tr v-for="item in actions" :key="item.id"><td><b class="mono">{{item.id}}</b><span class="sub">{{item.label}} · {{item.description||'No description'}}</span></td><td class="mono">{{item.module_id}}</td><td class="mono">{{(item.target_types||[]).join(', ')}}</td><td class="mono">{{item.permission||'—'}}</td><td><span class="pill" :class="item.dangerous?'danger':''">{{item.dangerous?'dangerous':'normal'}}</span></td></tr><tr v-if="!actions.length"><td colspan="5" class="muted">No scheduler actions match the current search.</td></tr></tbody></table></div>

    <div class="section-divider">Extension permissions</div>
    <div class="tablewrap"><table><thead><tr><th>Module</th><th>Package</th><th>Permission groups</th><th>Permissions</th></tr></thead><tbody><tr v-for="item in permissions" :key="item.id"><td><b class="mono">{{item.id}}</b></td><td class="mono">{{item.version}}</td><td>{{(item.groups||[]).map(g=>g.name).join(', ')||'—'}}</td><td class="mono contract-wrap">{{(item.permissions||[]).join(', ')||'—'}}</td></tr><tr v-if="!permissions.length"><td colspan="4" class="muted">No permission contracts match the current search.</td></tr></tbody></table></div>

    <div class="section-divider">HTTP boundary</div>
    <div class="tablewrap"><table><thead><tr><th>Methods</th><th>Endpoint</th><th>Route name</th><th>Audience</th></tr></thead><tbody><tr v-for="item in http" :key="item.route"><td class="mono">{{(item.methods||[]).join(' / ')}}</td><td class="mono">{{item.route}}</td><td class="mono">{{item.name||'—'}}</td><td>{{item.audience}}</td></tr><tr v-if="!http.length"><td colspan="4" class="muted">No API contracts match the current search.</td></tr></tbody></table></div>
  </template>
</section>
</template>
