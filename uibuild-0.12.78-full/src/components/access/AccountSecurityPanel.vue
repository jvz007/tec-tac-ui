<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { getAccountSecurityPolicy, updateAccountSecurityPolicy } from '../../access'
import { clearUnsaved, registerUnsaved } from '../../unsaved'
import { useAccountSecurityPolicy } from '../../use-account-security-policy'

const {
  loading,
  saving,
  error,
  notice,
  policy,
  canChange,
  requested,
  dirty,
  loadPolicy,
  savePolicy,
  dispose,
} = useAccountSecurityPolicy({
  getPolicy: getAccountSecurityPolicy,
  updatePolicy: updateAccountSecurityPolicy,
  registerUnsaved,
  clearUnsaved,
})

onMounted(loadPolicy)
onBeforeUnmount(dispose)
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
