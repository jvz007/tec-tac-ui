<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { state, loadContext } from './state'

const route = useRoute()
const router = useRouter()
const dynamicNav = inject('tecTacNavigation', [])
const theme = ref(localStorage.getItem('tec_tac_theme') || 'dark')
const query = ref('')

const coreNav = [
  { label: 'Overview', icon: '⌂', to: '/' },
  { label: 'Modules', icon: '▦', to: '/modules' },
  { label: 'Access', icon: '⛨', to: '/access' },
]

const allNav = computed(() => [...coreNav, ...dynamicNav].filter((item) => {
  if (!query.value.trim()) return true
  return item.label.toLowerCase().includes(query.value.toLowerCase())
}))

const initials = computed(() => {
  const value = state.context.user?.display_name || state.context.user?.username || 'TT'
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'TT'
})

const currentTitle = computed(() => route.meta.title || allNav.value.find((item) => item.to === route.path)?.label || 'Tec-Tac')
const accountStatus = computed(() => {
  if (state.authStatus === 'verifying') return 'VERIFYING'
  if (state.authStatus === 'verified') return 'VERIFIED'
  if (state.authStatus === 'required') return 'AUTH REQUIRED'
  return 'AUTH ERROR'
})

function applyTheme(value) {
  document.documentElement.dataset.theme = value
  localStorage.setItem('tec_tac_theme', value)
}

watch(theme, applyTheme, { immediate: true })

async function retry() {
  await loadContext()
  if (state.status === 'ready' && state.authStatus === 'verified') window.location.reload()
}

function backToTactical() {
  window.location.href = '/'
}
</script>

<template>
  <div v-if="state.authStatus !== 'verified'" class="auth-gate">
    <div class="auth-brand">
      <div class="mark" aria-hidden="true"></div>
      <div class="brand-copy"><b>TEC-TAC</b><span>TACTICAL EXTENSION CONSOLE</span></div>
    </div>

    <section v-if="state.authStatus === 'verifying'" class="state-panel auth-panel">
      <span class="eyebrow">TACTICAL AUTHENTICATION</span>
      <h2>Verifying Tactical session…</h2>
      <p>Tec-Tac is validating the browser's existing Tactical access token before loading any operational UI.</p>
      <div class="verify-line"><span class="verify-spinner" aria-hidden="true"></span><span class="mono">AUTH VERIFYING</span></div>
    </section>

    <section v-else-if="state.authStatus === 'required'" class="state-panel danger-panel auth-panel">
      <span class="eyebrow">AUTHENTICATION REQUIRED</span>
      <h2>Tactical session not available</h2>
      <p>Sign in to Tactical in this browser. Tec-Tac does not implement a separate login or accept an unverified browser identity.</p>
      <div class="row"><button class="btn primary" @click="backToTactical">Open Tactical</button><button class="btn" @click="retry">Retry session</button></div>
    </section>

    <section v-else class="state-panel danger-panel auth-panel">
      <span class="eyebrow">AUTHENTICATION CHECK FAILED</span>
      <h2>Tactical session could not be verified</h2>
      <p class="mono">{{ state.error?.message || 'Unknown authentication verification error.' }}</p>
      <div class="row"><button class="btn primary" @click="retry">Retry</button><button class="btn" @click="backToTactical">Open Tactical</button></div>
    </section>
  </div>

  <div v-else class="app-shell">
    <header class="brand">
      <div class="mark" aria-hidden="true"></div>
      <div class="brand-copy">
        <b>TEC-TAC</b>
        <span>TACTICAL EXTENSION CONSOLE</span>
      </div>
    </header>

    <header class="topbar">
      <div class="crumbs"><span>Tactical</span><span class="sep">/</span><b>{{ currentTitle }}</b></div>
      <div class="spacer"></div>
      <label class="search"><span class="sr-only">Search navigation</span><input v-model="query" placeholder="Search modules…" /></label>
      <select v-model="theme" class="theme-select" aria-label="Theme">
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="high-contrast">High contrast</option>
      </select>
      <button class="btn ghost sm" @click="backToTactical">↗ Tactical</button>
      <div class="who">
        <div class="av">{{ initials }}</div>
        <div class="n"><b>{{ state.context.user?.display_name || state.context.user?.username || 'Tactical user' }}</b><span>{{ accountStatus }}</span></div>
      </div>
    </header>

    <aside class="rail">
      <div class="grp label">Workspace</div>
      <button v-for="item in allNav" :key="item.to" class="navitem" :class="{ active: route.path === item.to }" @click="router.push(item.to)">
        <span class="ico">{{ item.icon }}</span><span>{{ item.label }}</span><span v-if="item.badge" class="count">{{ item.badge }}</span>
      </button>
      <div class="foot">
        <div class="kv"><span>UI</span><b>0.1.1</b></div>
        <div class="kv"><span>Auth</span><b class="oktxt">verified</b></div>
        <div class="kv"><span>Context</span><b>{{ state.contextSource }}</b></div>
        <div class="kv"><span>API</span><b :class="state.status === 'ready' ? 'oktxt' : 'warntxt'">{{ state.status }}</b></div>
      </div>
    </aside>

    <main class="main">
      <div v-if="state.status === 'denied'" class="state-panel danger-panel">
        <span class="eyebrow">ACCESS DENIED</span>
        <h2>Tec-Tac context is not available to this Tactical account</h2>
        <p>The Tactical identity is verified, but the Tec-Tac backend denied access to its UI context.</p>
        <button class="btn" @click="backToTactical">Back to Tactical</button>
      </div>
      <div v-else-if="state.status === 'failed'" class="state-panel danger-panel">
        <span class="eyebrow">BACKEND UNAVAILABLE</span>
        <h2>Tec-Tac context could not be loaded</h2>
        <p class="mono">{{ state.error?.message }}</p>
        <button class="btn" @click="retry">Retry</button>
      </div>
      <router-view v-else-if="state.status === 'ready'" />
      <div v-else class="state-panel"><span class="eyebrow">LOADING</span><h2>Preparing Tec-Tac…</h2></div>
    </main>
  </div>
</template>
