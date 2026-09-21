<script setup>
import { computed, nextTick, ref } from 'vue'
import {
  checkTacticalCredentials,
  clearTacticalSession,
  fetchTacticalTotpQr,
  loginTacticalWithTotp,
  setupTacticalTotp,
} from '../api'

const uiVersion = __TEC_TAC_UI_VERSION__
const username = ref('')
const password = ref('')
const twofactor = ref('')
const step = ref('credentials')
const busy = ref(false)
const error = ref('')
const setup = ref(null)
const qrSrc = ref('')
const qrError = ref('')
const copied = ref(false)
const totpInput = ref(null)

const setupKey = computed(() => setup.value?.totp_key || '')
const setupUri = computed(() => setup.value?.qr_url || '')

function normalizeError(err) {
  if (!err) return 'Authentication failed.'
  if (err.status === 400 || err.status === 401 || err.status === 403) return 'The username, password, or authentication code was not accepted by Tactical.'
  if (err.status === 429) return 'Too many authentication attempts. Wait a moment before trying again.'
  return err.message || 'Authentication failed.'
}

async function submitCredentials() {
  error.value = ''
  copied.value = false
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
      await beginTotpSetup()
      return
    }
    finishLogin()
  } catch (err) {
    error.value = normalizeError(err)
  } finally {
    busy.value = false
  }
}

function clearQr() {
  if (qrSrc.value) URL.revokeObjectURL(qrSrc.value)
  qrSrc.value = ''
  qrError.value = ''
}

async function beginTotpSetup() {
  error.value = ''
  clearQr()
  const result = await setupTacticalTotp()
  if (!result || !result.totp_key || !result.qr_url) {
    throw Object.assign(new Error('Tactical did not return the authenticator setup details.'), { status: 502 })
  }
  setup.value = result
  try {
    const qrBlob = await fetchTacticalTotpQr()
    qrSrc.value = URL.createObjectURL(qrBlob)
  } catch (err) {
    // Enrollment is already active at this point. Keep the manual key visible
    // and report QR failure without abandoning the setup flow.
    qrError.value = err?.message || 'QR code could not be generated.'
  }
  twofactor.value = ''
  step.value = 'setup'
  await nextTick()
  totpInput.value?.focus()
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

async function submitSetupTotp() {
  // Tactical marks the secret active when /accounts/users/setup_totp/ is called.
  // Complete enrollment by proving the generated code through Tactical's normal
  // /v2/login/ endpoint before Tec-Tac exposes the operational shell.
  await submitTotp()
}

async function copySetupKey() {
  if (!setupKey.value || !navigator.clipboard) return
  await navigator.clipboard.writeText(setupKey.value)
  copied.value = true
  window.setTimeout(() => { copied.value = false }, 1800)
}

function backToCredentials() {
  // A no-TOTP credential check creates a short-lived Tactical setup token.
  // Never leave that token behind when the operator abandons enrollment.
  clearTacticalSession()
  clearQr()
  step.value = 'credentials'
  setup.value = null
  twofactor.value = ''
  password.value = ''
  error.value = ''
  copied.value = false
}

function finishLogin() {
  password.value = ''
  twofactor.value = ''
  clearQr()
  setup.value = null
  window.location.reload()
}

function openTactical() {
  window.location.href = '/'
}
</script>

<template>
  <section class="login-gate" aria-labelledby="tec-tac-login-title">
    <div class="login-head">
      <span class="eyebrow">TACTICAL AUTHENTICATION</span>
      <h1 id="tec-tac-login-title">Sign in to Tec-Tac</h1>
      <p>Tec-Tac uses Tactical's authentication API directly. Passwords and authenticator codes stay in this sign-in flow and are never stored by Tec-Tac.</p>
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
      <p class="field-help">Enter the current 6-digit code from the authenticator configured for this Tactical account.</p>

      <div v-if="error" class="auth-error" role="alert">{{ error }}</div>

      <div class="login-actions">
        <button class="btn primary" type="submit" :disabled="busy">{{ busy ? 'Signing in…' : 'Sign in' }}</button>
        <button class="btn" type="button" :disabled="busy" @click="backToCredentials">Back</button>
      </div>
    </form>

    <form v-else class="login-form" @submit.prevent="submitSetupTotp">
      <div class="auth-step">
        <span class="pill warn">AUTHENTICATOR SETUP</span>
        <span class="mono">{{ username }}</span>
      </div>

      <div class="totp-setup-grid">
        <div>
          <span class="eyebrow">1 / ADD ACCOUNT</span>
          <h2>Set up your authenticator</h2>
          <p class="setup-copy">Add a new time-based account in Microsoft Authenticator, Google Authenticator, 1Password, or another TOTP-compatible app.</p>
        </div>

        <div class="totp-enrollment-card">
          <div class="totp-qr-panel">
            <span class="eyebrow">SCAN QR CODE</span>
            <div class="totp-qr-frame">
              <img v-if="qrSrc" :src="qrSrc" alt="Authenticator enrollment QR code" class="totp-qr-image" />
              <div v-else class="totp-qr-placeholder">
                <span class="mono">QR UNAVAILABLE</span>
                <small>{{ qrError || 'Generating QR code…' }}</small>
              </div>
            </div>
            <p class="field-help">Scan this code with your authenticator app. The QR is generated locally by Tec-Tac and is never sent to a third-party QR service.</p>
          </div>

          <div class="totp-secret-card">
            <span class="eyebrow">MANUAL SETUP KEY</span>
            <code class="totp-secret mono">{{ setupKey }}</code>
            <div class="totp-secret-actions">
              <button class="btn sm" type="button" @click="copySetupKey">{{ copied ? 'Copied' : 'Copy key' }}</button>
              <a v-if="setupUri" class="btn sm ghost" :href="setupUri">Open authenticator URI</a>
            </div>
            <p class="field-help">Manual fallback. Use a time-based (TOTP) account. Keep this key private; anyone with it can generate valid codes.</p>
          </div>
        </div>
      </div>

      <div class="section-divider">2 / Verify enrollment</div>
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
      <p class="field-help">Enter the current code from the account you just added. Tec-Tac only opens after Tactical verifies it.</p>

      <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
      <div class="totp-enrollment-warning"><span class="pill warn">ENROLLMENT ACTIVE</span><span>Once this setup key is issued, Tactical treats two-factor authentication as configured. Complete verification now. If the key is lost, an administrator must reset 2FA for the account.</span></div>

      <div class="login-actions">
        <button class="btn primary" type="submit" :disabled="busy">{{ busy ? 'Verifying…' : 'Verify and sign in' }}</button>
      </div>
    </form>

    <div class="login-foot">
      <span>AUTHORITY</span><b>Tactical RMM</b>
      <span>SESSION</span><b>Knox token</b>
      <span>UI</span><b>{{ uiVersion }}</b>
    </div>
  </section>
</template>
