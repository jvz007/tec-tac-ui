<script setup>
// 0.12.119: the three Module Manager dialogs on the brand board (P4, P8, P9 anatomy): reinstall, "Switch off replaced modules?" and the
// enable, disable and remove confirmation with its hand-back warning, its second step and the plain Yes or No. Presentational only:
// values come in as props with the names ModulesView.vue gives them, handlers leave as events with the handler's name, and the two
// checkboxes report through update:cascade and update:switchAck. The words, the gating and the order of the steps are not changed.
// The buttons keep the DOM order (and so the focus order) they had; .mm-actions puts the destructive button left of Cancel and the
// primary button rightmost with CSS order. The plain Yes or No keeps No on the left and Yes on the right, as it always was.
defineProps({
  reinstallTarget: { type: Object, default: null },
  installConfirm: { type: Object, default: null },
  confirmTarget: { type: Object, default: null },
  confirmMode: { type: String, default: '' },
  inspecting: { type: Boolean, default: false },
  jobRunning: { type: Boolean, default: false },
  installing: { type: Boolean, default: false },
  enableNotice: { type: Array, default: () => [] },
  disableNotice: { type: Array, default: () => [] },
  listChanged: { type: String, default: '' },
  cascade: { type: Boolean, default: false },
  handBack: { type: Object, default: null },
  handBackBusy: { type: Boolean, default: false },
  confirmStep: { type: Number, default: 1 },
  needsSecondConfirmation: { type: Boolean, default: false },
  secondStepText: { type: Object, default: () => ({ warning: '', checkbox: '', button: '' }) },
  secondDependantLines: { type: Array, default: () => [] },
  switchAck: { type: Boolean, default: false },
})
const emit = defineEmits(['closeReinstallConfirm', 'confirmReinstall', 'closeInstallConfirm', 'confirmInstall', 'closeConfirm', 'confirmHandBack', 'confirmSwitchAction', 'confirmAction', 'update:cascade', 'update:switchAck'])
</script>

<template>
  <div v-if="reinstallTarget" class="modal-backdrop" @click.self="emit('closeReinstallConfirm')"><section class="modal-panel mm-dialog" role="dialog" aria-modal="true" aria-labelledby="module-reinstall-title"><div class="cardhead"><div><span class="eyebrow">REINSTALL MODULE</span><h3 id="module-reinstall-title">{{ reinstallTarget.name || reinstallTarget.id }}</h3></div><span class="pill warn">SAME VERSION</span></div><p class="compact-copy">Installed version and repository version are both <span class="mono">{{ reinstallTarget.latest_version }}</span>. Continuing will download and inspect the same version for reinstall. The replacement still requires confirmation from the package inspection step.</p><div class="state-inline warning mt"><b>Existing module files will be replaced when the install job runs.</b> Configuration and data remain subject to the module's normal upgrade/reinstall lifecycle.</div><div class="modal-actions mm-actions"><button class="btn primary" :disabled="inspecting || jobRunning" @click="emit('confirmReinstall')">Continue to reinstall</button><button class="btn" @click="emit('closeReinstallConfirm')">Cancel</button></div></section></div>

  <div v-if="installConfirm" class="modal-backdrop" @click.self="emit('closeInstallConfirm')"><section class="modal-panel mm-dialog" role="dialog" aria-modal="true" aria-labelledby="module-install-confirm-title"><div class="cardhead"><div><span class="eyebrow">INSTALL MODULES</span><h3 id="module-install-confirm-title">Switch off replaced modules?</h3></div><span class="pill warn">RUNTIME CHANGE</span></div><div v-if="installConfirm.changed" class="state-inline warning mt"><b>{{ installConfirm.changed }}</b></div><div v-if="installConfirm.lines.length" class="state-inline warning mt"><div v-for="(line,index) in installConfirm.lines" :key="index">{{ line }}</div></div><div class="modal-actions mm-actions"><button class="btn primary" :disabled="jobRunning || installing" @click="emit('confirmInstall')">{{ installConfirm.ids.length ? 'Install and switch off' : 'Install' }}</button><button class="btn" @click="emit('closeInstallConfirm')">Cancel</button></div></section></div>

  <div v-if="confirmTarget" class="modal-backdrop" @click.self="emit('closeConfirm')"><section class="modal-panel mm-dialog"><div class="cardhead"><div><span class="eyebrow">{{ confirmMode.toUpperCase() }} MODULE</span><h3>{{ confirmTarget.id }}</h3></div><span class="pill warn">RUNTIME CHANGE</span></div><div v-if="enableNotice.length || listChanged" class="state-inline warning mt"><b v-if="listChanged">{{ listChanged }}</b><div v-for="(line,index) in enableNotice" :key="index">{{ line }}</div></div><div v-if="disableNotice.length" class="state-inline warning mt"><div v-for="(line,index) in disableNotice" :key="index">{{ line }}</div></div><p v-if="confirmMode==='disable'&&confirmTarget.dependants?.length" class="compact-copy">Enabled dependants may block this action. Select cascade to disable dependent modules first.</p><label v-if="confirmMode==='disable'&&confirmTarget.dependants?.length" class="checkline warning-check"><input :checked="cascade" type="checkbox" @change="emit('update:cascade', $event.target.checked)"> Disable enabled dependants as part of this job</label><template v-if="handBack"><div class="state-inline warning mt"><div v-for="(line,index) in handBack.lines" :key="'hand-back'+index">{{ line }}</div></div><div class="modal-actions mm-actions"><button class="btn danger" :disabled="handBackBusy" @click="emit('confirmHandBack')">{{ handBack.button }}</button><button class="btn" @click="emit('closeConfirm')">Cancel</button></div></template><template v-else-if="confirmStep===2&&needsSecondConfirmation"><div class="auth-error mt"><b>Second confirmation.</b> {{ secondStepText.warning }}</div><div v-for="(line,index) in secondDependantLines" :key="'dependant'+index" class="state-inline warning mt">{{ line }}</div><label class="checkline warning-check"><input :checked="switchAck" type="checkbox" @change="emit('update:switchAck', $event.target.checked)"> {{ secondStepText.checkbox }}</label><div class="modal-actions mm-actions"><button class="btn danger" :disabled="!switchAck" @click="emit('confirmSwitchAction')">{{ secondStepText.button }}</button><button class="btn" @click="emit('closeConfirm')">Cancel</button></div></template><template v-else><p class="confirm-question">{{ confirmMode.charAt(0).toUpperCase() + confirmMode.slice(1) }} module {{ confirmTarget.id }}? Are you sure?</p><div class="modal-actions mm-actions mm-yesno"><button class="btn" @click="emit('closeConfirm')">No</button><button class="btn" :class="confirmMode==='enable'?'primary':'danger'" @click="emit('confirmAction')">Yes</button></div></template></section></div>
</template>
