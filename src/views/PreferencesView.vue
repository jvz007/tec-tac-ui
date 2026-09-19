<script setup>
import { computed, ref, watch } from 'vue'
import {
  preferenceState,
  resetNavigationPreferences,
  resetUserPreferences,
  saveUserPreferences,
} from '../preferences'

function clone(value) { return JSON.parse(JSON.stringify(value)) }
const draft = ref(clone(preferenceState.preferences))
const saved = ref('')
const error = ref('')

watch(() => preferenceState.preferences, (value) => {
  draft.value = clone(value)
}, { deep: true })

const favoriteCount = computed(() => draft.value.navigation?.favorites?.length || 0)
const orderedSectionCount = computed(() => Object.keys(draft.value.navigation?.order || {}).length)
const collapsedCount = computed(() => Object.values(draft.value.navigation?.collapsed_sections || {}).filter(Boolean).length)

async function save() {
  error.value = ''
  saved.value = ''
  try {
    await saveUserPreferences(draft.value)
    saved.value = 'Preferences saved.'
  } catch (e) {
    error.value = e?.message || 'Unable to save preferences.'
  }
}

async function resetNavigation() {
  if (!window.confirm('Reset your Tec-Tac navigation order, Favorites and collapsed sections?')) return
  error.value = ''
  saved.value = ''
  try {
    resetNavigationPreferences({ save: false })
    draft.value = clone(preferenceState.preferences)
    await saveUserPreferences(draft.value)
    saved.value = 'Navigation preferences reset.'
  } catch (e) {
    error.value = e?.message || 'Unable to reset navigation preferences.'
  }
}

async function resetAll() {
  if (!window.confirm('Reset all Tec-Tac preferences for your user?')) return
  error.value = ''
  saved.value = ''
  try {
    await resetUserPreferences()
    draft.value = clone(preferenceState.preferences)
    saved.value = 'All preferences reset.'
  } catch (e) {
    error.value = e?.message || 'Unable to reset preferences.'
  }
}
</script>

<template>
  <section class="phead">
    <div><span class="eyebrow">USER WORKSPACE</span><h1>Preferences</h1><p>Personalize Tec-Tac for your account. These settings follow you between browsers and workstations.</p></div>
    <div class="row"><button class="btn ghost" :disabled="preferenceState.saving" @click="resetAll">Reset all</button><button class="btn primary" :disabled="preferenceState.saving" @click="save">{{ preferenceState.saving ? 'Saving…' : 'Save preferences' }}</button></div>
  </section>

  <div v-if="error || preferenceState.error" class="state-inline warning mb"><b>Preference error.</b> {{ error || preferenceState.error }}</div>
  <div v-if="saved" class="state-inline mb"><b>{{ saved }}</b></div>

  <div class="preferences-layout">
    <section class="card preference-card">
      <div class="cardhead"><div><span class="eyebrow">APPEARANCE</span><h3>Theme</h3></div></div>
      <p class="muted">Choose the Tec-Tac interface theme used after you sign in.</p>
      <label class="field"><span>Theme</span><select v-model="draft.appearance.theme"><option value="dark">Dark</option><option value="light">Light</option><option value="high-contrast">High contrast</option></select></label>
    </section>

    <section class="card preference-card">
      <div class="cardhead"><div><span class="eyebrow">NAVIGATION</span><h3>Menu behavior</h3></div><button class="btn ghost sm" @click="resetNavigation">Reset navigation</button></div>
      <label class="preference-toggle"><input v-model="draft.navigation.rail_collapsed" type="checkbox"><span><b>Start with navigation collapsed</b><small>The rail can still be expanded at any time.</small></span></label>
      <div class="preference-stats">
        <div><span>Favorites</span><b>{{ favoriteCount }}</b></div>
        <div><span>Custom category order</span><b>{{ orderedSectionCount }}</b></div>
        <div><span>Collapsed categories</span><b>{{ collapsedCount }}</b></div>
      </div>
      <p class="muted smalltext">Menu ordering and Favorites are still changed directly from the navigation rail. They are now stored with your Tec-Tac user preferences.</p>
    </section>

    <section class="card preference-card">
      <div class="cardhead"><div><span class="eyebrow">DASHBOARDS</span><h3>Dashboard defaults</h3></div><span class="pill">READY FOR DASHBOARDS</span></div>
      <label class="preference-toggle"><input v-model="draft.dashboard.restore_last_dashboard" type="checkbox"><span><b>Return to my last dashboard</b><small>When dashboard composition is enabled, Tec-Tac will reopen the last dashboard you used.</small></span></label>
      <p class="muted smalltext">Your default dashboard selection will also be stored here once shared/private dashboards are introduced.</p>
    </section>

    <section class="card preference-card">
      <div class="cardhead"><div><span class="eyebrow">SYNC</span><h3>Account storage</h3></div><span class="pill ok">SERVER-SIDE</span></div>
      <dl class="kvlist module-kv"><dt>User</dt><dd class="mono">{{ preferenceState.username || '—' }}</dd><dt>Last saved</dt><dd class="mono">{{ preferenceState.updatedAt || 'not yet saved' }}</dd><dt>Browser cache</dt><dd>early startup fallback only</dd></dl>
      <p class="muted smalltext">The server-side profile is authoritative after sign-in. Browser storage is retained only so theme/navigation can render cleanly during startup and for migration from older Tec-Tac releases.</p>
    </section>
  </div>
</template>
