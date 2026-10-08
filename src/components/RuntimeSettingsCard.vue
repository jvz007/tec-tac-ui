<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import {
  canEditRuntimeSettings,
  getRuntimeSettings,
  saveRegisterTimeout,
  validateRegisterTimeout,
} from '../runtime-settings'

const state = inject('tecTacState')
const settings = ref(null)
const loading = ref(true)
const loadError = ref('')
const draft = ref(null)
const saving = ref(false)
const saveError = ref('')
const saved = ref(false)

const canEdit = computed(() => canEditRuntimeSettings(state?.context))
const validation = computed(() => (
  settings.value
    ? validateRegisterTimeout(draft.value, { minimum: settings.value.minimum, maximum: settings.value.maximum })
    : { valid: false, message: '' }
))
const dirty = computed(() => settings.value && draft.value !== settings.value.value)
const formatTime = (value) => (value ? new Date(value).toLocaleString() : '—')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    settings.value = await getRuntimeSettings()
    draft.value = settings.value ? settings.value.value : null
  } catch (error) {
    loadError.value = error?.message || 'Runtime settings could not be loaded.'
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!validation.value.valid || saving.value) return
  saving.value = true
  saveError.value = ''
  saved.value = false
  try {
    const next = await saveRegisterTimeout(draft.value)
    if (next) settings.value = next
    else await load()
    draft.value = settings.value?.value ?? draft.value
    saved.value = true
  } catch (error) {
    // Core's 400, 403 and 429 messages are shown as returned.
    saveError.value = error?.message || 'The setting could not be saved.'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <!-- A 404 means an older Core without this endpoint: the card is not rendered. -->
  <section v-if="!loading && (settings || loadError)" class="card runtime-settings-card mb" aria-labelledby="runtime-settings-title">
    <div class="cardhead"><div><span class="eyebrow">RUNTIME SETTINGS</span><h3 id="runtime-settings-title">Module start-up time limit</h3></div></div>
    <div v-if="loadError" class="state-inline warning"><b>Runtime settings unavailable.</b> {{ loadError }}</div>
    <template v-else>
      <p class="compact-copy muted">How long a module's UI may take to start before Tec-Tac marks it failed and carries on with the next one. The limit applies to the module's page code, not to the module's work after sign-in.</p>
      <dl class="kvlist">
        <dt>Current limit</dt><dd class="mono">{{ settings.value }} seconds</dd>
        <dt>Allowed range</dt><dd class="mono">{{ settings.minimum }} to {{ settings.maximum }} seconds</dd>
        <dt>Default</dt><dd class="mono">{{ settings.default }} seconds</dd>
        <dt>Last changed by</dt><dd>{{ settings.updated_by || '—' }}</dd>
        <dt>Last changed</dt><dd>{{ formatTime(settings.updated_at) }}</dd>
      </dl>
      <form v-if="canEdit" class="runtime-settings-form" @submit.prevent="save">
        <label class="field"><span>Limit in seconds</span><input v-model.number="draft" type="number" inputmode="numeric" :min="settings.minimum" :max="settings.maximum" step="1" :disabled="saving" aria-describedby="runtime-settings-help"></label>
        <p id="runtime-settings-help" class="field-help" :class="{ dangertext: dirty && !validation.valid }">{{ dirty && !validation.valid ? validation.message : `Whole seconds from ${settings.minimum} to ${settings.maximum}.` }}</p>
        <div class="login-actions"><button class="btn primary" type="submit" :disabled="saving || !dirty || !validation.valid">{{ saving ? 'Saving…' : 'Save' }}</button></div>
        <div v-if="saveError" class="auth-error" role="alert">{{ saveError }}</div>
        <div v-if="saved" class="state-inline" role="status">Saved. The new limit applies the next time the page is loaded.</div>
      </form>
      <p v-else class="compact-copy muted">Only a superuser, or an administrator with the core.privileged_operations or core.runtime_settings.manage permission, can change this limit.</p>
    </template>
  </section>
</template>
