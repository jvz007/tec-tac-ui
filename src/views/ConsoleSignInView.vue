<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useConfirm } from '../confirm-dialog'
import { apiFetch } from '../api'
import { state } from '../state'
import { authoriseBody, loopbackCallbackUrl, parseSignInQuery } from '../console-handoff'
import { findActiveCertificate, getMyConsoleCertificates } from '../console-certificates'

// Engineer Console sign-in (UI 0.13.8). The Console opens this page with port, state, challenge and serial in the address.
// Core decides everything; this page asks one plain Yes/No and sends the answer to the Console on this PC (the loopback address).
// The one-time code lives only in a variable of the click handler: no ref, no storage, no router, no log.
const route = useRoute()
const confirmAction = useConfirm()
const parsed = parseSignInQuery(route.query)

const REFUSED = 'This sign-in link is not valid. Close this tab and start again in the Engineer Console.'
const NOT_YOURS = "This PC's certificate is not one of yours, or it has ended. Nothing was sent."

const phase = ref(parsed ? 'loading' : 'refused')
const message = ref(parsed ? '' : REFUSED)
const closeNote = ref('')
const retryable = ref(false)
const cert = ref(null)
const host = ref('')
const busy = ref(false)
const username = computed(() => String(state.context?.user?.username || state.context?.user?.display_name || ''))

async function load() {
  phase.value = 'loading'
  message.value = ''
  retryable.value = false
  try {
    const mine = await getMyConsoleCertificates()
    const found = mine ? findActiveCertificate(mine, parsed.serial) : null
    if (!found) { phase.value = 'closed'; message.value = NOT_YOURS; return }
    cert.value = found
    host.value = mine.host || ''
    phase.value = 'ready'
  } catch (err) {
    phase.value = 'closed'
    retryable.value = true
    message.value = err?.message || 'Console certificates could not be loaded.'
  }
}

async function signIn() {
  if (busy.value || phase.value !== 'ready') return
  const where = host.value ? ` to ${host.value}` : ''
  const yes = await confirmAction({
    question: `Sign in the Engineer Console on ${cert.value.pc_label || 'this PC'} as ${username.value || 'you'}${where}?`,
    detail: 'The one-time code goes only to the Engineer Console on this PC. It works once.',
    danger: false, yesLabel: 'Yes', noLabel: 'No',
  })
  if (!yes) { phase.value = 'declined'; message.value = 'Nothing was sent.'; return }
  busy.value = true
  message.value = ''
  retryable.value = false
  try {
    const answer = await apiFetch('/api/tfd/console-sessions/authorise/', { method: 'POST', body: JSON.stringify(authoriseBody(parsed)) })
    const target = loopbackCallbackUrl(parsed.port, typeof answer?.code === 'string' ? answer.code : '', parsed.state)
    phase.value = 'sent'
    window.location.assign(target)
  } catch (err) {
    phase.value = 'closed'
    if (err instanceof TypeError) { message.value = 'Core did not send a usable code. Try again.'; retryable.value = true }
    else {
      message.value = err?.message || 'The Engineer Console could not be signed in.'
      // serial_not_allowed will not change on a retry; the other refusals can.
      retryable.value = !(err?.status === 403 && err?.code === 'serial_not_allowed')
    }
  } finally {
    busy.value = false
  }
}

function retry() {
  if (!cert.value) { void load(); return }
  phase.value = 'ready'
  void signIn()
}

function closeTab() {
  try { window.close() } catch { /* the browser may refuse */ }
  closeNote.value = 'If this tab is still open, close it yourself.'
}

onMounted(() => { if (parsed) void load() })
</script>

<template>
  <section class="state-panel console-handoff-panel" aria-labelledby="console-sign-in-title">
    <span class="eyebrow">ENGINEER CONSOLE</span>
    <h2 id="console-sign-in-title">Engineer Console sign-in</h2>
    <template v-if="phase === 'loading'"><p>Checking your certificate…</p></template>
    <template v-else-if="phase === 'ready'">
      <p>The Engineer Console on <b>{{ cert.pc_label || 'this PC' }}</b> asks to sign in as <b>{{ username || 'you' }}</b>.</p>
      <div class="row"><button class="btn primary" type="button" :disabled="busy" @click="signIn">{{ busy ? 'Signing in…' : 'Sign in' }}</button><button class="btn ghost" type="button" @click="closeTab">Close</button></div>
    </template>
    <template v-else-if="phase === 'sent'">
      <p>You can close this tab once the Engineer Console says it is signed in.</p>
      <div class="row"><button class="btn ghost" type="button" @click="closeTab">Close</button></div>
    </template>
    <template v-else>
      <p role="alert">{{ message }}</p>
      <div class="row"><button v-if="retryable" class="btn" type="button" @click="retry">Try again</button><button class="btn ghost" type="button" @click="closeTab">Close</button></div>
    </template>
    <p v-if="closeNote" class="muted">{{ closeNote }}</p>
  </section>
</template>
