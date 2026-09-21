<script setup>
import { inject, ref } from 'vue'
import { logoutTacticalSession } from '../../api'
import { loadContext } from '../../state'

const state = inject('tecTacState')
const busy = ref(false)
const error = ref('')

async function refresh() {
  busy.value = true
  error.value = ''
  try { await loadContext() } catch (err) { error.value = err?.message || 'Refresh failed.' }
  finally { busy.value = false }
}

async function signOut() {
  busy.value = true
  error.value = ''
  try { await logoutTacticalSession() }
  catch (err) { error.value = err?.message || 'Tactical logout failed; local session was cleared.' }
  finally { window.location.reload() }
}
</script>

<template>
  <div class="grid g2">
    <article class="card">
      <div class="cardhead"><div><span class="eyebrow">CURRENT IDENTITY</span><h3>Tactical session</h3></div><span class="pill ok">VERIFIED</span></div>
      <dl class="kvlist">
        <dt>Username</dt><dd class="mono">{{ state.context.user?.username || '—' }}</dd>
        <dt>Display name</dt><dd>{{ state.context.user?.display_name || '—' }}</dd>
        <dt>Role</dt><dd>{{ state.context.user?.role || (state.context.user?.superuser ? 'Tactical superadmin' : '—') }}</dd>
        <dt>Role ID</dt><dd class="mono">{{ state.context.user?.role_id ?? '—' }}</dd>
        <dt>Effective superuser</dt><dd>{{ state.context.user?.superuser ? 'yes' : 'no' }}</dd>
        <dt>Auth proof</dt><dd class="mono">{{ state.authProof || '—' }}</dd>
        <dt>Context source</dt><dd class="mono">{{ state.contextSource }}</dd>
      </dl>
    </article>
    <article class="card">
      <div class="cardhead"><div><span class="eyebrow">SESSION ACTIONS</span><h3>Account session</h3></div></div>
      <p class="muted compact-copy">Sign out invalidates the current Knox token at Tactical and clears Tec-Tac's browser session. Refresh re-resolves role and Tec-Tac permissions from the backend.</p>
      <div v-if="error" class="auth-error">{{ error }}</div>
      <div class="action-stack">
        <button class="btn" :disabled="busy" @click="refresh">Refresh access context</button>
        <button class="btn danger" :disabled="busy" @click="signOut">Sign out of Tec-Tac</button>
      </div>
    </article>
  </div>
</template>
