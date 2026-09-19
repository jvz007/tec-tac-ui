<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LoginPanel from './components/LoginPanel.vue'
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue'
import { logoutTacticalSession } from './api'
import { state, loadContext } from './state'
import { requestLeave } from './unsaved'

const route = useRoute()
const router = useRouter()
const dynamicNav = inject('tecTacNavigation', [])
const theme = ref(localStorage.getItem('tec_tac_theme') || 'dark')
const query = ref('')
const signingOut = ref(false)
const railCollapsed = ref(localStorage.getItem('tec_tac_nav_rail_collapsed') === '1')
let savedSectionState = {}
try { savedSectionState = JSON.parse(localStorage.getItem('tec_tac_nav_sections') || '{}') || {} } catch { savedSectionState = {} }
const collapsedSections = ref(savedSectionState)
const uiVersion = __TEC_TAC_UI_VERSION__
const publicRoute = computed(() => route.meta?.public === true || route.path.startsWith('/public/'))

const coreNav = computed(() => {
  const capabilities = state.context.capabilities || {}
  return [
    { label: 'Overview', icon: '⌂', to: '/', section: 'Workspace', visible: true },
    { label: 'Schedules', icon: '◷', to: '/schedules', section: 'Operations', visible: capabilities.manage_schedules !== false },
    { label: 'Modules', icon: '▦', to: '/modules', section: 'Administration', visible: true },
    { label: 'Access', icon: '⛨', to: '/access', section: 'Administration', visible: capabilities.list_accounts !== false || capabilities.list_roles !== false },
    { label: 'System Updates', icon: '⇧', to: '/system/updates', section: 'Administration', visible: capabilities.manage_modules === true || state.context.user?.superuser === true },
    { label: 'Public Contracts', icon: '⌘', to: '/contracts', section: 'Administration', visible: capabilities.manage_modules === true || state.context.user?.superuser === true },
  ]
})

const allNav = computed(() => [...coreNav.value, ...dynamicNav].filter((item) => {
  if (item.visible === false) return false
  if (!query.value.trim()) return true
  return item.label.toLowerCase().includes(query.value.toLowerCase())
}))

