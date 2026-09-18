<script setup>
import { computed, onMounted, ref } from 'vue'
import { createSchedule, deleteSchedule, listScheduledActions, listScheduleRuns, listSchedules, runScheduleNow, updateSchedule } from '../scheduler'

const actions=ref([]), schedules=ref([]), runs=ref([]), loading=ref(true), error=ref(''), saving=ref(false), selectedId=ref(null), editing=ref(false)
const browserTz=Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const weekdays=[['Mon',0],['Tue',1],['Wed',2],['Thu',3],['Fri',4],['Sat',5],['Sun',6]]
const draft=ref(blank())
function blank(){return {name:'',action_id:'tec-tac.scheduler-test',target_mode:'snapshot',targets:'{"type":"none"}',parameters:'{"message":"Tec-Tac scheduler test event executed."}',schedule_type:'once',timezone:browserTz,run_at:'',run_time:'09:00',weekdays:[0,1,2,3,4],day_of_month:1,enabled:true,missed_policy:'run_on_recovery',missed_grace_minutes:60,concurrency_policy:'skip',retry_count:0,retry_delay_seconds:60}}
const selected=computed(()=>schedules.value.find(x=>x.id===selectedId.value)||null)
const enabledCount=computed(()=>schedules.value.filter(x=>x.enabled).length)
const failingCount=computed(()=>schedules.value.filter(x=>x.last_status==='failed').length)
const actionById=computed(()=>Object.fromEntries(actions.value.map(x=>[x.id,x])))
function localInput(iso){ if(!iso)return ''; const d=new Date(iso); const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
function toIso(local){ if(!local)return null; return new Date(local).toISOString() }
function nextLabel(iso){return iso?new Date(iso).toLocaleString():'—'}
async function refresh(){error.value=''; try{const [a,s,r]=await Promise.all([listScheduledActions(),listSchedules(),listScheduleRuns()]);actions.value=a.actions||[];schedules.value=s.schedules||[];runs.value=r.runs||[];if(selectedId.value&&!schedules.value.some(x=>x.id===selectedId.value))selectedId.value=null}catch(e){error.value=e.message||'Unable to load schedules.'}finally{loading.value=false}}
function createNew(){draft.value=blank(); editing.value=true; selectedId.value=null}
function edit(item){selectedId.value=item.id; draft.value={...blank(),...item,targets:JSON.stringify(item.targets||{},null,2),parameters:JSON.stringify(item.parameters||{},null,2),run_at:localInput(item.run_at),run_time:(item.run_time||'09:00').slice(0,5),weekdays:[...(item.weekdays||[])]};editing.value=true}
function toggleDay(day){const set=new Set(draft.value.weekdays||[]);set.has(day)?set.delete(day):set.add(day);draft.value.weekdays=[...set].sort()}
function payload(){let targets,parameters;try{targets=JSON.parse(draft.value.targets||'{}');parameters=JSON.parse(draft.value.parameters||'{}')}catch{throw new Error('Targets and Parameters must contain valid JSON.')}return {...draft.value,targets,parameters,run_at:draft.value.schedule_type==='once'?toIso(draft.value.run_at):null,run_time:draft.value.schedule_type==='once'?null:draft.value.run_time,weekdays:draft.value.schedule_type==='weekly'?draft.value.weekdays:[],day_of_month:draft.value.schedule_type==='monthly'?Number(draft.value.day_of_month):null}}
async function save(){saving.value=true;error.value='';try{const data=payload();if(selectedId.value)await updateSchedule(selectedId.value,data);else await createSchedule(data);editing.value=false;await refresh()}catch(e){error.value=e.message||'Unable to save schedule.'}finally{saving.value=false}}
async function remove(item){if(!confirm(`Delete schedule ${item.name}? Execution history for this schedule will also be removed.`))return;try{await deleteSchedule(item.id);selectedId.value=null;editing.value=false;await refresh()}catch(e){error.value=e.message}}
async function runNow(item){try{await runScheduleNow(item.id);await new Promise(r=>setTimeout(r,700));await refresh()}catch(e){error.value=e.message}}
function statusClass(v){return v==='succeeded'?'ok':v==='failed'?'danger':v==='running'||v==='queued'?'warn':''}
onMounted(refresh)
</script>

<template>
<section>
  <div class="phead"><div><span class="eyebrow">FRAMEWORK SCHEDULER</span><h1>Schedules</h1><p>One scheduling engine for Tec-Tac modules. Modules define actions; the framework owns timing, retries and execution history.</p></div><button class="btn primary" @click="createNew">New schedule</button></div>
  <div v-if="error" class="auth-error">{{error}}</div>
  <div class="grid g4 mb"><article class="tile"><div class="lbl">Schedules</div><div class="big">{{schedules.length}}</div><div class="brk">configured</div></article><article class="tile"><div class="lbl">Enabled</div><div class="big">{{enabledCount}}</div><div class="brk">eligible to run</div></article><article class="tile"><div class="lbl">Actions</div><div class="big">{{actions.length}}</div><div class="brk">registered</div></article><article class="tile"><div class="lbl">Failed</div><div class="big">{{failingCount}}</div><div class="brk">last execution</div></article></div>
  <div v-if="loading" class="callout mono">Loading scheduler…</div>
  <div v-else class="schedule-layout">
    <section>
      <div v-if="!schedules.length" class="state-inline"><b>No schedules configured.</b> Create a Scheduler Test Event first, then modules can register their own actions.</div>
      <div v-else class="tablewrap"><table><thead><tr><th>Schedule</th><th>Action</th><th>Timing</th><th>Next run</th><th>Last result</th><th>State</th><th></th></tr></thead><tbody>
        <tr v-for="item in schedules" :key="item.id" class="clickrow" :class="{selected:selectedId===item.id}" @click="edit(item)">
          <td><b>{{item.name}}</b><span class="sub mono">{{item.timezone}}</span></td><td><b>{{item.action_label}}</b><span class="sub mono">{{item.action_id}}</span></td><td><span class="mono">{{item.schedule_type}}</span><span class="sub" v-if="item.schedule_type!=='once'">{{(item.run_time||'').slice(0,5)}}</span></td><td class="mono">{{nextLabel(item.next_run_at)}}</td><td><span class="pill" :class="statusClass(item.last_status)">{{item.last_status||'never'}}</span></td><td><span class="pill" :class="item.enabled?'ok':'warn'">{{item.enabled?'enabled':'disabled'}}</span></td><td><button class="btn sm" @click.stop="runNow(item)">Run now</button></td>
        </tr>
      </tbody></table></div>
      <div class="section-divider">Execution history</div>
      <div v-if="!runs.length" class="muted smalltext">No scheduler runs yet.</div>
      <div v-else class="tablewrap"><table><thead><tr><th>Time</th><th>Schedule</th><th>Status</th><th>Attempt</th><th>Result / Error</th></tr></thead><tbody><tr v-for="run in runs.slice(0,50)" :key="run.id"><td class="mono">{{nextLabel(run.created_at)}}</td><td>{{run.schedule_name}}</td><td><span class="pill" :class="statusClass(run.status)">{{run.status}}</span></td><td class="mono">{{run.attempt}}</td><td class="mono schedule-result">{{run.error || (run.result?.message || JSON.stringify(run.result||{}))}}</td></tr></tbody></table></div>
    </section>
    <aside v-if="editing" class="card schedule-editor">
      <div class="cardhead"><div><span class="eyebrow">{{selectedId?'EDIT SCHEDULE':'NEW SCHEDULE'}}</span><h3>{{draft.name||'Untitled schedule'}}</h3></div></div>
      <label class="field"><span>Name</span><input v-model="draft.name" autocomplete="off"></label>
      <label class="field"><span>Action</span><select v-model="draft.action_id"><option v-for="a in actions" :key="a.id" :value="a.id">{{a.label}} · {{a.module_id}}</option></select></label>
      <div class="field-grid"><label class="field"><span>Schedule</span><select v-model="draft.schedule_type"><option value="once">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label><label class="field"><span>Timezone</span><input v-model="draft.timezone" class="mono"></label></div>
      <label v-if="draft.schedule_type==='once'" class="field"><span>Run at</span><input v-model="draft.run_at" type="datetime-local"></label>
      <label v-else class="field"><span>Run time</span><input v-model="draft.run_time" type="time"></label>
      <div v-if="draft.schedule_type==='weekly'" class="field"><span>Weekdays</span><div class="weekday-row"><button v-for="[label,day] in weekdays" :key="day" type="button" class="btn sm" :class="{primary:draft.weekdays.includes(day)}" @click="toggleDay(day)">{{label}}</button></div></div>
      <label v-if="draft.schedule_type==='monthly'" class="field"><span>Day of month</span><input v-model.number="draft.day_of_month" type="number" min="1" max="31"></label>
      <label class="field"><span>Targets (JSON)</span><textarea v-model="draft.targets" class="mono schedule-json" rows="4"></textarea></label>
      <label class="field"><span>Parameters (JSON)</span><textarea v-model="draft.parameters" class="mono schedule-json" rows="5"></textarea></label>
      <div class="field-grid"><label class="field"><span>Missed run</span><select v-model="draft.missed_policy"><option value="skip">Skip</option><option value="run_on_recovery">Run on recovery</option><option value="expire">Expire</option></select></label><label class="field"><span>Concurrency</span><select v-model="draft.concurrency_policy"><option value="skip">Skip while running</option><option value="queue">Queue</option><option value="allow">Allow overlap</option></select></label></div>
      <div class="field-grid"><label class="field"><span>Retries</span><input v-model.number="draft.retry_count" type="number" min="0" max="10"></label><label class="field"><span>Retry delay (sec)</span><input v-model.number="draft.retry_delay_seconds" type="number" min="1"></label></div>
      <label class="checkline"><input v-model="draft.enabled" type="checkbox"> Enabled</label>
      <div class="editor-actions"><button class="btn primary" :disabled="saving||!draft.name||!draft.action_id" @click="save">{{saving?'Saving…':'Save schedule'}}</button><button class="btn" @click="editing=false">Cancel</button><button v-if="selected" class="btn danger" @click="remove(selected)">Delete</button></div>
    </aside>
  </div>
</section>
</template>
