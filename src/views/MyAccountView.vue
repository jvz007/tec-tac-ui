<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { changePasswordWorkflow, resetTotpWorkflow, revokeOthersWorkflow, saveTacticalUiWorkflow } from '../my-account-workflows'
import { clearTacticalSession } from '../api'
import {
  changeMyPassword,
  getMyAccount,
  resetMyTotp,
  revokeMyOtherSessions,
  saveMyTacticalUiPreferences,
} from '../account'

const loading = ref(true)
const busy = ref('')
const error = ref('')
const saved = ref('')
const data = ref(null)
const password = reactive({ current: '', next: '', confirm: '' })
const mfa = reactive({ password: '', code: '' })
const tactical = reactive({ agent_dblclick_action: '', url_action_id: null })

const account = computed(() => data.value?.account || {})
const mfaStatus = computed(() => data.value?.mfa || {})
const tacticalUi = computed(() => data.value?.tactical_ui || {})
const localAccount = computed(() => account.value.sso_user !== true)
const urlActionSelected = computed(() => tactical.agent_dblclick_action === 'urlaction')

function flash(message = '') { saved.value = message; error.value = '' }
function fail(err, fallback) { error.value = err?.message || fallback; saved.value = '' }

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await getMyAccount()
    tactical.agent_dblclick_action = tacticalUi.value.agent_dblclick_action || 'editagent'
    tactical.url_action_id = tacticalUi.value.url_action_id ?? null
  } catch (err) { fail(err, 'Unable to load My Account.') }
  finally { loading.value = false }
}

async function changePassword() {
  if (!password.current || !password.next) return
  busy.value = 'password'
  error.value = ''
  try {
    const result = await changePasswordWorkflow(password, { changeMyPassword })
    password.current = ''; password.next = ''; password.confirm = ''
    flash(result.message)
  } catch (err) { fail(err, 'Unable to change password.') }
  finally { busy.value = '' }
}

async function resetMfa() {
  if (!mfa.password || !mfa.code.trim()) return
  busy.value = 'mfa'
  error.value = ''
  try {
    const result = await resetTotpWorkflow(mfa, {
      resetMyTotp,
      confirmReset: () => window.confirm('Reset your authenticator and sign out every active session? You will need to sign in and enrol two-factor authentication again.'),
      clearSession: clearTacticalSession,
      reload: () => window.location.reload(),
    })
    if (result.cancelled) busy.value = ''
  } catch (err) { fail(err, 'Unable to reset two-factor authentication.'); busy.value = '' }
}

async function revokeOthers() {
  busy.value = 'sessions'
  error.value = ''
  try {
    const result = await revokeOthersWorkflow({
      revokeMyOtherSessions,
      confirmRevoke: () => window.confirm('Sign out every other active session for your account? Your current session will stay signed in.'),
    })
    if (!result.cancelled) flash(result.message)
  } catch (err) { fail(err, 'Unable to sign out other sessions.') }
  finally { busy.value = '' }
}

async function saveTacticalUi() {
  busy.value = 'tactical'
  error.value = ''
  try {
    const result = await saveTacticalUiWorkflow(tactical, { saveMyTacticalUiPreferences })
    data.value = { ...data.value, tactical_ui: result.preferences || tacticalUi.value }
    flash(result.message)
  } catch (err) { fail(err, 'Unable to save Tactical UI preferences.') }
  finally { busy.value = '' }
}

onMounted(load)
</script>

