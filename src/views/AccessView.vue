<script setup>
import { inject } from 'vue'
const state = inject('tecTacState')
</script>

<template>
  <section>
    <div class="phead"><div><span class="eyebrow">EFFECTIVE ACCESS</span><h1>Session & permissions</h1><p>The frontend uses these grants only to shape the UI. Extension APIs remain responsible for enforcing authorization.</p></div></div>
    <div class="grid g2">
      <article class="card"><div class="cardhead"><h3>Tactical identity</h3><span class="pill ok">authenticated</span></div><dl class="kvlist"><dt>Username</dt><dd class="mono">{{ state.context.user?.username }}</dd><dt>Display name</dt><dd>{{ state.context.user?.display_name }}</dd><dt>Role</dt><dd>{{ state.context.user?.role || '—' }}</dd><dt>Role ID</dt><dd class="mono">{{ state.context.user?.role_id ?? '—' }}</dd><dt>Superuser</dt><dd>{{ state.contextSource === 'backend' ? (state.context.user?.superuser ? 'yes' : 'no') : 'not resolved by shell' }}</dd><dt>Context source</dt><dd class="mono">{{ state.contextSource }}</dd></dl></article>
      <article class="card"><div class="cardhead"><h3>Tec-Tac grants</h3><span class="pill">{{ state.context.permissions?.length || 0 }}</span></div><div class="list"><div v-for="p in state.context.permissions" :key="p" class="listrow"><span class="dot ok"></span><span class="mono">{{ p }}</span></div><div v-if="!state.context.permissions?.length" class="empty">No permission list supplied to the shell. Backend API authorization still applies.</div></div></article>
    </div>
  </section>
</template>