const sectionOrder = ['Workspace', 'Operations', 'Extensions', 'Administration', 'Configuration']
const navGroups = computed(() => {
  const grouped = new Map()
  for (const item of allNav.value) {
    const section = item.section || 'Extensions'
    if (!grouped.has(section)) grouped.set(section, [])
    grouped.get(section).push(item)
  }
  return [...grouped.entries()]
    .map(([section, items]) => ({ section, items }))
    .sort((a, b) => {
      const ai = sectionOrder.indexOf(a.section)
      const bi = sectionOrder.indexOf(b.section)
      if (ai === -1 && bi === -1) return a.section.localeCompare(b.section)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
})

const initials = computed(() => {
  const value = state.context.user?.display_name || state.context.user?.username || 'TT'
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'TT'
})

const currentTitle = computed(() => route.meta.title || allNav.value.find((item) => item.to === route.path)?.label || 'Tec-Tac')

const accountStatus = computed(() => {
  if (state.authStatus === 'verifying') return 'VERIFYING'
  if (state.authStatus === 'verified') return 'VERIFIED'
  if (state.authStatus === 'required') return 'AUTH REQUIRED'
  if (state.authStatus === 'error') return 'AUTH ERROR'
  return 'STARTING'
})

function applyTheme(value) {
  document.documentElement.dataset.theme = value
  localStorage.setItem('tec_tac_theme', value)
}
watch(theme, applyTheme, { immediate: true })
watch(railCollapsed, (value) => localStorage.setItem('tec_tac_nav_rail_collapsed', value ? '1' : '0'))
watch(collapsedSections, (value) => localStorage.setItem('tec_tac_nav_sections', JSON.stringify(value)), { deep: true })

function toggleRail() { railCollapsed.value = !railCollapsed.value }
function sectionCollapsed(section) { return collapsedSections.value?.[section] === true }
function toggleSection(section) {
  collapsedSections.value = { ...collapsedSections.value, [section]: !sectionCollapsed(section) }
}

async function retry() {
  await loadContext()
  if (state.status === 'ready') window.location.reload()
}
function navigate(to) { requestLeave(() => router.push(to)) }
function backToTactical() { requestLeave(() => { window.location.href = '/' }) }
async function doSignOut() {
  if (signingOut.value) return
  signingOut.value = true
  try { await logoutTacticalSession() } finally { window.location.reload() }
}
function signOut() { requestLeave(doSignOut) }
</script>

<template>
  <div class="app-shell" :class="{ 'public-shell': publicRoute, 'rail-collapsed': railCollapsed && !publicRoute }">
    <header class="brand">
      <div class="mark" aria-hidden="true"></div>
      <div class="brand-copy"><b>TEC-TAC</b><span>TACTICAL EXTENSION CONSOLE</span></div>
      <button v-if="!publicRoute" class="rail-toggle" type="button" :title="railCollapsed ? 'Expand navigation' : 'Collapse navigation'" :aria-label="railCollapsed ? 'Expand navigation' : 'Collapse navigation'" :aria-expanded="!railCollapsed" @click="toggleRail">{{ railCollapsed ? '»' : '«' }}</button>
    </header>

    <header class="topbar">
      <div class="crumbs"><span>Tec-Tac</span><span class="sep">/</span><b>{{ publicRoute ? currentTitle : (state.status === 'unauthenticated' ? 'Sign in' : currentTitle) }}</b></div>
      <div class="spacer"></div>
      <label v-if="state.status === 'ready' && !publicRoute" class="search"><span class="sr-only">Search navigation</span><input v-model="query" placeholder="Search modules…" /></label>
      <select v-model="theme" class="theme-select" aria-label="Theme"><option value="dark">Dark</option><option value="light">Light</option><option value="high-contrast">High contrast</option></select>
      <button v-if="!publicRoute" class="btn ghost sm" @click="backToTactical">↗ Tactical</button>
      <button v-else-if="state.status !== 'ready'" class="btn ghost sm" @click="navigate('/')">Sign in</button>
      <div v-if="!publicRoute" class="who">
        <div class="av">{{ initials }}</div>
        <div class="n"><b>{{ state.context.user?.display_name || state.context.user?.username || 'No session' }}</b><span :class="{ 'status-ok': state.authStatus === 'verified', 'status-warn': state.authStatus === 'verifying', 'status-danger': state.authStatus === 'required' || state.authStatus === 'error' }">{{ accountStatus }}</span></div>
        <button v-if="state.status === 'ready'" class="iconbtn" title="Sign out" aria-label="Sign out" :disabled="signingOut" @click="signOut">⏻</button>
      </div>
    </header>

    <aside v-if="!publicRoute" class="rail">
      <template v-if="state.status === 'ready'">
        <template v-for="group in navGroups" :key="group.section">
          <button v-if="!railCollapsed" class="grp grp-btn label" type="button" :aria-expanded="!sectionCollapsed(group.section)" :title="`${sectionCollapsed(group.section) ? 'Expand' : 'Collapse'} ${group.section}`" @click="toggleSection(group.section)">
            <span>{{ group.section }}</span><span class="grp-chevron" aria-hidden="true">{{ sectionCollapsed(group.section) ? '›' : '⌄' }}</span>
          </button>
          <div v-else class="rail-separator" aria-hidden="true"></div>
          <template v-if="railCollapsed || query.trim() || !sectionCollapsed(group.section)">
            <button v-for="item in group.items" :key="item.to" class="navitem" :class="{ active: route.path === item.to }" :title="railCollapsed ? item.label : undefined" :aria-label="railCollapsed ? item.label : undefined" @click="navigate(item.to)"><span class="ico">{{ item.icon }}</span><span class="nav-label">{{ item.label }}</span><span v-if="item.badge" class="count">{{ item.badge }}</span></button>
          </template>
        </template>
      </template>
      <div v-else class="grp label">Session gate</div>
      <div class="foot"><div class="kv"><span>UI</span><b>{{ uiVersion }}</b></div><div class="kv"><span>Context</span><b>{{ state.contextSource }}</b></div><div class="kv"><span>Auth</span><b :class="state.authStatus === 'verified' ? 'oktxt' : (state.authStatus === 'verifying' ? 'warntxt' : 'dangertext')">{{ accountStatus }}</b></div></div>
    </aside>

    <main class="main">
      <router-view v-if="publicRoute" />
      <div v-else-if="state.status === 'loading'" class="state-panel verify-panel"><span class="eyebrow">SESSION VERIFICATION</span><h2>Verifying Tactical session</h2><p>Tec-Tac is validating the existing Tactical browser token before loading operational modules.</p><div class="verify-line"><span class="spinner" aria-hidden="true"></span><span class="mono">Authorization: Token &lt;browser session&gt;</span></div></div>
      <LoginPanel v-else-if="state.status === 'unauthenticated'" />
      <div v-else-if="state.status === 'failed'" class="state-panel danger-panel"><span class="eyebrow">SESSION OR BACKEND CHECK FAILED</span><h2>Tec-Tac could not complete startup</h2><p class="mono">{{ state.error?.message }}</p><div class="row"><button class="btn" @click="retry">Retry</button><button class="btn ghost" @click="backToTactical">Open Tactical</button></div></div>
      <router-view v-else-if="state.status === 'ready'" />
    </main>
    <UnsavedChangesDialog />
  </div>
</template>
