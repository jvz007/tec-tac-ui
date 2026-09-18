<script setup>
import { inject } from 'vue'
const state = inject('tecTacState')
</script>

<template>
  <section>
    <div class="phead"><div><span class="eyebrow">RUNTIME DISCOVERY</span><h1>UI modules</h1><p>Trusted UI modules are loaded at runtime from /tec-tac/modules/. Installing or updating a module does not require rebuilding the core Vue shell.</p></div></div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Module</th><th>Version</th><th>Navigation</th><th>Permissions</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="m in state.context.modules" :key="m.id">
            <td><b>{{ m.id }}</b><span class="sub mono">{{ m.entry }}</span></td>
            <td class="mono">{{ m.version }}</td>
            <td>{{ m.navigation.section }} / {{ m.navigation.label }}</td>
            <td><span v-if="!m.permissions.length" class="muted">none</span><span v-for="p in m.permissions" :key="p" class="codechip">{{ p }}</span></td>
            <td><span class="pill" :class="m.allowed === false ? 'warn' : 'ok'">{{ m.allowed === false ? 'denied' : 'available' }}</span></td>
          </tr>
          <tr v-if="!state.context.modules?.length"><td colspan="5" class="empty">No extension exposes a Tec-Tac UI module.</td></tr>
        </tbody>
      </table>
    </div>
    <div v-if="state.moduleLoad.failed.length" class="callout danger-panel"><b>Module load failures</b><div v-for="f in state.moduleLoad.failed" :key="f.id" class="mono">{{ f.id }} — {{ f.message }}</div></div>
  </section>
</template>
