<script setup>
// 0.12.119: the Package intake card of the Module Manager on the brand board (P3 card, P5 ordered cards, P10 states). Presentational only:
// every value comes in as a prop with the name it has in ModulesView.vue, and every handler leaves as an event with the handler's name.
// The two hidden file inputs and their refs stay in ModulesView.vue. Nothing here changes what a click or a key does.
defineProps({
  canManage: { type: Boolean, default: false },
  jobRunning: { type: Boolean, default: false },
  inspecting: { type: Boolean, default: false },
  staged: { type: Object, default: null },
  plan: { type: Object, default: null },
  dropActive: { type: Boolean, default: false },
  pendingFiles: { type: Array, default: () => [] },
  pendingIntakeProblem: { type: String, default: '' },
  problemSets: { type: Array, default: () => [] },
  intakeErrors: { type: Array, default: () => [] },
  intakeBlocked: { type: Boolean, default: false },
  intakeNotes: { type: Object, default: () => ({ signed: 0, unsigned: 0 }) },
  // The page's own helpers, passed in so the page stays the one place that knows what a file is.
  fileKey: { type: Function, required: true },
  intakeFileType: { type: Function, required: true },
  intakeFileLabel: { type: Function, required: true },
})
const emit = defineEmits(['pick', 'onDrop', 'dragenter', 'dragover', 'dragleave', 'movePending', 'removePending', 'clearPending', 'inspectPending'])
</script>

<template>
  <section class="card package-workspace mm-card mm-intake mb" aria-labelledby="package-workspace-title">
    <div class="cardhead mm-cardhead">
      <div><span class="eyebrow">PACKAGE INTAKE</span><h3 id="package-workspace-title">Install packages / bundle</h3></div>
      <span v-if="staged" class="pill" :class="plan?.valid ? 'ok' : 'warn'">{{ plan?.valid ? 'INSPECTED' : 'BLOCKED' }}</span>
    </div>

    <div
      v-if="!staged"
      class="mm-drop"
      :class="{ active: dropActive, disabled: !canManage || jobRunning || inspecting }"
      role="button"
      tabindex="0"
      @click="emit('pick')"
      @keydown.enter.prevent="emit('pick')"
      @keydown.space.prevent="emit('pick')"
      @dragenter.prevent="emit('dragenter')"
      @dragover.prevent="emit('dragover')"
      @dragleave.prevent="emit('dragleave')"
      @drop.prevent="emit('onDrop', $event)"
    >
      <div class="mm-drop-icon" aria-hidden="true">⇩</div>
      <div><b>{{ dropActive ? 'Drop package files here' : 'Drag & drop Tec-Tac packages here' }}</b><span>Signatures are optional for normal modules. Each package pairs with the .sig and .release.json that share its file name.</span></div>
      <button class="btn sm" type="button" :disabled="!canManage || jobRunning || inspecting" @click.stop="emit('pick')">Browse files</button>
    </div>

    <div v-if="pendingFiles.length" class="mm-queue">
      <div class="mm-queue-head"><span class="eyebrow">FILES TO INSPECT</span><span class="mono muted">{{ pendingFiles.length }} file{{ pendingFiles.length===1?'':'s' }}</span></div>
      <div class="mm-queue-list">
        <div v-for="(file,index) in pendingFiles" :key="fileKey(file)" class="mm-queue-card">
          <span class="mm-queue-grip" aria-hidden="true">⋮⋮</span>
          <span class="mm-queue-index mono">{{ index+1 }}</span>
          <div class="mm-queue-main"><b>{{ file.name }}</b><span>{{ (file.size/1024).toFixed(1) }} KB</span></div>
          <span class="pill" :class="intakeFileType(file)==='package'?'':(intakeFileType(file)==='signature'?'ok':'')">{{ intakeFileLabel(file) }}</span>
          <div class="mm-queue-actions"><button class="iconbtn" :disabled="index===0" title="Move up" @click="emit('movePending', index, -1)">↑</button><button class="iconbtn" :disabled="index===pendingFiles.length-1" title="Move down" @click="emit('movePending', index, 1)">↓</button><button class="iconbtn" title="Remove" @click="emit('removePending', index)">×</button></div>
        </div>
      </div>
      <div v-if="pendingIntakeProblem" class="state-inline warning mt"><b>Package intake needs attention.</b> {{ pendingIntakeProblem }}</div>
      <div v-for="set in problemSets" :key="`problem-${set.key}`" class="state-inline warning mt"><b>{{ set.label }}</b> {{ set.problems.join(' ') }}</div>
      <div v-for="item in intakeErrors" :key="`failed-${item.key}`" class="state-inline warning mt"><b>{{ item.label }}</b> did not inspect. {{ item.message }}</div>
      <div v-if="!intakeBlocked && intakeNotes.unsigned" class="state-inline mt"><b>{{ intakeNotes.unsigned === 1 ? 'Unsigned package.' : `${intakeNotes.unsigned} unsigned packages.` }}</b> Signing is optional for normal modules at this stage; Core will still inspect and can install them unless a module requests privileged publisher permissions.</div>
      <div v-if="!intakeBlocked && intakeNotes.signed" class="state-inline mt"><b>{{ intakeNotes.signed === 1 ? 'Signed package detected.' : `${intakeNotes.signed} signed packages detected.` }}</b> Core checks each package with its own .sig and .release.json, and inspects them all in one request. Core checks the package hash, publisher policy and detached Ed25519 signature.</div>
      <div v-if="staged" class="state-inline warning mt"><b>Packages are staged.</b> Install or discard them before you inspect these files.</div>
      <div class="mm-footer"><button class="btn" @click="emit('clearPending')">Clear</button><span class="spacer"></span><button class="btn primary" :disabled="inspecting || intakeBlocked || !!staged" @click="emit('inspectPending')">{{ inspecting ? 'Inspecting…' : 'Inspect package intake' }}</button></div>
    </div>
  </section>
</template>
