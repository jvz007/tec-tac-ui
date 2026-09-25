<script setup>
import { computed, onMounted, ref } from 'vue'
import { generateMfaBackupCodes, getMfaBackupCodeStatus } from '../../access'

const loading = ref(true)
const busy = ref(false)
const error = ref('')
const status = ref(null)
const showGenerate = ref(false)
const password = ref('')
const totp = ref('')
const codes = ref([])
const copied = ref(false)

const canGenerate = computed(() => status.value?.totp_configured && !status.value?.sso_user)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await getMfaBackupCodeStatus()
    status.value = data?.status || null
  } catch (err) {
    error.value = err?.message || 'Unable to load MFA recovery status.'
  } finally {
    loading.value = false
  }
}

function openGenerate() {
  password.value = ''
  totp.value = ''
  codes.value = []
  error.value = ''
  showGenerate.value = true
}

function closeGenerate() {
  password.value = ''
  totp.value = ''
  codes.value = []
  copied.value = false
  showGenerate.value = false
}

async function generate() {
  if (!password.value || !totp.value.trim()) return
  busy.value = true
  error.value = ''
  try {
    const data = await generateMfaBackupCodes(password.value, totp.value.trim())
    codes.value = Array.isArray(data?.codes) ? data.codes : []
    status.value = data?.status || status.value
    password.value = ''
    totp.value = ''
  } catch (err) {
    error.value = err?.message || 'Backup codes could not be generated.'
  } finally {
    busy.value = false
  }
}

async function copyAll() {
  if (!codes.value.length || !navigator.clipboard) return
  await navigator.clipboard.writeText(codes.value.join('\n'))
  copied.value = true
  window.setTimeout(() => { copied.value = false }, 1800)
}

function downloadCodes() {
  if (!codes.value.length) return
  const body = [
    'Tec-Tac MFA backup codes',
    'Each code can be used once. Store these securely.',
    '',
    ...codes.value,
    '',
  ].join('\n')
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'tec-tac-mfa-backup-codes.txt'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

onMounted(load)
</script>

<template>
  <div v-if="loading" class="callout mono">Loading MFA recovery status…</div>
  <div v-else class="grid g2">
    <article class="card">
      <div class="cardhead">
        <div><span class="eyebrow">MFA RECOVERY</span><h3>Backup codes</h3></div>
        <span class="pill" :class="status?.unused ? 'ok' : 'warn'">{{ status?.unused ? `${status.unused} AVAILABLE` : 'NOT READY' }}</span>
      </div>
      <p class="muted compact-copy">Backup codes are one-time recovery credentials for Tec-Tac sign-in when your authenticator is unavailable. Core stores only password hashes of the codes.</p>
      <dl class="kvlist">
        <dt>TOTP configured</dt><dd>{{ status?.totp_configured ? 'yes' : 'no' }}</dd>
        <dt>Available codes</dt><dd class="mono">{{ status?.unused ?? 0 }}</dd>
        <dt>Used codes</dt><dd class="mono">{{ status?.used ?? 0 }}</dd>
        <dt>Last generated</dt><dd class="mono smalltext">{{ status?.generated_at || '—' }}</dd>
      </dl>
      <div v-if="status?.sso_user" class="state-inline warning"><b>SSO managed.</b> Backup codes are not available for accounts whose authentication is delegated to SSO.</div>
      <div v-else-if="!status?.totp_configured" class="state-inline warning"><b>TOTP required.</b> Complete authenticator enrollment before creating recovery codes.</div>
      <div class="editor-actions">
        <button class="btn primary" :disabled="!canGenerate" @click="openGenerate">{{ status?.configured ? 'Regenerate backup codes' : 'Generate backup codes' }}</button>
        <button class="btn" @click="load">Refresh</button>
      </div>
    </article>

    <article class="card">
      <div class="cardhead"><div><span class="eyebrow">SECURITY BEHAVIOUR</span><h3>How recovery works</h3></div></div>
      <ul class="security-list">
        <li>Generation requires your current password and a current authenticator code.</li>
        <li>Generating a new set invalidates every older unused backup code.</li>
        <li>Each recovery code is accepted once and marked used atomically.</li>
        <li>Plaintext codes are shown only immediately after generation and are not recoverable later.</li>
      </ul>
    </article>

    <div v-if="showGenerate" class="modal-backdrop" @click.self="closeGenerate">
      <section class="modal-panel mfa-code-modal" role="dialog" aria-modal="true" aria-labelledby="backup-code-title">
        <div class="cardhead">
          <div><span class="eyebrow">MFA RECOVERY</span><h3 id="backup-code-title">{{ codes.length ? 'Save your backup codes' : 'Generate backup codes' }}</h3></div>
          <button class="btn sm ghost" aria-label="Close" @click="closeGenerate">×</button>
        </div>

        <template v-if="!codes.length">
          <div class="state-inline warning"><b>This replaces the current set.</b> Any existing unused backup codes stop working immediately after generation.</div>
          <label class="field"><span>Current password</span><input v-model="password" type="password" autocomplete="current-password" :disabled="busy" /></label>
          <label class="field"><span>Current authenticator code</span><input v-model="totp" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="000000" :disabled="busy" /></label>
          <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
          <div class="editor-actions">
            <button class="btn primary" :disabled="busy || !password || !totp.trim()" @click="generate">{{ busy ? 'Generating…' : 'Generate new codes' }}</button>
            <button class="btn" :disabled="busy" @click="closeGenerate">Cancel</button>
          </div>
        </template>

        <template v-else>
          <div class="state-inline warning"><b>Shown once.</b> Save these codes now. Tec-Tac cannot display them again after this window is closed.</div>
          <div class="backup-code-grid" aria-label="MFA backup codes">
            <code v-for="code in codes" :key="code" class="backup-code mono">{{ code }}</code>
          </div>
          <div class="editor-actions">
            <button class="btn primary" @click="copyAll">{{ copied ? 'Copied' : 'Copy all' }}</button>
            <button class="btn" @click="downloadCodes">Download .txt</button>
            <button class="btn" @click="closeGenerate">Done</button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>
