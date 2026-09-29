<script setup>
import { onMounted, ref } from 'vue'
import { completeTacticalSso } from '../api'

const state = ref('working')
const error = ref('')

async function complete() {
  state.value = 'working'
  error.value = ''
  try {
    await completeTacticalSso()
    state.value = 'complete'
    window.location.replace('/tec-tac/#/dashboards')
  } catch (err) {
    state.value = 'failed'
    error.value = err?.message || 'SSO sign-in could not be completed.'
  }
}

function backToSignIn() { window.location.replace('/tec-tac/') }
onMounted(() => { void complete() })
</script>

<template>
  <section class="state-panel verify-panel" aria-labelledby="sso-callback-title">
    <span class="eyebrow">SSO SIGN-IN</span>
    <template v-if="state === 'working'">
      <h2 id="sso-callback-title">Completing sign-in</h2>
      <p>Tec-Tac is exchanging the verified Tactical SSO session and establishing the normal session-security boundary.</p>
      <div class="verify-line"><span class="spinner" aria-hidden="true"></span><span class="mono">Verifying SSO session…</span></div>
    </template>
    <template v-else-if="state === 'complete'">
      <h2 id="sso-callback-title">Sign-in complete</h2>
      <p>Opening Tec-Tac…</p>
    </template>
    <template v-else>
      <h2 id="sso-callback-title">SSO sign-in could not be completed</h2>
      <p class="mono" role="alert">{{ error }}</p>
      <div class="row"><button class="btn" type="button" @click="complete">Retry</button><button class="btn ghost" type="button" @click="backToSignIn">Back to sign in</button></div>
    </template>
  </section>
</template>
