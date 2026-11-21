<script setup>
// 0.13.1 (Core 1.18.35): the plan panel and the progress panel of "Upgrade selected" on the Online catalog tab. Presentational:
// the page owns the calls. Values come in as view models from module-bulk-upgrade.js; events go out. Every word from Core is shown
// as text, never as markup. The plan has no Yes button of its own: "Upgrade" asks the shell's plain Yes or No.
defineProps({
  plan: { type: Object, default: null },
  planBusy: { type: Boolean, default: false },
  planError: { type: String, default: '' },
  run: { type: Object, default: null },
  runNotice: { type: String, default: '' },
  runError: { type: String, default: '' },
  stopBusy: { type: Boolean, default: false },
  starting: { type: Boolean, default: false },
})
const emit = defineEmits(['start', 'closePlan', 'stop', 'closeRun', 'reload'])
</script>

<template>
  <section v-if="planBusy || planError || plan" class="card mm-bulk-panel mb" aria-live="polite">
    <div class="cardhead"><div><span class="eyebrow">UPGRADE PLAN</span><h3>Upgrade selected modules</h3></div><button class="btn sm" type="button" @click="emit('closePlan')">Close</button></div>
    <p v-if="planBusy" class="muted compact-copy">Asking Core for the plan…</p>
    <div v-else-if="planError" class="auth-error">{{ planError }}</div>
    <template v-else-if="plan">
      <div v-if="plan.refused" class="auth-error">{{ plan.message }}</div>
      <template v-else>
        <template v-if="plan.order.length">
          <p class="compact-copy muted">Core upgrades these one after the other, in this order.</p>
          <ol class="mm-bulk-order">
            <li v-for="step in plan.order" :key="step.id"><b>{{ step.name }}</b> <span class="mono">{{ step.from || '—' }} → {{ step.to || '—' }}</span><span v-if="step.added" class="pill warn">added for a dependency</span></li>
          </ol>
        </template>
        <p v-else class="compact-copy muted">Nothing in this selection can run.</p>
        <div v-if="plan.willDisable.length" class="state-inline warning"><b>This would switch off modules.</b> Core does not do that in a bulk upgrade: {{ plan.willDisable.join(', ') }}. Upgrade those on their own.</div>
        <div v-for="(line, i) in plan.conflicts" :key="'c' + i" class="state-inline warning">{{ line }}</div>
        <div v-if="plan.blocked.length" class="mm-bulk-blocked">
          <h4 class="eyebrow">Blocked, will not run</h4>
          <ul><li v-for="(b, i) in plan.blocked" :key="'b' + i"><b>{{ b.name }}</b> <span class="muted">{{ b.message }}</span></li></ul>
        </div>
      </template>
      <div class="modal-actions mm-actions">
        <button v-if="!plan.refused && plan.canStart" class="btn primary" type="button" :disabled="starting" @click="emit('start')">{{ starting ? 'Starting…' : `Upgrade ${plan.runnable.length} module${plan.runnable.length === 1 ? '' : 's'}…` }}</button>
        <button class="btn" type="button" @click="emit('closePlan')">Close</button>
      </div>
    </template>
  </section>

  <section v-if="run || runError || runNotice" class="card mm-bulk-panel mb" aria-live="polite">
    <div class="cardhead"><div><span class="eyebrow">UPGRADE RUN</span><h3>{{ run ? `Run ${run.status}` : 'Upgrade run' }}</h3></div><button v-if="!run || run.final" class="btn sm" type="button" @click="emit('closeRun')">Close</button></div>
    <div v-if="runError" class="auth-error">{{ runError }}</div>
    <p v-if="runNotice" class="compact-copy muted">{{ runNotice }}</p>
    <template v-if="run">
      <p class="mono smalltext">{{ run.counts.total }} total · {{ run.counts.succeeded }} succeeded · {{ run.counts.failed }} failed · {{ run.counts.skipped }} skipped</p>
      <p v-if="run.stopping && !run.final" class="compact-copy muted">Stopping after the current module.</p>
      <ul class="mm-bulk-run">
        <li v-for="m in run.modules" :key="m.id"><b>{{ m.name }}</b> <span class="pill" :class="m.tone">{{ m.state }}</span> <span v-if="m.change" class="mono">{{ m.change }}</span><span v-if="m.reason" class="sub mm-bulk-reason">{{ m.reason }}</span></li>
      </ul>
      <div class="modal-actions mm-actions">
        <button v-if="!run.final" class="btn danger" type="button" :disabled="stopBusy || run.stopping" @click="emit('stop')">Stop</button>
        <template v-else-if="run.anySucceeded"><span class="compact-copy muted">Reload Tec-Tac to load the upgraded modules.</span><button class="btn primary" type="button" @click="emit('reload')">Reload Tec-Tac</button></template>
      </div>
    </template>
  </section>
</template>
