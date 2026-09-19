<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LoginPanel from './components/LoginPanel.vue'
import UnsavedChangesDialog from './components/UnsavedChangesDialog.vue'
import { logoutTacticalSession } from './api'
import { state, loadContext } from './state'
import { requestLeave } from './unsaved'
import { preferenceState, updateUserPreferences } from './preferences'

const route = useRoute()
const router = useRouter()
const dynamicNav = inject('tecTacNavigation', [])
const theme = computed({
  get: () => preferenceState.preferences.appearance.theme,
  set: (value) => updateUserPreferences((next) => { next.appearance.theme = value; return next }),
})
const query = ref('')
const signingOut = ref(false)
const railCollapsed = computed({
  get: () => preferenceState.preferences.navigation.rail_collapsed,
  set: (value) => updateUserPreferences((next) => { next.navigation.rail_collapsed = Boolean(value); return next }),
})
const collapsedSections = computed({
  get: () => preferenceState.preferences.navigation.collapsed_sections,
  set: (value) => updateUserPreferences((next) => { next.navigation.collapsed_sections = value || {}; return next }),
})
const navPreferences = computed({
  get: () => ({ order: preferenceState.preferences.navigation.order, favorites: preferenceState.preferences.navigation.favorites }),
  set: (value) => updateUserPreferences((next) => {
    next.navigation.order = value?.order || {}
    next.navigation.favorites = Array.isArray(value?.favorites) ? value.favorites : []
    return next
  }),
})
const draggedNav = ref(null)
const navContextMenu = ref(null)
const uiVersion = __TEC_TAC_UI_VERSION__
const newWindowLaunch = ref(new URLSearchParams(window.location.search).get('tec_tac_launch') === 'new-window')
if (newWindowLaunch.value) {
  const cleanUrl = new URL(window.location.href)
  cleanUrl.searchParams.delete('tec_tac_launch')
  window.history.replaceState(window.history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)
}
const publicRoute = computed(() => route.meta?.public === true || route.path.startsWith('/public/'))
const coreNav = computed(() => {
  const capabilities = state.context.capabilities || {}
  return [
    { label: 'Dashboards', icon: '⌂', to: '/dashboards', section: 'Workspace', visible: true },
    { label: 'Schedules', icon: '◷', to: '/schedules', section: 'Operations', visible: capabilities.manage_schedules !== false },
    { label: 'Modules', icon: '▦', to: '/modules', section: 'Administration', visible: true },
    { label: 'Access', icon: '⛨', to: '/access', section: 'Administration', visible: capabilities.list_accounts !== false || capabilities.list_roles !== false },
    { label: 'System Updates', icon: '⇧', to: '/system/updates', section: 'Administration', visible: capabilities.manage_modules === true || state.context.user?.superuser === true },
    { label: 'Public Contracts', icon: '⌘', to: '/contracts', section: 'Administration', visible: capabilities.manage_modules === true || state.context.user?.superuser === true },
  ]
})

const visibleNav = computed(() => [...coreNav.value, ...dynamicNav].filter((item) => item.visible !== false && item?.to && item?.label))
const allNav = computed(() => visibleNav.value.filter((item) => {
  if (!query.value.trim()) return true
  return item.label.toLowerCase().includes(query.value.toLowerCase())
}))

function orderedItems(section, items) {
  const saved = Array.isArray(navPreferences.value.order?.[section]) ? navPreferences.value.order[section] : []
  const position = new Map(saved.map((to, index) => [to, index]))
  return [...items].sort((a, b) => {
    const ai = position.has(a.to) ? position.get(a.to) : Number.MAX_SAFE_INTEGER
    const bi = position.has(b.to) ? position.get(b.to) : Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER
    const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return 0
  })
}

