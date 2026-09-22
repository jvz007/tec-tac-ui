<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { downloadDeveloperContracts, getDeveloperContracts } from '../contracts'

const contextActions=inject('tecTacContextActions', null)
const contextInteractions=inject('tecTacContextInteractions', null)
const resourceViews=inject('tecTacResourceViews', null)
const codeEditor=inject('tecTacCodeEditor', null)
const dashboardWidgets=inject('tecTacDashboardWidgets', null)
const quickActions=inject('tecTacQuickActions', null)
const modules=inject('tecTacModules', null)
const data=ref(null), loading=ref(true), error=ref(''), query=ref(''), exporting=ref('')
const moduleStatusRows=computed(()=>modules?.list?.() || [])
const q=computed(()=>query.value.trim().toLowerCase())
const match=(...values)=>!q.value||values.some(v=>String(v??'').toLowerCase().includes(q.value))
const core=computed(()=>(data.value?.core||[]).filter(x=>match(x.area,x.import_path,x.name,x.purpose,x.audience)))
const caps=computed(()=>(data.value?.capabilities||[]).filter(x=>match(x.id,x.module_id,x.capability_version,x.state,x.description,(x.operations||[]).join(' '))))
const actions=computed(()=>(data.value?.scheduler_actions||[]).filter(x=>match(x.id,x.module_id,x.label,x.description,x.permission,(x.target_types||[]).join(' '))))
const permissions=computed(()=>(data.value?.permissions||[]).filter(x=>match(x.id,x.version,(x.permissions||[]).join(' '))))
const http=computed(()=>(data.value?.http||[]).filter(x=>match(x.route,x.name,(x.methods||[]).join(' '))))
const uiActions=computed(()=>(contextActions?.snapshot?.()||[]).filter(x=>match(x.id,x.provider,x.resource,x.label,x.group,x.permission,(x.placements||[]).join(' '))))
const uiInteractions=computed(()=>(contextInteractions?.snapshot?.()||[]).filter(x=>match(x.id,x.provider,x.surface,x.permission,(x.sourceTypes||[]).join(' '),(x.targetTypes||[]).join(' '))))
const uiResourceViews=computed(()=>(resourceViews?.snapshot?.()||[]).filter(x=>match(x.id,x.provider,x.resource,x.placement,x.label,x.permission)))
const editorContract=computed(()=>codeEditor?.snapshot?.()||{languages:[],defaults:{},providers:[],theme:'—'})
const uiDashboardWidgets=computed(()=>(dashboardWidgets?.snapshot?.()||[]).filter(x=>match(x.id,x.provider,x.title,x.category,x.permission,x.description)))
const uiQuickActions=computed(()=>(quickActions?.snapshot?.()||[]).filter(x=>match(x.id,x.provider,x.label,x.group,x.permission,x.description)))
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

    <div class="section-divider">UI runtime context actions</div>
    <div class="callout contract-rules"><b>Browser contribution boundary</b><span>Modules may contribute actions to shared resources through the Core-owned <span class="mono">contextActions</span> registry. Providers own execution; consumers list and invoke registered actions without importing provider UI internals.</span></div>
    <div class="tablewrap"><table><thead><tr><th>Action</th><th>Provider</th><th>Resource</th><th>Placements</th><th>Permission</th><th>Selection</th><th>Risk</th></tr></thead><tbody><tr v-for="item in uiActions" :key="item.id"><td><b class="mono">{{item.id}}</b><span class="sub">{{item.label}}</span></td><td class="mono">{{item.provider}}</td><td class="mono">{{item.resource}}</td><td class="mono contract-wrap">{{(item.placements||[]).join(', ')}}</td><td class="mono">{{item.permission||'—'}}</td><td class="mono">{{item.selection?.min ?? 1}}..{{item.selection?.max ?? '∞'}}</td><td><span class="pill" :class="item.dangerous?'danger':''">{{item.dangerous?'dangerous':'normal'}}</span></td></tr><tr v-if="!uiActions.length"><td colspan="7" class="muted">No UI context actions are currently registered or match the current search.</td></tr></tbody></table></div>

    <div class="section-divider">UI runtime context interactions</div>
    <div class="callout contract-rules"><b>Browser interaction boundary</b><span>Modules may contribute drag/drop behavior through the Core-owned <span class="mono">contextInteractions</span> registry. Providers own drop execution; consumers discover compatible interactions by shared surface, source type and target type without importing provider UI internals.</span></div>
    <div class="tablewrap"><table><thead><tr><th>Interaction</th><th>Provider</th><th>Surface</th><th>Source types</th><th>Target types</th><th>Permission</th><th>Order</th></tr></thead><tbody><tr v-for="item in uiInteractions" :key="item.id"><td><b class="mono">{{item.id}}</b></td><td class="mono">{{item.provider}}</td><td class="mono">{{item.surface}}</td><td class="mono contract-wrap">{{(item.sourceTypes||[]).join(', ')}}</td><td class="mono contract-wrap">{{(item.targetTypes||[]).join(', ')}}</td><td class="mono">{{item.permission||'—'}}</td><td class="mono">{{item.order}}</td></tr><tr v-if="!uiInteractions.length"><td colspan="7" class="muted">No UI context interactions are currently registered or match the current search.</td></tr></tbody></table></div>

    <div class="section-divider">Resource view contributions</div>
    <div class="callout contract-rules"><b>Cross-module view boundary</b><span>Provider modules register visual contributions through the Core-owned <span class="mono">resourceViews</span> registry. Consumer modules expose named resource/placement surfaces and render matching contributions without importing provider UI code.</span></div>
    <div class="tablewrap"><table><thead><tr><th>View</th><th>Provider</th><th>Resource</th><th>Placement</th><th>Permission</th><th>Order</th></tr></thead><tbody><tr v-for="item in uiResourceViews" :key="item.id"><td><b class="mono">{{item.id}}</b><span class="sub">{{item.label}}</span></td><td class="mono">{{item.provider}}</td><td class="mono">{{item.resource}}</td><td class="mono">{{item.placement}}</td><td class="mono">{{item.permission||'—'}}</td><td class="mono">{{item.order}}</td></tr><tr v-if="!uiResourceViews.length"><td colspan="6" class="muted">No resource view contributions are currently registered or match the current search.</td></tr></tbody></table></div>

    <div class="section-divider">Quick Action contributions</div>
    <div class="callout contract-rules"><b>Personal shortcut boundary</b><span>Authenticated modules may register safe browser actions through the module-scoped <span class="mono">quickActions</span> registry. Core owns persistence, ordering, permission checks and the top-bar surface; providers own execution.</span></div>
    <div class="tablewrap"><table><thead><tr><th>Action</th><th>Provider</th><th>Group</th><th>Permission</th><th>Direct pin</th><th>Risk</th></tr></thead><tbody><tr v-for="item in uiQuickActions" :key="item.id"><td><b class="mono">{{item.id}}</b><span class="sub">{{item.label}} · {{item.description||'No description'}}</span></td><td class="mono">{{item.provider}}</td><td>{{item.group}}</td><td class="mono">{{item.permission||'—'}}</td><td><span class="pill">{{item.directPin?'yes':'module only'}}</span></td><td><span class="pill" :class="item.dangerous?'danger':''">{{item.dangerous?'dangerous':'normal'}}</span></td></tr><tr v-if="!uiQuickActions.length"><td colspan="6" class="muted">No module Quick Actions are currently registered or match the current search.</td></tr></tbody></table></div>

    <div class="section-divider">Module notifications / toasts</div>
    <div class="callout contract-rules"><b>Operator notification boundary</b><span>Authenticated modules receive the Core-owned, module-scoped <span class="mono">notifications</span> service. Use it for transient in-app notices such as report completion, warnings and action failures; durable alert state remains module/backend owned.</span></div>
    <div class="tablewrap"><table><thead><tr><th>Method</th><th>Use</th></tr></thead><tbody>
      <tr><td class="mono">notifications.info(message, options)</td><td>Normal informational notice.</td></tr>
      <tr><td class="mono">notifications.success(message, options)</td><td>Successful completion such as a report or scan finishing.</td></tr>
      <tr><td class="mono">notifications.warning(message, options)</td><td>Actionable warning that does not require a modal.</td></tr>
      <tr><td class="mono">notifications.error(message, options)</td><td>Operation failure or important error.</td></tr>
      <tr><td class="mono">notifications.show({...})</td><td>Explicit level/title/duration/dedupe/action configuration.</td></tr>
      <tr><td class="mono">notifications.dismiss(id) · notifications.clear()</td><td>Dismiss one toast or clear the calling module's visible toasts.</td></tr>
    </tbody></table></div>

    <div class="section-divider">Authenticated module API helpers</div>
    <div class="callout contract-rules"><b>Browser transport boundary</b><span>Authenticated modules use Core-owned request helpers and must not read Tactical tokens or browser authentication storage directly.</span></div>
    <div class="tablewrap"><table><thead><tr><th>Helper</th><th>Response</th><th>Use</th></tr></thead><tbody>
      <tr><td><b class="mono">api(path, options)</b></td><td>parsed payload</td><td>Existing JSON/text API calls.</td></tr>
      <tr><td><b class="mono">apiRaw(path, options)</b></td><td class="mono">Response</td><td>Authenticated downloads, uploads and custom media types.</td></tr>
      <tr><td><b class="mono">apiBlob(path, options)</b></td><td class="mono">Blob</td><td>PDF, image, ZIP and other binary responses.</td></tr>
      <tr><td><b class="mono">apiText(path, options)</b></td><td class="mono">string</td><td>HTML, text and textual exports.</td></tr>
    </tbody></table></div>

    <div class="section-divider">Dashboard widget contributions</div>
    <div class="callout contract-rules"><b>Dashboard composition boundary</b><span>Core owns dashboard persistence, visibility and layout. Authenticated modules contribute permitted widgets through the module-scoped <span class="mono">dashboardWidgets</span> registry.</span></div>
    <div class="tablewrap"><table><thead><tr><th>Widget</th><th>Provider</th><th>Category</th><th>Default size</th><th>Permission</th></tr></thead><tbody><tr v-for="item in uiDashboardWidgets" :key="item.id"><td><b class="mono">{{item.id}}</b><span class="sub">{{item.title}} · {{item.description||'No description'}}</span></td><td class="mono">{{item.provider}}</td><td>{{item.category}}</td><td class="mono">{{item.defaultSize.w}}×{{item.defaultSize.h}}</td><td class="mono">{{item.permission||'—'}}</td></tr><tr v-if="!uiDashboardWidgets.length"><td colspan="5" class="muted">No dashboard widgets are currently registered or match the current search.</td></tr></tbody></table></div>

    <div class="section-divider">Shared module code editor</div>
    <div class="callout contract-rules"><b>Editor infrastructure boundary</b><span>Authenticated modules consume the Core-owned <span class="mono">codeEditor</span> contract. Monaco and its workers are bundled under <span class="mono">/tec-tac/</span>; modules do not import Monaco, Tactical editor assets or CDN runtimes directly.</span></div>
    <div class="tablewrap"><table><thead><tr><th>Capability</th><th>Contract</th></tr></thead><tbody>
      <tr><td>Languages</td><td class="mono">{{editorContract.languages.join(', ')}}</td></tr>
      <tr><td>Editor</td><td class="mono">create · get/set value · selection · insert/replace · language · read-only · undo/redo · layout · events · dispose</td></tr>
      <tr><td>Models</td><td class="mono">createModel · getModel · setModel · content/undo state · view-state restore</td></tr>
      <tr><td>Providers</td><td class="mono">registerCompletionProvider · registerHoverProvider · registerDiagnosticsProvider · module-scoped disposal</td></tr>
      <tr><td>Theme</td><td class="mono">{{editorContract.theme}}</td></tr>
      <tr><td>Active provider registrations</td><td class="mono">{{editorContract.providers.reduce((n,item)=>n+item.count,0)}}</td></tr>
    </tbody></table></div>

    <div class="section-divider">HTTP boundary</div>
    <div class="tablewrap"><table><thead><tr><th>Methods</th><th>Endpoint</th><th>Route name</th><th>Audience</th></tr></thead><tbody><tr v-for="item in http" :key="item.route"><td class="mono">{{(item.methods||[]).join(' / ')}}</td><td class="mono">{{item.route}}</td><td class="mono">{{item.name||'—'}}</td><td>{{item.audience}}</td></tr><tr v-if="!http.length"><td colspan="4" class="muted">No API contracts match the current search.</td></tr></tbody></table></div>
  </template>
  <article class="card mt">
    <div class="cardhead"><div><span class="eyebrow">BROWSER RUNTIME</span><h3>Module availability runtime</h3></div><span class="pill">{{ moduleStatusRows.length }}</span></div>
    <p class="muted">Authenticated modules receive <code>modules</code> for zero-request installed/enabled checks. Backend capability checks remain authoritative at execution time.</p>
  </article>
</section>
</template>
