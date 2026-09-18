<script setup>
import { inject, computed } from 'vue'
const state = inject('tecTacState')
const allowed = computed(() => (state.context.modules || []).filter((m) => m.allowed))
const blocked = computed(() => (state.context.modules || []).filter((m) => m.allowed === false))
</script>

<template>
  <section>
    <div class="phead"><div><span class="eyebrow">TEC-TAC BETA</span><h1>Operational overview</h1><p>Independent Vue shell under Tactical's frontend. It reuses Tactical browser authentication and keeps authorization authoritative in backend APIs.</p></div></div>
    <div class="grid g4 mb">
      <article class="tile"><div class="lbl">Session</div><div class="big">{{ state.status === 'ready' ? 'ACTIVE' : state.status.toUpperCase() }}</div><div class="brk"><span>{{ state.context.user?.username || '—' }}</span></div></article>
      <article class="tile"><div class="lbl">Role</div><div class="big compact">{{ state.context.user?.role || '—' }}</div><div class="brk"><span>ID {{ state.context.user?.role_id ?? '—' }}</span></div></article>
      <article class="tile"><div class="lbl">Allowed modules</div><div class="big">{{ allowed.length }}</div><div class="brk"><span>{{ state.context.modules?.length || 0 }} discovered</span></div></article>
      <article class="tile"><div class="lbl">Permissions</div><div class="big">{{ state.context.permissions?.length || 0 }}</div><div class="brk"><span>{{ state.context.user?.superuser ? 'superuser' : 'effective grants' }}</span></div></article>
    </div>
    <div class="grid g2">
      <article class="card"><div class="cardhead"><div><span class="eyebrow">MODULE RUNTIME</span><h3>Loaded modules</h3></div><span class="pill ok">{{ state.moduleLoad.loaded.length }} loaded</span></div><div class="list"><div v-for="id in state.moduleLoad.loaded" :key="id" class="listrow"><span class="dot ok"></span><b class="mono">{{ id }}</b><span>registered at runtime</span></div><div v-if="!state.moduleLoad.loaded.length" class="empty">No dynamic module loaded.</div></div></article>
      <article class="card"><div class="cardhead"><div><span class="eyebrow">ACCESS</span><h3>Unavailable modules</h3></div><span class="pill" :class="blocked.length ? 'warn' : 'ok'">{{ blocked.length }}</span></div><div class="list"><div v-for="m in blocked" :key="m.id" class="listrow"><span class="dot warn"></span><b>{{ m.navigation.label }}</b><span class="mono">permission gated</span></div><div v-if="!blocked.length" class="empty">No discovered module is currently blocked.</div></div></article>
    </div>
  </section>
</template>
