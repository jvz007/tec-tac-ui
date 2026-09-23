<script setup>
import { computed, onMounted, ref } from 'vue'
import { getSchedulerConfig, getSchedulerHealth, runSchedulerSelfTest, updateSchedulerConfig } from '../scheduler'

const config=ref(null), health=ref(null), loading=ref(true), refreshing=ref(false), saving=ref(false), selfTesting=ref(''), error=ref(''), notice=ref('')
const configDraft=ref(48)
const healthState=computed(()=>health.value?.tick_health || 'unknown')
function nextLabel(iso){return iso?new Date(iso).toLocaleString():'—'}
function statusClass(v){return v==='succeeded'||v==='healthy'?'ok':v==='failed'||v==='degraded'?'danger':v==='running'||v==='queued'||v==='unknown'?'warn':''}
async function load({quiet=false}={}){
  if(quiet) refreshing.value=true; else loading.value=true
  error.value=''
  try{
    const [c,h]=await Promise.all([getSchedulerConfig(),getSchedulerHealth()])
    config.value=c
    configDraft.value=c.once_retention_hours
    health.value=h
  }catch(e){error.value=e.message||'Unable to load Scheduler configuration.'}
  finally{loading.value=false;refreshing.value=false}
}
async function saveConfig(){
  saving.value=true;error.value='';notice.value=''
  try{
    config.value=await updateSchedulerConfig({once_retention_hours:Number(configDraft.value)})
    configDraft.value=config.value.once_retention_hours
    notice.value='Scheduler configuration saved.'
    setTimeout(()=>{notice.value=''},3000)
  }catch(e){error.value=e.message||'Unable to save Scheduler configuration.'}
  finally{saving.value=false}
}
async function selfTest(mode){
  selfTesting.value=mode;error.value='';notice.value=''
  try{
    await runSchedulerSelfTest(mode)
    notice.value=mode==='scheduled'?'Scheduled self-test created for approximately two minutes from now.':`${mode} self-test queued.`
    await new Promise(r=>setTimeout(r,800))
    await load({quiet:true})
  }catch(e){error.value=e.message||'Scheduler self-test failed.'}
  finally{selfTesting.value=''}
}
onMounted(load)
</script>

<template>
<section>
  <div class="phead">
    <div><span class="eyebrow">ADMINISTRATION / SCHEDULER</span><h1>Scheduler Configuration</h1><p>Framework-owned retention, runtime health and execution-path diagnostics for the shared Tec-Tac Scheduler.</p></div>
    <button class="btn" :disabled="loading||refreshing" @click="load({quiet:true})">{{refreshing?'Refreshing…':'Refresh diagnostics'}}</button>
  </div>

  <div v-if="error" class="auth-error">{{error}}</div><div v-if="notice" class="state-inline">{{notice}}</div>
  <div v-if="loading" class="callout mono">Loading Scheduler configuration…</div>
  <template v-else>
    <div class="grid g4 mb">
      <article class="tile"><div class="lbl">Runtime</div><div class="big compact"><span class="pill" :class="statusClass(healthState)">{{healthState}}</span></div><div class="brk">scheduler tick health</div></article>
      <article class="tile"><div class="lbl">Enabled</div><div class="big">{{health?.enabled_schedules ?? '—'}}</div><div class="brk">schedules eligible to run</div></article>
      <article class="tile"><div class="lbl">Queued / running</div><div class="big compact mono">{{health?.queued_runs ?? '—'}} / {{health?.running_runs ?? '—'}}</div><div class="brk">current execution load</div></article>
      <article class="tile"><div class="lbl">Failed</div><div class="big">{{health?.failed_last_24h ?? '—'}}</div><div class="brk">runs in the last 24 hours</div></article>
    </div>

    <div class="scheduler-config-grid">
      <article class="card scheduler-config-card">
        <div class="cardhead"><div><span class="eyebrow">HOUSEKEEPING</span><h3>One-off schedule retention</h3></div></div>
        <p class="compact-copy muted">Completed or expired one-off definitions are removed after this period. Execution history remains available.</p>
        <label class="field"><span>Retention (hours)</span><input v-model.number="configDraft" type="number" min="1" max="720"></label>
        <div class="row"><button class="btn primary" :disabled="saving||!config" @click="saveConfig">{{saving?'Saving…':'Save configuration'}}</button><span class="muted smalltext">Default 48 · allowed 1–720 hours</span></div>
      </article>

      <article class="card scheduler-config-card">
        <div class="cardhead"><div><span class="eyebrow">RUNTIME HEALTH</span><h3>Scheduler diagnostics</h3></div><span class="pill" :class="statusClass(healthState)">{{healthState}}</span></div>
        <dl class="kvlist">
          <dt>Last completed tick</dt><dd class="mono">{{nextLabel(health?.last_tick_completed_at)}}</dd>
          <dt>Tick age</dt><dd class="mono">{{health?.tick_age_seconds ?? '—'}} sec</dd>
          <dt>Last tick</dt><dd class="mono">checked {{health?.last_checked ?? '—'}} · queued {{health?.last_queued ?? '—'}} · skipped {{health?.last_skipped ?? '—'}} · cleaned {{health?.last_cleaned ?? '—'}}</dd>
          <dt>Last dispatch</dt><dd class="mono">{{nextLabel(health?.last_dispatch_at)}}</dd>
        </dl>
        <div v-if="health?.last_tick_error||health?.last_dispatch_error" class="state-inline warning mono">{{health.last_tick_error||health.last_dispatch_error}}</div>
      </article>

      <article class="card scheduler-config-card scheduler-self-tests">
        <div class="cardhead"><div><span class="eyebrow">SELF-TESTS</span><h3>Execution path validation</h3></div></div>
        <p class="compact-copy muted">Framework-owned tests validate Scheduler dispatch, Celery, history and retry behavior without touching endpoints.</p>
        <div class="self-test-list">
          <button class="btn" :disabled="!!selfTesting" @click="selfTest('immediate')">Immediate test</button>
          <button class="btn" :disabled="!!selfTesting" @click="selfTest('scheduled')">True scheduled test (+2 min)</button>
          <button class="btn warnbtn" :disabled="!!selfTesting" @click="selfTest('failure')">Deliberate failure</button>
          <button class="btn" :disabled="!!selfTesting" @click="selfTest('retry')">Retry + recovery</button>
        </div>
        <p class="muted smalltext">Failure is expected for the deliberate failure test. Retry + recovery intentionally fails once and succeeds on its configured retry.</p>
      </article>
    </div>
  </template>
</section>
</template>
