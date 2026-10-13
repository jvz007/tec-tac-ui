<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  clearSessionTheme,
  effectiveTheme,
  preferenceState,
  resetNavigationPreferences,
  resetUserPreferences,
  saveUserPreferences,
} from '../preferences'
import { listDashboards } from '../dashboards'
import { useConfirm } from '../confirm-dialog'

const confirmAction = useConfirm()

function clone(value) { return JSON.parse(JSON.stringify(value)) }
// The Theme select starts at the theme in effect (CO9). Save writes it; the header choice is cleared once it is saved.
function draftFrom(value) {
  const copy = clone(value)
  copy.appearance.theme = effectiveTheme()
  return copy
}
const draft = ref(draftFrom(preferenceState.preferences))
const saved = ref('')
const error = ref('')
const dashboards = ref([])

watch(() => preferenceState.preferences, (value) => {
  draft.value = draftFrom(value)
}, { deep: true })
watch(() => preferenceState.sessionTheme, () => {
  draft.value.appearance.theme = effectiveTheme()
})

const favoriteCount = computed(() => draft.value.navigation?.favorites?.length || 0)
const orderedSectionCount = computed(() => Object.keys(draft.value.navigation?.order || {}).length)
const sectionOrderCount = computed(() => draft.value.navigation?.section_order?.length || 0)
const collapsedCount = computed(() => Object.values(draft.value.navigation?.collapsed_sections || {}).filter(Boolean).length)

async function loadDashboards() {
  try {
    const response = await listDashboards()
    dashboards.value = response?.dashboards || []
  } catch (e) {
    error.value = e?.message || 'Unable to load dashboards.'
  }
}

async function save() {
  error.value = ''
  saved.value = ''
  try {
    await saveUserPreferences(draft.value)
    // The theme on this page is now saved, so the header choice for this session ends.
    await clearSessionTheme()
    saved.value = 'Preferences saved.'
  } catch (e) {
    error.value = e?.message || 'Unable to save preferences.'
  }
}

async function resetNavigation() {
  if (!(await confirmAction({ question: 'Reset your Tec-Tac navigation order, Favorites and collapsed sections?', danger: true }))) return
  error.value = ''
  saved.value = ''
  try {
    // The saved preferences only: a theme chosen for this session is not made permanent here.
    resetNavigationPreferences({ save: false })
    await saveUserPreferences(preferenceState.preferences)
    draft.value = draftFrom(preferenceState.preferences)
    saved.value = 'Navigation preferences reset.'
  } catch (e) {
    error.value = e?.message || 'Unable to reset navigation preferences.'
  }
}

async function resetAll() {
  if (!(await confirmAction({ question: 'Reset all Tec-Tac preferences for your user?', danger: true }))) return
  error.value = ''
  saved.value = ''
  try {
    await resetUserPreferences()
    await clearSessionTheme()
    draft.value = draftFrom(preferenceState.preferences)
    saved.value = 'All preferences reset.'
  } catch (e) {
    error.value = e?.message || 'Unable to reset preferences.'
  }
}

onMounted(loadDashboards)
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
      <label class="field"><span>Theme (saved when you press Save preferences)</span><select v-model="draft.appearance.theme"><option value="dark">Dark</option><option value="light">Light</option><option value="high-contrast">High contrast</option></select></label>
      <label class="field"><span>Text size</span><select v-model.number="draft.appearance.font_scale"><option :value="0.9">Small</option><option :value="1">Default</option><option :value="1.1">Large</option><option :value="1.2">Extra large</option></select></label>
    </section>

    <section class="card preference-card">
      <div class="cardhead"><div><span class="eyebrow">NAVIGATION</span><h3>Menu behavior</h3></div><div class="row"><router-link class="btn primary sm" to="/preferences/menu-layout">Menu layout</router-link><button class="btn ghost sm" @click="resetNavigation">Reset navigation</button></div></div>
      <label class="preference-toggle"><input v-model="draft.navigation.rail_collapsed" type="checkbox"><span><b>Start with navigation collapsed</b><small>The rail can still be expanded at any time.</small></span></label>
      <div class="preference-stats">
        <div><span>Favorites</span><b>{{ favoriteCount }}</b></div>
        <div><span>Ordered categories</span><b>{{ sectionOrderCount }}</b></div><div><span>Custom item groups</span><b>{{ orderedSectionCount }}</b></div>
        <div><span>Collapsed categories</span><b>{{ collapsedCount }}</b></div>
      </div>
      <p class="muted smalltext">Use Menu Layout for category and item ordering. Favorites can still be managed from the navigation rail. All changes are stored with your Tec-Tac user preferences.</p>
    </section>

    <section class="card preference-card">
      <div class="cardhead"><div><span class="eyebrow">DASHBOARDS</span><h3>Dashboard defaults</h3></div><span class="pill ok">ACTIVE</span></div>
      <label class="field"><span>Default dashboard</span><select v-model="draft.dashboard.default_dashboard_id"><option :value="null">Automatic</option><optgroup v-if="dashboards.some(x=>x.mine)" label="My Dashboards"><option v-for="item in dashboards.filter(x=>x.mine)" :key="item.id" :value="item.id">{{ item.name }} · {{ item.visibility }}</option></optgroup><optgroup v-if="dashboards.some(x=>x.visibility==='shared'&&!x.mine)" label="Shared Dashboards"><option v-for="item in dashboards.filter(x=>x.visibility==='shared'&&!x.mine)" :key="item.id" :value="item.id">{{ item.name }} · {{ item.owner.display_name }}</option></optgroup></select></label>
      <label class="preference-toggle"><input v-model="draft.dashboard.restore_last_dashboard" type="checkbox"><span><b>Return to my last dashboard</b><small>When enabled, the most recently opened visible dashboard takes priority over your default dashboard.</small></span></label>
    </section>

    <section class="card preference-card">
      <div class="cardhead"><div><span class="eyebrow">SYNC</span><h3>Account storage</h3></div><span class="pill ok">SERVER-SIDE</span></div>
      <dl class="kvlist module-kv"><dt>User</dt><dd class="mono">{{ preferenceState.username || '—' }}</dd><dt>Last saved</dt><dd class="mono">{{ preferenceState.updatedAt || 'not yet saved' }}</dd><dt>Browser cache</dt><dd>early startup fallback only</dd></dl>
      <p class="muted smalltext">The server-side profile is authoritative after sign-in. Browser storage is retained only so theme/navigation can render cleanly during startup and for migration from older Tec-Tac releases.</p>
    </section>
  </div>
</template>
