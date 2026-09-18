<script setup>
import { nextTick, ref } from 'vue'
import { checkTacticalCredentials, loginTacticalWithTotp } from '../api'

const username = ref('')
const password = ref('')
const twofactor = ref('')
const step = ref('credentials')
const busy = ref(false)
const error = ref('')
const totpInput = ref(null)

function normalizeError(err) {
  if (!err) return 'Authentication failed.'
  if (err.status === 400 || err.status === 401 || err.status === 403) return 'The username, password, or authentication code was not accepted by Tactical.'
  if (err.status === 429) return 'Too many authentication attempts. Wait a moment before trying again.'
  return err.message || 'Authentication failed.'
}

async function submitCredentials() {
  error.value = ''
  if (!username.value.trim() || !password.value) {
    error.value = 'Enter both username and password.'
    return
  }

  busy.value = true
  try {
    const result = await checkTacticalCredentials(username.value.trim(), password.value)
    if (result.requiresTotp) {
      step.value = 'totp'
      await nextTick()
      totpInput.value?.focus()
      return
    }
    if (result.requiresTotpSetup) {
      password.value = ''
      step.value = 'setup'
      return
    }
    finishLogin()
  } catch (err) {
    error.value = normalizeError(err)
  } finally {
    busy.value = false
  }
}

async function submitTotp() {
  error.value = ''
  const code = twofactor.value.replace(/\s+/g, '')
  if (!code) {
    error.value = 'Enter the code from your authenticator.'
    return
  }

  busy.value = true
  try {
    await loginTacticalWithTotp(username.value.trim(), password.value, code)
    finishLogin()
  } catch (err) {
    error.value = normalizeError(err)
  } finally {
    busy.value = false
  }
}

function backToCredentials() {
  step.value = 'credentials'
  twofactor.value = ''
  error.value = ''
}

function finishLogin() {
  // Password/TOTP remain only in this component's memory. Reload immediately
  // so bootstrap verifies the newly issued Tactical token before showing Tec-Tac.
  password.value = ''
  twofactor.value = ''
  window.location.reload()
}

function openTactical() {
  window.location.href = '/'
}

function openTacticalTotpSetup() {
  window.location.href = '/totp_setup'
}
</script>

<template>
  <section class="login-gate" aria-labelledby="tec-tac-login-title">
    <div class="login-head">
      <span class="eyebrow">TACTICAL AUTHENTICATION</span>
      <h1 id="tec-tac-login-title">Sign in to Tec-Tac</h1>
      <p>Tec-Tac uses Tactical's own authentication API. Your password and TOTP code are sent directly to Tactical and are not stored by Tec-Tac.</p>
    </div>

    <form v-if="step === 'credentials'" class="login-form" @submit.prevent="submitCredentials">
      <label class="field">
        <span>Username</span>
        <input v-model="username" name="username" autocomplete="username" autofocus :disabled="busy" />
      </label>
      <label class="field">
        <span>Password</span>
        <input v-model="password" name="password" type="password" autocomplete="current-password" :disabled="busy" />
      </label>

      <div v-if="error" class="auth-error" role="alert">{{ error }}</div>

      <div class="login-actions">
        <button class="btn primary" type="submit" :disabled="busy">{{ busy ? 'Checking…' : 'Continue' }}</button>
        <button class="btn ghost" type="button" :disabled="busy" @click="openTactical">Open Tactical instead</button>
      </div>
    </form>

    <form v-else-if="step === 'totp'" class="login-form" @submit.prevent="submitTotp">
      <div class="auth-step">
        <span class="pill ok">PASSWORD VERIFIED</span>
        <span class="mono">{{ username }}</span>
      </div>

      <label class="field">
        <span>Authenticator code</span>
        <input
          ref="totpInput"
          v-model="twofactor"
          name="twofactor"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="12"
          placeholder="000000"
          :disabled="busy"
        />
      </label>
      <p class="field-help">Enter the current code from the authenticator configured for this Tactical account.</p>

      <div v-if="error" class="auth-error" role="alert">{{ error }}</div>

      <div class="login-actions">
        <button class="btn primary" type="submit" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
        <button class="btn" type="button" :disabled="busy" @click="backToCredentials">Back</button>
      </div>
    </form>

    <div v-else class="login-form">
      <div class="auth-step">
        <span class="pill warn">TOTP SETUP REQUIRED</span>
        <span class="mono">{{ username }}</span>
      </div>
      <p class="setup-copy">This Tactical account does not have an authenticator enrolled yet. Tactical requires the enrollment step before normal sign-in, so Tec-Tac will not open the operational UI until setup is complete.</p>
      <div class="login-actions">
        <button class="btn primary" type="button" @click="openTacticalTotpSetup">Complete setup in Tactical</button>
        <button class="btn" type="button" @click="backToCredentials">Use another account</button>
      </div>
    </div>

    <div class="login-foot">
      <span>AUTHORITY</span><b>Tactical RMM</b>
      <span>SESSION</span><b>Knox token</b>
      <span>UI</span><b>0.2.0</b>
    </div>
  </section>
</template>
