<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import {
  canEditRuntimeSettings,
  canEditUploadLimit,
  getRuntimeSettingsPayload,
  normalizeRuntimeSettings,
  normalizeSystemName,
  normalizeUploadLimit,
  resetSystemName,
  saveRegisterTimeout,
  saveSystemName,
  saveUploadLimit,
  uploadLimitDefaultText,
  uploadLimitRangeText,
  validateRegisterTimeout,
  validateSystemName,
  validateUploadLimit,
} from '../runtime-settings'

const state = inject('tecTacState')
const settings = ref(null)
const uploadLimit = ref(null)
const systemName = ref(null)
const nameDraft = ref('')
const nameSaving = ref(false)
const nameError = ref('')
const nameSaved = ref('')
const changed = ref({ updated_by: null, updated_at: null })
const loading = ref(true)
const loadError = ref('')
const draft = ref(null)
const saving = ref(false)
const saveError = ref('')
const saved = ref(false)
const uploadDraft = ref(null)
const uploadSaving = ref(false)
const uploadError = ref('')
const uploadSaved = ref(false)

const canEdit = computed(() => canEditRuntimeSettings(state?.context))
const validation = computed(() => (
  settings.value
    ? validateRegisterTimeout(draft.value, { minimum: settings.value.minimum, maximum: settings.value.maximum })
    : { valid: false, message: '' }
))
const dirty = computed(() => settings.value && draft.value !== settings.value.value)
const canEditUpload = computed(() => canEditUploadLimit(state?.context))
const uploadValidation = computed(() => (
  uploadLimit.value
    ? validateUploadLimit(uploadDraft.value, { minimum: uploadLimit.value.minimum, maximum: uploadLimit.value.maximum })
    : { valid: false, message: '' }
))
const uploadDirty = computed(() => uploadLimit.value && uploadDraft.value !== uploadLimit.value.value)
const uploadRange = computed(() => (uploadLimit.value ? uploadLimitRangeText(uploadLimit.value.minimum, uploadLimit.value.maximum) : ''))
const uploadDefault = computed(() => (uploadLimit.value ? uploadLimitDefaultText(uploadLimit.value.default) : ''))
const nameValidation = computed(() => validateSystemName(nameDraft.value, { maximum: systemName.value?.maximum_length }))
const nameDirty = computed(() => systemName.value && nameDraft.value.trim() !== systemName.value.value)
const nameIsDefault = computed(() => systemName.value && systemName.value.value === systemName.value.default)
const formatTime = (value) => (value ? new Date(value).toLocaleString() : '—')

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const payload = await getRuntimeSettingsPayload()
    settings.value = normalizeRuntimeSettings(payload)
    draft.value = settings.value ? settings.value.value : null
    uploadLimit.value = normalizeUploadLimit(payload)
    uploadDraft.value = uploadLimit.value ? uploadLimit.value.value : null
    systemName.value = normalizeSystemName(payload)
    nameDraft.value = systemName.value ? systemName.value.value : ''
    // Keep the shell's copy (My Account reads it) in step with what Core holds.
    if (systemName.value && state?.context) state.context.system_name = systemName.value.value
    changed.value = {
      updated_by: typeof payload?.updated_by === 'string' ? payload.updated_by : null,
      updated_at: typeof payload?.updated_at === 'string' ? payload.updated_at : null,
    }
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

async function saveUpload() {
  if (!uploadValidation.value.valid || uploadSaving.value) return
  uploadSaving.value = true
  uploadError.value = ''
  uploadSaved.value = false
  try {
    await saveUploadLimit(uploadDraft.value)
    // Reload, so the limit and who changed it come from Core.
    await load()
    uploadSaved.value = true
  } catch (error) {
    // Core's 400 and 403 messages are shown as returned.
    uploadError.value = error?.message || 'The setting could not be saved.'
  } finally {
    uploadSaving.value = false
  }
}

async function changeName(action) {
  if (nameSaving.value) return
  nameSaving.value = true
  nameError.value = ''
  nameSaved.value = ''
  try {
    if (action === 'reset') await resetSystemName()
    else await saveSystemName(nameDraft.value)
    // Reload, so the name shown is the one Core holds.
    await load()
    nameSaved.value = action === 'reset' ? 'Reset to the default name.' : 'Saved. A new authenticator set-up shows this name.'
  } catch (error) {
    // Core's 400 and 403 messages are shown as returned.
    nameError.value = error?.message || 'The name could not be saved.'
  } finally {
    nameSaving.value = false
  }
}

onMounted(load)
</script>

