<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatDateTime } from '../date-format'
import { useConfirm } from '../confirm-dialog'
import { state } from '../state'
import {
  REPLACE_CA_DETAIL,
  REPLACE_CA_QUESTION,
  canReplaceConsoleCa,
  consoleCertificateError,
  getConsoleCa,
  replaceConsoleCa,
} from '../console-certificates'

// The certificate authority (CA) is the key pair Core uses to sign every Console certificate.
// This panel is for people with the view or manage permission. Only an effective superuser sees Replace.
const emit = defineEmits(['replaced'])
const confirmAction = useConfirm()
const ca = ref(null)
const loading = ref(true)
const error = ref('')
const notice = ref('')
const busy = ref(false)

const canReplace = computed(() => canReplaceConsoleCa(state.context))
const formatTime = (value) => (value ? formatDateTime(value) : '—')

async function load() {
  error.value = ''
  try {
    ca.value = await getConsoleCa()
  } catch (err) {
    error.value = consoleCertificateError(err, 'The certificate authority could not be read.')
  } finally {
    loading.value = false
  }
}

async function replace() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const yes = await confirmAction({ question: REPLACE_CA_QUESTION, detail: REPLACE_CA_DETAIL, danger: true, yesLabel: 'Yes', noLabel: 'No' })
    if (!yes) return
    await replaceConsoleCa()
    notice.value = 'The certificate authority was replaced.'
    await load()
    emit('replaced')
  } catch (err) {
    error.value = consoleCertificateError(err, 'The certificate authority could not be replaced.')
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="card mb" aria-labelledby="console-ca-title">
    <div class="cardhead"><div><span class="eyebrow">CERTIFICATE AUTHORITY</span><h3 id="console-ca-title">Console certificate authority</h3></div></div>
    <p class="compact-copy muted">The certificate authority (CA) is the key pair Core uses to sign every Console certificate. Core keeps its private key encrypted.</p>
    <div v-if="loading" class="state-panel"><span class="spinner" aria-hidden="true"></span><span>Loading…</span></div>
    <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
    <template v-if="ca">
      <div v-if="!ca.master_key_available" class="state-inline warning" role="alert"><b>The master key is not available.</b> Core cannot make certificates or codes until it is. Check the master key file, or replace the authority if the key is lost.</div>
      <div v-if="ca.expiring" class="state-inline warning" role="alert"><b>The authority ends soon.</b> It has {{ ca.expires_in_days }} days left. Replace it before then.</div>
      <p v-if="!ca.exists" class="muted">No authority exists yet. Core makes one the first time you allow an engineer to enrol.</p>
      <dl v-else class="kvlist">
        <dt>Server id</dt><dd class="mono">{{ ca.server_id || '—' }}</dd>
        <dt>Valid from</dt><dd>{{ formatTime(ca.not_before) }}</dd>
        <dt>Ends</dt><dd>{{ formatTime(ca.not_after) }}<span v-if="ca.expires_in_days !== null"> ({{ ca.expires_in_days }} days)</span></dd>
        <dt>Active certificates</dt><dd class="mono">{{ ca.active_certificates }}</dd>
        <dt>Retired authorities</dt><dd class="mono">{{ ca.retired_cas }}</dd>
      </dl>
      <div v-if="notice" class="state-inline" role="status">{{ notice }}</div>
      <div v-if="canReplace && ca.exists" class="editor-actions"><button class="btn danger" type="button" :disabled="busy" @click="replace">{{ busy ? 'Replacing…' : 'Replace CA' }}</button></div>
      <p v-else-if="ca.exists" class="field-help">Only a superuser can replace the authority.</p>
    </template>
  </section>
</template>
