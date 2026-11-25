<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatDateTime } from '../date-format'
import { copyTextWithFeedback } from '../copy-feedback'
import ConsoleCertificateRevoke from './ConsoleCertificateRevoke.vue'
import {
  CONSOLE_CERT_PAGE_PATH,
  NO_CERTIFICATE_TEXT,
  cardState,
  certificateDisplayState,
  consoleCertificateError,
  enrolLink,
  getMyConsoleCertificates,
  requestEnrolmentCode,
} from '../console-certificates'

// My Account, Engineer Console card (Core 1.18.52). The one-time code lives only in `issued` below. It is never written to
// browser storage, the router, the shell state or a log, and it is cleared when the countdown ends, on a new request and
// when the card goes away.
const loading = ref(true)
const available = ref(true)
const loadError = ref('')
const mine = ref(null)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const issued = ref(null)
const secondsLeft = ref(0)
const revoking = ref('')
let timer = null

const status = computed(() => cardState(mine.value))
const link = computed(() => (issued.value ? enrolLink(issued.value.host, issued.value.code) : ''))
const countdown = computed(() => `${Math.floor(secondsLeft.value / 60)}:${String(secondsLeft.value % 60).padStart(2, '0')}`)
const formatTime = (value) => (value ? formatDateTime(value) : '—')
const stateLabel = (cert) => ({ active: 'Active', expiring: 'Active', expired: 'Expired', revoked: 'Revoked' }[certificateDisplayState(cert)] || '')
const stateClass = (cert) => ({ active: 'ok', expiring: 'warn', expired: 'warn', revoked: 'bad' }[certificateDisplayState(cert)] || '')

function clearCode() {
  if (timer) { clearInterval(timer); timer = null }
  issued.value = null
  secondsLeft.value = 0
}

function startCountdown(seconds) {
  const total = Number.isInteger(seconds) && seconds > 0 ? seconds : 0
  secondsLeft.value = total
  if (!total) { clearCode(); return }
  timer = setInterval(() => {
    secondsLeft.value -= 1
    if (secondsLeft.value <= 0) clearCode()
  }, 1000)
}

async function load() {
  loadError.value = ''
  try {
    const result = await getMyConsoleCertificates()
    // An older Core has no such route: the card is left out.
    available.value = result !== null
    mine.value = result
  } catch (err) {
    loadError.value = consoleCertificateError(err, 'Console certificates could not be loaded.')
  } finally {
    loading.value = false
  }
}

async function enrol() {
  if (busy.value) return
  clearCode()
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const answer = await requestEnrolmentCode()
    issued.value = { code: String(answer?.code || ''), host: typeof answer?.host === 'string' ? answer.host : '' }
    startCountdown(answer?.expires_in_seconds)
  } catch (err) {
    // A 409 enrolment_required means no open enrolment any more; 429 and 503 text is Core's, as sent.
    error.value = consoleCertificateError(err, 'A code could not be made.')
    if (err?.status === 409) await load()
  } finally {
    busy.value = false
  }
}

async function copyCode() {
  if (!link.value) return
  const result = await copyTextWithFeedback(link.value, { failureMessage: 'Could not copy the enrol link.' })
  notice.value = result.copied ? 'Enrol link copied.' : result.error
}

async function onRevoked() {
  revoking.value = ''
  notice.value = 'Certificate revoked.'
  await load()
}

onMounted(load)
onBeforeUnmount(clearCode)
</script>

<template>
  <section v-if="!loading && available" class="card preference-card console-certificates-card" aria-labelledby="console-cert-title">
    <div class="cardhead"><div><span class="eyebrow">ENGINEER CONSOLE</span><h3 id="console-cert-title">Console certificate</h3></div></div>
    <div v-if="loadError" class="state-inline warning"><b>Console certificates unavailable.</b> {{ loadError }}</div>
    <template v-else-if="mine">
      <p class="muted">Your Engineer Console proves it is you with a certificate on your PC. An administrator allows you to enrol, then you enrol each PC here.</p>

      <p v-if="status === 'none'" class="muted">{{ NO_CERTIFICATE_TEXT }}</p>
      <p v-else-if="status === 'ended'" class="muted">Your certificates have ended. {{ NO_CERTIFICATE_TEXT }}</p>
      <p v-else-if="status === 'expiring'" class="muted"><b>A certificate is close to its end.</b> Enrol the PC again before it expires.</p>

      <div v-if="status === 'open' || issued" class="editor-actions">
        <button class="btn primary" type="button" :disabled="busy" @click="enrol">{{ busy ? 'Making a code…' : 'Enrol this PC' }}</button>
      </div>
      <p v-if="status === 'open' && !issued" class="field-help">An administrator has allowed you to enrol a PC. Press the button to get a one-time code.</p>

      <div v-if="issued" class="state-inline" role="status">
        <p><b>Your one-time code.</b> It works once and is shown only now. {{ secondsLeft > 0 ? `It stops working in ${countdown}.` : '' }}</p>
        <p class="mono smalltext console-cert-code">{{ issued.code }}</p>
        <div class="editor-actions">
          <a v-if="link" class="btn primary" :href="link">Open the Engineer Console</a>
          <button v-if="link" class="btn" type="button" @click="copyCode">Copy enrol link</button>
        </div>
        <p v-if="!link" class="field-help">Open the Engineer Console, choose Enrol, and enter this host and code by hand.</p>
      </div>

      <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
      <div v-if="notice" class="state-inline" role="status">{{ notice }}</div>

      <div v-if="mine.certificates.length" class="tablewrap table-clean">
        <table>
          <thead><tr><th>PC</th><th>Serial</th><th>Issued</th><th>Expires</th><th>State</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <template v-for="cert in mine.certificates" :key="cert.serial">
              <tr>
                <td class="cell-truncate" :title="cert.pc_label"><b>{{ cert.pc_label || '—' }}</b></td>
                <td class="mono smalltext">{{ cert.short_serial }}</td>
                <td class="smalltext">{{ formatTime(cert.issued_at) }}</td>
                <td class="smalltext">{{ formatTime(cert.not_after) }}</td>
                <td><span class="pill" :class="stateClass(cert)">{{ stateLabel(cert) }}</span> <span v-if="cert.expiring && cert.state === 'active'" class="pill warn">Expiring</span></td>
                <td class="row-actions"><button v-if="cert.state === 'active'" class="btn sm danger" type="button" @click="revoking = cert.serial">Revoke</button></td>
              </tr>
              <tr v-if="revoking === cert.serial">
                <td colspan="6"><ConsoleCertificateRevoke :serial="cert.serial" :label="cert.pc_label" @revoked="onRevoked" @cancel="revoking = ''" /></td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <div class="editor-actions"><router-link class="btn ghost" :to="CONSOLE_CERT_PAGE_PATH">Manage my certificates</router-link></div>
    </template>
  </section>
</template>
