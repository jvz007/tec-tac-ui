<script setup>
// 0.12.118: the Licensing card on System Configuration (Core 1.17.58). The mode selector is for a superuser; everyone else reads
// the mode. The status panel is Core's allow-listed answer and hides on 403 and 404. Core stays the authority and logs-only is its
// default: nothing is sent until a superuser chooses. A change asks one plain Yes or No (no typing).
import { computed, inject, onMounted, ref } from 'vue'
import { useConfirm } from '../confirm-dialog'
import { getRuntimeSettingsPayload } from '../runtime-settings'
import {
  LICENSING_MODES,
  MODE_SENTENCES,
  NEVER_BLOCKED_LEAD,
  canChangeLicensingMode,
  getLicensingStatus,
  graceLine,
  licenceSentence,
  modeConfirmation,
  modeLabel,
  normalizeLicensingMode,
  saveLicensingMode,
  sourceText,
} from '../licensing'

const state = inject('tecTacState')
const askConfirm = useConfirm()
const mode = ref(null)
const draft = ref('')
const status = ref(null)
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveError = ref('')
const saved = ref('')

const canChange = computed(() => canChangeLicensingMode(state?.context))
const dirty = computed(() => mode.value && draft.value !== mode.value.value)
const visible = computed(() => loading.value || Boolean(mode.value) || Boolean(status.value) || Boolean(loadError.value))

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    mode.value = normalizeLicensingMode(await getRuntimeSettingsPayload())
    draft.value = mode.value ? mode.value.value : ''
  } catch (error) {
    mode.value = null
    loadError.value = error?.message || 'The licensing mode could not be loaded.'
  }
  try {
    const result = await getLicensingStatus()
    status.value = result.status || null
  } catch (error) {
    status.value = null
    if (!loadError.value) loadError.value = error?.message || 'The licensing status could not be loaded.'
  }
  loading.value = false
}

async function change(choice) {
  if (saving.value || !canChange.value) return
  const ask = modeConfirmation(choice)
  if (!(await askConfirm({ question: ask.question, detail: ask.detail, danger: ask.danger }))) return
  saving.value = true
  saveError.value = ''
  saved.value = ''
  try {
    // Exactly one key. Core's 400, 403 and 429 sentences are shown as sent.
    await saveLicensingMode(choice)
    await load()
    saved.value = choice === null ? "Licensing now uses Core's default." : `Licensing is now ${modeLabel(choice).toLowerCase()}.`
  } catch (error) {
    saveError.value = error?.message || 'The licensing mode could not be saved.'
  } finally {
    saving.value = false
  }
}
onMounted(load)
</script>

<template>
  <section v-if="visible" class="card runtime-settings-card mb" aria-labelledby="licensing-title">
    <div class="cardhead"><div><span class="eyebrow">LICENSING</span><h3 id="licensing-title">Module licensing</h3></div><span v-if="mode" class="pill" :class="mode.value === 'enforce' ? 'danger' : (mode.value === 'off' ? 'warn' : 'ok')">{{ modeLabel(mode.value) }}</span></div>
    <p class="compact-copy muted">Core checks whether a module that needs a licence may be staged or installed. It is set to log only by default, so nothing is refused until a superuser chooses otherwise.</p>
    <div v-if="loading" class="callout mono">Loading licensing…</div>
    <div v-if="loadError" class="auth-error" role="alert">{{ loadError }}</div>

    <template v-if="mode">
      <dl class="kvlist">
        <dt>Mode</dt><dd>{{ modeLabel(mode.value) }}</dd>
        <dt>What it means</dt><dd>{{ MODE_SENTENCES[mode.value] }}</dd>
        <dt>Set by</dt><dd>{{ sourceText(mode.source) }}</dd>
      </dl>
      <form v-if="canChange" class="runtime-settings-form" @submit.prevent="change(draft)">
        <fieldset class="field" :disabled="saving">
          <legend>Licensing mode</legend>
          <label v-for="choice in LICENSING_MODES.filter((item) => mode.choices.includes(item))" :key="choice" class="checkline">
            <input v-model="draft" type="radio" name="licensing-mode" :value="choice">
            <span><b>{{ modeLabel(choice) }}</b> · {{ MODE_SENTENCES[choice] }}</span>
          </label>
        </fieldset>
        <div class="login-actions">
          <button class="btn primary" type="submit" :disabled="saving || !dirty">{{ saving ? 'Saving…' : 'Save mode' }}</button>
          <button class="btn" type="button" :disabled="saving || mode.source === 'default'" @click="change(null)">Use Core's default</button>
        </div>
        <div v-if="saveError" class="auth-error" role="alert">{{ saveError }}</div>
        <div v-if="saved" class="state-inline" role="status">{{ saved }}</div>
      </form>
      <p v-else class="compact-copy muted">Only a superuser can change the licensing mode.</p>
    </template>

    <template v-if="status">
      <h4 class="mt">Status</h4>
      <dl class="kvlist" aria-label="Licensing status">
        <dt>Mode now</dt><dd>{{ modeLabel(status.mode.value) }} · {{ sourceText(status.mode.source) }}</dd>
        <dt>Licence</dt><dd>{{ licenceSentence(status.licenceState) }}<span v-if="status.licenceReason" class="sub">{{ status.licenceReason }}</span></dd>
        <dt>Grace window</dt><dd>{{ graceLine(status.grace) }}</dd>
        <dt>Would be refused</dt><dd>{{ status.wouldBlock.count }} module{{ status.wouldBlock.count === 1 ? '' : 's' }} if licensing were enforced</dd>
      </dl>
      <div v-if="status.wouldBlock.modules.length" class="tablewrap table-clean">
        <table><thead><tr><th>Module</th><th>Version</th><th>State</th><th>Reason</th></tr></thead><tbody>
          <tr v-for="item in status.wouldBlock.modules" :key="`${item.module}-${item.version}`"><td class="mono">{{ item.module }}</td><td class="mono">{{ item.version }}</td><td>{{ item.state }}</td><td>{{ item.reason }}</td></tr>
        </tbody></table>
      </div>
      <p v-if="status.wouldBlock.more" class="compact-copy muted">{{ status.wouldBlock.more }} more are not listed.</p>
      <p v-if="status.neverBlocked.length" class="compact-copy"><b>{{ NEVER_BLOCKED_LEAD }}</b> {{ status.neverBlocked.join(', ') }}.</p>
      <p v-if="status.revokedEffect" class="compact-copy muted">{{ status.revokedEffect }}</p>
    </template>
  </section>
</template>
