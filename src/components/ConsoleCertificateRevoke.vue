<script setup>
import { ref } from 'vue'
import { useConfirm } from '../confirm-dialog'
import {
  REVOKE_DETAIL,
  REVOKE_QUESTION,
  REVOKE_REASONS,
  consoleCertificateError,
  revokeConsoleCertificate,
} from '../console-certificates'

// One certificate's revoke step: pick a reason, answer a plain Yes or No, then Core revokes it. Nothing is typed.
// The dialog never says the revoke ends a tunnel: an open session is not ended by it (Core 1.18.53 changes that).
const props = defineProps({
  serial: { type: String, required: true },
  label: { type: String, default: '' },
})
const emit = defineEmits(['revoked', 'cancel'])

const confirmAction = useConfirm()
const reason = ref('')
const busy = ref(false)
const error = ref('')

async function revoke() {
  if (!reason.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const yes = await confirmAction({ question: REVOKE_QUESTION, target: props.label || props.serial.slice(0, 8), detail: REVOKE_DETAIL, danger: true, yesLabel: 'Yes', noLabel: 'No' })
    if (!yes) return
    await revokeConsoleCertificate(props.serial, reason.value)
    emit('revoked', props.serial)
  } catch (err) {
    // Core's 400, 403, 404, 429 and 503 messages are shown as sent.
    error.value = consoleCertificateError(err, 'The certificate could not be revoked.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="console-cert-revoke">
    <label class="field"><span>Reason</span>
      <select v-model="reason" :disabled="busy">
        <option value="" disabled>Choose a reason</option>
        <option v-for="item in REVOKE_REASONS" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
    </label>
    <div class="editor-actions">
      <button class="btn danger sm" type="button" :disabled="busy || !reason" @click="revoke">{{ busy ? 'Revoking…' : 'Revoke' }}</button>
      <button class="btn sm" type="button" :disabled="busy" @click="emit('cancel')">Cancel</button>
    </div>
    <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
  </div>
</template>