<template>
  <section class="phead">
    <div><span class="eyebrow">SELF SERVICE</span><h1>My Account</h1><p>Manage your own sign-in security, sessions and Tactical UI behaviour.</p></div>
    <div class="row"><router-link class="btn ghost" to="/preferences">Tec-Tac preferences</router-link></div>
  </section>

  <div v-if="error" class="state-inline warning mb"><b>Account action failed.</b> {{ error }}</div>
  <div v-if="saved" class="state-inline mb"><b>{{ saved }}</b></div>
  <div v-if="loading" class="state-panel"><span class="spinner" aria-hidden="true"></span><span>Loading account…</span></div>

  <div v-else class="preferences-layout">
    <section class="card preference-card">
      <div class="cardhead"><div><span class="eyebrow">IDENTITY</span><h3>{{ account.username || 'Account' }}</h3></div><span class="pill" :class="localAccount ? 'ok' : ''">{{ localAccount ? 'LOCAL' : 'SSO' }}</span></div>
      <dl class="kvlist module-kv"><dt>Name</dt><dd>{{ [account.first_name, account.last_name].filter(Boolean).join(' ') || '—' }}</dd><dt>Email</dt><dd>{{ account.email || '—' }}</dd><dt>Two-factor</dt><dd>{{ mfaStatus.totp_configured ? 'Configured' : 'Not configured' }}</dd><dt>Backup codes</dt><dd>{{ mfaStatus.configured ? `${mfaStatus.unused} unused` : 'Not configured' }}</dd></dl>
    </section>

    <section class="card preference-card">
      <div class="cardhead"><div><span class="eyebrow">F1</span><h3>Change password</h3></div></div>
      <template v-if="localAccount">
        <p class="muted">Changing your password signs out every other active Tactical/Tec-Tac session while preserving this one.</p>
        <label class="field"><span>Current password</span><input v-model="password.current" type="password" autocomplete="current-password"></label>
        <label class="field"><span>New password</span><input v-model="password.next" type="password" autocomplete="new-password"></label>
        <label class="field"><span>Confirm new password</span><input v-model="password.confirm" type="password" autocomplete="new-password"></label>
        <div class="editor-actions"><button class="btn primary" :disabled="busy || !password.current || !password.next || password.next !== password.confirm" @click="changePassword">{{ busy === 'password' ? 'Changing…' : 'Change password' }}</button></div>
      </template>
      <p v-else class="muted">Your password is managed by your SSO provider.</p>
    </section>

    <section class="card preference-card">
      <div class="cardhead"><div><span class="eyebrow">F2</span><h3>Reset two-factor</h3></div></div>
      <template v-if="localAccount && mfaStatus.totp_configured">
        <p class="muted">Requires your current password and authenticator code. This signs out every session, then the normal Tec-Tac sign-in flow will enrol a fresh authenticator.</p>
        <label class="field"><span>Current password</span><input v-model="mfa.password" type="password" autocomplete="current-password"></label>
        <label class="field"><span>Current authenticator code</span><input v-model="mfa.code" inputmode="numeric" autocomplete="one-time-code" maxlength="12"></label>
        <div class="editor-actions"><button class="btn danger" :disabled="busy || !mfa.password || !mfa.code.trim()" @click="resetMfa">{{ busy === 'mfa' ? 'Resetting…' : 'Reset and re-enrol 2FA' }}</button></div>
      </template>
      <p v-else-if="!localAccount" class="muted">Two-factor authentication is managed by your SSO provider.</p>
      <p v-else class="muted">Two-factor authentication is not currently configured. Sign out and sign in again to start enrollment.</p>
    </section>

    <section class="card preference-card">
      <div class="cardhead"><div><span class="eyebrow">F3</span><h3>Other sessions</h3></div></div>
      <p class="muted">Immediately revoke every other Tactical Knox credential and Tec-Tac trust session for your account. This browser remains signed in.</p>
      <div class="editor-actions"><button class="btn" :disabled="busy" @click="revokeOthers">{{ busy === 'sessions' ? 'Signing out…' : 'Sign out my other sessions' }}</button></div>
    </section>

    <section class="card preference-card">
      <div class="cardhead"><div><span class="eyebrow">F4</span><h3>Tactical agent action</h3></div><span class="pill ok">TACTICAL</span></div>
      <p class="muted">These values are stored on your Tactical user account and are used by Tactical's agent table.</p>
      <label class="field"><span>Agent double-click action</span><select v-model="tactical.agent_dblclick_action"><option v-for="item in tacticalUi.agent_dblclick_choices || []" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
      <label v-if="urlActionSelected" class="field"><span>Default URL Action</span><select v-model="tactical.url_action_id" :disabled="!tacticalUi.can_run_url_actions"><option :value="null">None</option><option v-for="item in tacticalUi.url_actions || []" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <p v-if="urlActionSelected && !tacticalUi.can_run_url_actions" class="muted smalltext">Your Tactical role does not permit URL Actions.</p>
      <div class="editor-actions"><button class="btn primary" :disabled="busy || (urlActionSelected && !tacticalUi.can_run_url_actions)" @click="saveTacticalUi">{{ busy === 'tactical' ? 'Saving…' : 'Save Tactical preferences' }}</button></div>
    </section>
  </div>
</template>
