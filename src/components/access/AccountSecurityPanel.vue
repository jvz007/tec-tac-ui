<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getAccountSecurityPolicy, updateAccountSecurityPolicy } from '../../access'
import { persistAccountSecurityPolicy } from '../../account-security-policy-save'
import { clearUnsaved, registerUnsaved } from '../../unsaved'

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const policy = ref(null)
const canChange = ref(false)
const requested = ref(false)
const dirty = computed(() => policy.value && requested.value !== policy.value.protect_superuser_accounts)
const unsavedId = 'account-security-policy'

watch(dirty, (value) => {
  if (value) registerUnsaved(unsavedId, 'Superuser account protection policy', { save: savePolicy, discard: loadPolicy })
  else clearUnsaved(unsavedId)
})

async function loadPolicy() {
  loading.value = true
  error.value = ''
  try {
    const response = await getAccountSecurityPolicy()
    policy.value = response?.policy || null
    canChange.value = response?.can_change === true
    requested.value = policy.value?.protect_superuser_accounts === true
    clearUnsaved(unsavedId)
  } catch (err) {
    error.value = err?.message || 'Unable to load account security policy.'
  } finally {
    loading.value = false
  }
}

async function savePolicy() {
  if (!canChange.value || saving.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const response = await persistAccountSecurityPolicy(requested.value, updateAccountSecurityPolicy)
    policy.value = response?.policy || policy.value
    requested.value = policy.value?.protect_superuser_accounts === true
    clearUnsaved(unsavedId)
    notice.value = requested.value
      ? 'Superuser account protection is enabled.'
      : 'Superuser account protection is disabled; Tactical native account-management behaviour applies.'
  } catch (err) {
    error.value = err?.message || 'Unable to update account security policy.'
    // Preserve the operator's requested value and reject the save. The global
    // unsaved-change dialog must remain open and must not navigate away after
    // a failed policy write.
    throw err
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadPolicy()
})
onBeforeUnmount(() => clearUnsaved(unsavedId))
</script>

<template>
  <div class="stack">
    <div v-if="loading" class="callout mono">Loading account security policy…</div>
    <div v-else-if="error" class="state-inline denied" role="alert"><b>Policy unavailable.</b> {{ error }}</div>
    <template v-else-if="policy">
      <section class="card">
        <div class="cardhead">
          <div><span class="eyebrow">ROOT-OWNED POLICY</span><h3>Superuser account protection</h3></div>
          <span class="pill" :class="requested ? 'ok' : 'warn'">{{ requested ? 'ON' : 'OFF' }}</span>
        </div>
        <p>When enabled, only an effective superuser may reset credentials, reset TOTP, edit or delete an existing superuser account, or create/change/delete API keys for that account. Granting superuser authority remains superuser-only regardless of this setting.</p>
        <label class="checkline">
          <input v-model="requested" type="checkbox" :disabled="!canChange || saving" />
          <span>Protect existing superuser accounts from non-superuser account administrators</span>
        </label>
        <div v-if="!canChange" class="state-inline warning"><b>Read only.</b> Only an effective superuser can change this root-owned policy.</div>
        <div v-if="notice" class="state-inline"><b>Updated.</b> {{ notice }}</div>
        <div class="editor-actions">
          <button class="btn primary" :disabled="!canChange || saving || !dirty" @click="savePolicy">{{ saving ? 'Saving…' : 'Save policy' }}</button>
          <button class="btn" :disabled="loading || saving" @click="loadPolicy">Refresh</button>
        </div>
        <dl class="kvlist">
          <dt>Default</dt><dd>Off</dd>
          <dt>Storage</dt><dd class="mono">root-owned policy</dd>
          <dt>Last changed by</dt><dd class="mono">{{ policy.updated_by || '—' }}</dd>
          <dt>Last changed</dt><dd class="mono smalltext">{{ policy.updated_at || '—' }}</dd>
        </dl>
      </section>
    </template>
  </div>
</template>
