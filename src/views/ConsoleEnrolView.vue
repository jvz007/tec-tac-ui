<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useConfirm } from '../confirm-dialog'
import { state } from '../state'
import { enrolBody, loopbackCallbackUrl, parseEnrolQuery } from '../console-handoff'
import { consoleCertificateError, getMyConsoleCertificates, requestEnrolmentCode } from '../console-certificates'

// Engineer Console enrol (UI 0.13.8). The Console opens this page with port, state and challenge (its PKCE code_challenge).
// One plain Yes/No, then the one-time code goes to the Console on this PC (the loopback address) and nowhere else. The code lives only
// in a variable of the click handler: no ref, no storage, no router, no log. The My Account card keeps the no-challenge path.
const route = useRoute()
const confirmAction = useConfirm()
const parsed = parseEnrolQuery(route.query)

const REFUSED = 'This enrol link is not valid. Close this tab and start again in the Engineer Console.'
const NEEDS_ALLOW = 'An administrator must allow you to enrol first. Ask them to allow you in Access > Console certificates.'

const phase = ref(parsed ? 'loading' : 'refused')
const message = ref(parsed ? '' : REFUSED)
const closeNote = ref('')
const retryable = ref(false)
const host = ref('')
const ready = ref(false)
const busy = ref(false)
const username = computed(() => String(state.context?.user?.username || state.context?.user?.display_name || ''))

async function load() {
  phase.value = 'loading'
  message.value = ''
  retryable.value = false
  try {
    const mine = await getMyConsoleCertificates()
    if (!mine || !mine.enrolment || mine.enrolment.state !== 'open') { phase.value = 'closed'; message.value = NEEDS_ALLOW; return }
    host.value = mine.host || ''
    ready.value = true
    phase.value = 'ready'
  } catch (err) {
    phase.value = 'closed'
    retryable.value = true
    message.value = consoleCertificateError(err, 'Console certificates could not be loaded.')
  }
}

async function enrol() {
  if (busy.value || phase.value !== 'ready') return
  const yes = await confirmAction({
    question: `Enrol the Engineer Console on this PC for ${username.value || 'you'}${host.value ? ` on ${host.value}` : ''}?`,
    detail: 'The one-time code goes only to the Engineer Console on this PC. It works once.',
    danger: false, yesLabel: 'Yes', noLabel: 'No',
  })
  if (!yes) { phase.value = 'declined'; message.value = 'Nothing was sent.'; return }
  busy.value = true
  message.value = ''
  retryable.value = false
  try {
    const answer = await requestEnrolmentCode({ body: enrolBody(parsed) })
    const target = loopbackCallbackUrl(parsed.port, typeof answer?.code === 'string' ? answer.code : '', parsed.state)
    phase.value = 'sent'
    window.location.assign(target)
  } catch (err) {
    phase.value = 'closed'
    if (err?.status === 409 && err?.code === 'enrolment_required') message.value = NEEDS_ALLOW
    else { message.value = consoleCertificateError(err, 'A code could not be made.'); retryable.value = true }
  } finally {
    busy.value = false
  }
}

function retry() {
  if (!ready.value) { void load(); return }
  phase.value = 'ready'
  void enrol()
}

function closeTab() {
  try { window.close() } catch { /* the browser may refuse */ }
  closeNote.value = 'If this tab is still open, close it yourself.'
}

onMounted(() => { if (parsed) void load() })
</script>

<template>
  <section class="state-panel console-handoff-panel" aria-labelledby="console-enrol-title">
    <span class="eyebrow">ENGINEER CONSOLE</span>
    <h2 id="console-enrol-title">Enrol the Engineer Console</h2>
    <template v-if="phase === 'loading'"><p>Checking your enrolment…</p></template>
    <template v-else-if="phase === 'ready'">
      <p>The Engineer Console on this PC asks to enrol for <b>{{ username || 'you' }}</b>.</p>
      <div class="row"><button class="btn primary" type="button" :disabled="busy" @click="enrol">{{ busy ? 'Enrolling…' : 'Enrol this PC' }}</button><button class="btn ghost" type="button" @click="closeTab">Close</button></div>
    </template>
    <template v-else-if="phase === 'sent'">
      <p>You can close this tab once the Engineer Console says it is enrolled.</p>
      <div class="row"><button class="btn ghost" type="button" @click="closeTab">Close</button></div>
    </template>
    <template v-else>
      <p role="alert">{{ message }}</p>
      <div class="row"><button v-if="retryable" class="btn" type="button" @click="retry">Try again</button><button class="btn ghost" type="button" @click="closeTab">Close</button></div>
    </template>
    <p v-if="closeNote" class="muted">{{ closeNote }}</p>
  </section>
</template>
