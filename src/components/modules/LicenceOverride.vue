<script setup>
// 0.12.118: the audited licence override (Core 1.17.58, part 3). It is drawn under Core's refusal, only after a 403
// 'licensing_requirement_failed' in enforce mode, and only to a superuser. Everyone else sees the plain refusal and no control.
// The reason is typed here, sent once and cleared. It is never logged, never stored in the browser and never carried from the
// stage to the install: the install asks again. Core checks everything again and records the reason and the person.
import { computed, inject, ref } from 'vue'
import { useConfirm } from '../../confirm-dialog'
import { OVERRIDE_MAX, overrideConfirmation, overrideErrorSentence, showOverride, validateOverrideReason } from '../../licensing'

const props = defineProps({
  refusal: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  failure: { type: Object, default: null },
})
const emit = defineEmits(['override'])

const state = inject('tecTacState')
const askConfirm = useConfirm()
const reason = ref('')
const touched = ref(false)

const allowed = computed(() => showOverride(state?.context, props.refusal))
const check = computed(() => validateOverrideReason(reason.value))
const failureText = computed(() => (props.failure ? overrideErrorSentence(props.failure) : ''))

async function override() {
  touched.value = true
  if (!check.value.valid || props.busy) return
  const ask = overrideConfirmation(props.refusal?.module)
  if (!(await askConfirm({ question: ask.question, detail: ask.detail, danger: ask.danger }))) return
  const value = reason.value
  // Cleared at once: the text lives only in the request that carries it.
  reason.value = ''
  touched.value = false
  emit('override', value)
}
</script>

<template>
  <div v-if="refusal" class="state-inline denied mm-licence" role="alert">
    <b>Core refused this module because of its licence.</b>
    <span>{{ refusal.detail }}</span>
    <dl class="kvlist">
      <dt>Module</dt><dd class="mono">{{ refusal.module || '—' }}</dd>
      <dt>Version</dt><dd class="mono">{{ refusal.moduleVersion || '—' }}</dd>
      <dt>Licence state</dt><dd>{{ refusal.state || '—' }}</dd>
    </dl>
    <div v-if="allowed" class="mm-licence-reason">
      <label :for="'licence-reason'">Why is this needed? Core records your reason and your name.</label>
      <textarea id="licence-reason" v-model="reason" autocomplete="off" spellcheck="false" :disabled="busy" aria-describedby="licence-reason-help"></textarea>
      <span class="count">{{ reason.length }} / {{ OVERRIDE_MAX }}</span>
      <span id="licence-reason-help" class="field-help" :class="{ dangertext: touched && !check.valid }">{{ touched && !check.valid ? check.message : `1 to ${OVERRIDE_MAX} characters.` }}</span>
      <div class="login-actions"><button class="btn warnbtn" type="button" :disabled="busy" @click="override">{{ busy ? 'Trying again…' : 'Override and try again' }}</button></div>
    </div>
    <div v-if="failureText" class="auth-error" role="alert">{{ failureText }}</div>
  </div>
</template>