const sectionOrder = ['Favorites', 'Workspace', 'Operations', 'Extensions', 'Administration', 'Configuration']
const navGroups = computed(() => {
  const grouped = new Map()
  for (const item of allNav.value) {
    const section = item.section || 'Extensions'
    if (!grouped.has(section)) grouped.set(section, [])
    grouped.get(section).push(item)
  }

  if (navPreferences.value.favorites.length) {
    const byRoute = new Map(allNav.value.map((item) => [item.to, item]))
    const favorites = navPreferences.value.favorites.map((to) => byRoute.get(to)).filter(Boolean)
    if (favorites.length) grouped.set('Favorites', favorites)
  }

  return [...grouped.entries()]
    .map(([section, items]) => ({ section, items: orderedItems(section, items) }))
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

const currentTitle = computed(() => route.meta.title || visibleNav.value.find((item) => item.to === route.path)?.label || 'Tec-Tac')

const accountStatus = computed(() => {
  if (state.authStatus === 'verifying') return 'VERIFYING'
  if (state.authStatus === 'verified') return 'VERIFIED'
  if (state.authStatus === 'required') return 'AUTH REQUIRED'
  if (state.authStatus === 'error') return 'AUTH ERROR'
  return 'STARTING'
})

function applyTheme(value) {
  document.documentElement.dataset.theme = value
}
watch(theme, applyTheme, { immediate: true })

function toggleRail() { railCollapsed.value = !railCollapsed.value }
function sectionCollapsed(section) { return collapsedSections.value?.[section] === true }
function toggleSection(section) {
  collapsedSections.value = { ...collapsedSections.value, [section]: !sectionCollapsed(section) }
}
function isFavorite(item) { return navPreferences.value.favorites.includes(item.to) }
function toggleFavorite(item) {
  const favorites = navPreferences.value.favorites.filter((to) => to !== item.to)
  if (!isFavorite(item)) favorites.push(item.to)
  navPreferences.value = { ...navPreferences.value, favorites }
  closeNavContextMenu()
}
function navDragStart(section, item) {
  if (query.value.trim()) return
  draggedNav.value = { section, to: item.to }
}
function navDragEnd() { draggedNav.value = null }
function navDrop(section, target) {
  const source = draggedNav.value
  draggedNav.value = null
  if (!source || source.section !== section || source.to === target.to || query.value.trim()) return
  const group = navGroups.value.find((entry) => entry.section === section)
  if (!group) return
  const order = group.items.map((item) => item.to)
  const from = order.indexOf(source.to)
  const to = order.indexOf(target.to)
  if (from < 0 || to < 0) return
  order.splice(from, 1)
  order.splice(to, 0, source.to)
  navPreferences.value = { ...navPreferences.value, order: { ...navPreferences.value.order, [section]: order } }
}
function openNavContextMenu(event, item, section) {
  const menuWidth = 210
  const menuHeight = 92
  navContextMenu.value = {
    item,
    section,
    x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
    y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
  }
}
function closeNavContextMenu() { navContextMenu.value = null }
function openInNewTab(item) {
  const resolved = router.resolve(item.to)
  const base = `${window.location.origin}/tec-tac/`
  const target = new URL(resolved.href, base)
  target.searchParams.set('tec_tac_launch', 'new-window')
  window.open(target.href, '_blank', 'noopener,noreferrer')
  closeNavContextMenu()
}
function handleGlobalKey(event) { if (event.key === 'Escape') closeNavContextMenu() }

async function retry() {
  await loadContext()
  if (state.status === 'ready') window.location.reload()
}
function navigate(to) { closeNavContextMenu(); requestLeave(() => router.push(to)) }
function backToTactical() { requestLeave(() => { window.location.href = '/' }) }
async function doSignOut() {
  if (signingOut.value) return
  signingOut.value = true
  try { await logoutTacticalSession() } finally { window.location.reload() }
}
function signOut() { requestLeave(doSignOut) }

onMounted(() => window.addEventListener('keydown', handleGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', handleGlobalKey))
</script>

<template>
  <div class="app-shell" :class="{ 'public-shell': publicRoute, 'rail-collapsed': railCollapsed && !publicRoute }" @click="closeNavContextMenu">
    <header class="brand">
      <div class="mark" aria-hidden="true"></div>
      <div class="brand-copy"><b>TEC-TAC</b><span>TACTICAL EXTENSION CONSOLE</span></div>
      <button v-if="!publicRoute" class="rail-toggle" type="button" :title="railCollapsed ? 'Expand navigation' : 'Collapse navigation'" :aria-label="railCollapsed ? 'Expand navigation' : 'Collapse navigation'" :aria-expanded="!railCollapsed" @click.stop="toggleRail">{{ railCollapsed ? '»' : '«' }}</button>
    </header>

    <header class="topbar">
      <div class="crumbs"><span>Tec-Tac</span><span class="sep">/</span><b>{{ publicRoute ? currentTitle : (state.status === 'unauthenticated' ? 'Sign in' : currentTitle) }}</b></div>
      <div class="spacer"></div>
      <select v-model="theme" class="theme-select" aria-label="Theme"><option value="dark">Dark</option><option value="light">Light</option><option value="high-contrast">High contrast</option></select>
      <button v-if="!publicRoute" class="btn ghost sm" @click="backToTactical">↗ Tactical</button>
      <button v-else-if="state.status !== 'ready'" class="btn ghost sm" @click="navigate('/')">Sign in</button>
      <div v-if="!publicRoute" class="who">
        <div class="av">{{ initials }}</div>
        <div class="n"><b>{{ state.context.user?.display_name || state.context.user?.username || 'No session' }}</b><span :class="{ 'status-ok': state.authStatus === 'verified', 'status-warn': state.authStatus === 'verifying', 'status-danger': state.authStatus === 'required' || state.authStatus === 'error' }">{{ accountStatus }}</span></div>
        <button v-if="state.status === 'ready'" class="iconbtn" title="User preferences" aria-label="User preferences" @click="navigate('/preferences')">⚙</button>
        <button v-if="state.status === 'ready'" class="iconbtn" title="Sign out" aria-label="Sign out" :disabled="signingOut" @click="signOut">⏻</button>
      </div>
    </header>

    <aside v-if="!publicRoute" class="rail">
      <template v-if="state.status === 'ready'">
        <div class="rail-search-wrap" :class="{ collapsed: railCollapsed }">
          <label v-if="!railCollapsed" class="rail-search"><span class="sr-only">Search navigation</span><span aria-hidden="true">⌕</span><input v-model="query" placeholder="Search modules…" /></label>
          <button v-else class="rail-search-button" type="button" title="Expand navigation to search" aria-label="Expand navigation to search" @click.stop="railCollapsed=false">⌕</button>
        </div>
        <template v-for="group in navGroups" :key="group.section">
          <button v-if="!railCollapsed" class="grp grp-btn label" type="button" :aria-expanded="!sectionCollapsed(group.section)" :title="`${sectionCollapsed(group.section) ? 'Expand' : 'Collapse'} ${group.section}`" @click.stop="toggleSection(group.section)">
            <span>{{ group.section }}</span><span class="grp-chevron" aria-hidden="true">{{ sectionCollapsed(group.section) ? '›' : '⌄' }}</span>
          </button>
          <div v-else class="rail-separator" aria-hidden="true"></div>
          <template v-if="railCollapsed || query.trim() || !sectionCollapsed(group.section)">
            <button
              v-for="item in group.items"
              :key="`${group.section}:${item.to}`"
              class="navitem"
              :class="{ active: route.path === item.to || (item.to === '/dashboards' && route.path.startsWith('/dashboards/')), 'nav-dragging': draggedNav?.section === group.section && draggedNav?.to === item.to }"
              :title="railCollapsed ? item.label : undefined"
              :aria-label="railCollapsed ? item.label : undefined"
              :draggable="!query.trim()"
              @click.stop="navigate(item.to)"
              @contextmenu.prevent.stop="openNavContextMenu($event, item, group.section)"
              @dragstart="navDragStart(group.section, item)"
              @dragend="navDragEnd"
              @dragover.prevent
              @drop.prevent="navDrop(group.section, item)"
            ><span class="ico">{{ item.icon }}</span><span class="nav-label">{{ item.label }}</span><span v-if="item.badge" class="count">{{ item.badge }}</span><span v-if="group.section === 'Favorites'" class="favorite-star" aria-hidden="true">★</span></button>
          </template>
        </template>
      </template>
      <div v-else class="grp label">Session gate</div>
      <div class="foot"><div class="kv"><span>UI</span><b>{{ uiVersion }}</b></div><div class="kv"><span>Context</span><b>{{ state.contextSource }}</b></div><div class="kv"><span>Auth</span><b :class="state.authStatus === 'verified' ? 'oktxt' : (state.authStatus === 'verifying' ? 'warntxt' : 'dangertext')">{{ accountStatus }}</b></div></div>
    </aside>

    <div v-if="navContextMenu" class="nav-context-menu" :style="{ left: `${navContextMenu.x}px`, top: `${navContextMenu.y}px` }" @click.stop>
      <button type="button" @click="openInNewTab(navContextMenu.item)"><span>↗</span><span>Open in new tab</span></button>
      <button type="button" @click="toggleFavorite(navContextMenu.item)"><span>{{ isFavorite(navContextMenu.item) ? '☆' : '★' }}</span><span>{{ isFavorite(navContextMenu.item) ? 'Remove from Favorites' : 'Add to Favorites' }}</span></button>
    </div>

    <main class="main">
      <router-view v-if="publicRoute" />
      <div v-else-if="state.status === 'loading'" class="state-panel verify-panel">
        <template v-if="newWindowLaunch">
          <span class="eyebrow">WINDOW STARTUP</span><h2>Opening new window…</h2><p>Tec-Tac is securely preparing the requested page and loading its operational modules.</p><div class="verify-line"><span class="spinner" aria-hidden="true"></span><span class="mono">Opening requested Tec-Tac page…</span></div>
        </template>
        <template v-else>
          <span class="eyebrow">SESSION VERIFICATION</span><h2>Verifying Tactical session</h2><p>Tec-Tac is validating the existing Tactical browser token before loading operational modules.</p><div class="verify-line"><span class="spinner" aria-hidden="true"></span><span class="mono">Authorization: Token &lt;browser session&gt;</span></div>
        </template>
      </div>
      <LoginPanel v-else-if="state.status === 'unauthenticated'" />
      <div v-else-if="state.status === 'failed'" class="state-panel danger-panel"><span class="eyebrow">SESSION OR BACKEND CHECK FAILED</span><h2>Tec-Tac could not complete startup</h2><p class="mono">{{ state.error?.message }}</p><div class="row"><button class="btn" @click="retry">Retry</button><button class="btn ghost" @click="backToTactical">Open Tactical</button></div></div>
      <router-view v-else-if="state.status === 'ready'" />
    </main>
    <UnsavedChangesDialog />
  </div>
</template>