<template>
  <!-- A 404 means an older Core without this endpoint: the cards are not rendered. -->
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
  <!-- Core 1.17.14 and later. Only a superuser sees the form; Core refuses anyone else. -->
  <section v-if="!loading && uploadLimit" class="card runtime-settings-card mb" aria-labelledby="upload-limit-title">
    <div class="cardhead"><div><span class="eyebrow">RUNTIME SETTINGS</span><h3 id="upload-limit-title">Tactical operation upload limit</h3></div></div>
    <p class="compact-copy muted">The largest file one Tactical operation may send, such as a report template or an asset. A file is held to the smaller of this limit and the operation's own limit. A size limit in the web server (nginx) or in Tactical still applies first, so raising this setting does not change that one.</p>
    <dl class="kvlist">
      <dt>Current limit</dt><dd class="mono">{{ uploadLimit.value }} MiB</dd>
      <dt>Allowed range</dt><dd class="mono">{{ uploadRange }}</dd>
      <dt>Default</dt><dd class="mono">{{ uploadDefault }}</dd>
      <dt>Last changed by</dt><dd>{{ changed.updated_by || '—' }}</dd>
      <dt>Last changed</dt><dd>{{ formatTime(changed.updated_at) }}</dd>
    </dl>
    <form v-if="canEditUpload" class="runtime-settings-form" @submit.prevent="saveUpload">
      <label class="field"><span>Limit in MiB</span><input v-model.number="uploadDraft" type="number" inputmode="numeric" :min="uploadLimit.minimum" :max="uploadLimit.maximum" step="1" :disabled="uploadSaving" aria-describedby="upload-limit-help"></label>
      <p id="upload-limit-help" class="field-help" :class="{ dangertext: uploadDirty && !uploadValidation.valid }">{{ uploadDirty && !uploadValidation.valid ? uploadValidation.message : `Whole MiB from ${uploadLimit.minimum} to ${uploadLimit.maximum}.` }}</p>
      <div class="login-actions"><button class="btn primary" type="submit" :disabled="uploadSaving || !uploadDirty || !uploadValidation.valid">{{ uploadSaving ? 'Saving…' : 'Save' }}</button></div>
      <div v-if="uploadError" class="auth-error" role="alert">{{ uploadError }}</div>
      <div v-if="uploadSaved" class="state-inline" role="status">Saved. The new limit applies from the next upload.</div>
    </form>
    <p v-else class="compact-copy muted">Only a superuser can change this limit.</p>
  </section>
  <!-- Core 1.17.23 and later. A Core that sends no system_name leaves this card out. -->
  <section v-if="!loading && systemName" class="card runtime-settings-card mb" aria-labelledby="system-name-title">
    <div class="cardhead"><div><span class="eyebrow">RUNTIME SETTINGS</span><h3 id="system-name-title">System name</h3></div></div>
    <p class="compact-copy muted">The name an authenticator app shows beside your account when someone sets up two-factor sign-in. People who already set it up keep their entry. Only a new set-up shows a changed name.</p>
    <dl class="kvlist">
      <dt>Current name</dt><dd class="mono">{{ systemName.value }}</dd>
      <dt>Default</dt><dd class="mono">{{ systemName.default }}</dd>
      <dt>Length</dt><dd class="mono">1 to {{ systemName.maximum_length }} characters, no colon</dd>
    </dl>
    <form v-if="canEdit" class="runtime-settings-form" @submit.prevent="changeName('save')">
      <label class="field"><span>System name</span><input v-model="nameDraft" type="text" :maxlength="systemName.maximum_length + 20" autocomplete="off" :disabled="nameSaving" aria-describedby="system-name-help"></label>
      <p id="system-name-help" class="field-help" :class="{ dangertext: nameDirty && !nameValidation.valid }">{{ nameDirty && !nameValidation.valid ? nameValidation.message : `Up to ${systemName.maximum_length} characters. A colon is not allowed.` }}</p>
      <div class="login-actions">
        <button class="btn primary" type="submit" :disabled="nameSaving || !nameDirty || !nameValidation.valid">{{ nameSaving ? 'Saving…' : 'Save' }}</button>
        <button class="btn" type="button" :disabled="nameSaving || nameIsDefault" @click="changeName('reset')">Reset to default</button>
      </div>
      <div v-if="nameError" class="auth-error" role="alert">{{ nameError }}</div>
      <div v-if="nameSaved" class="state-inline" role="status">{{ nameSaved }}</div>
    </form>
    <p v-else class="compact-copy muted">Only a superuser, or an administrator with the core.runtime_settings.manage permission, can change this name.</p>
  </section>
</template>
