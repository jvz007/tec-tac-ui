<script setup>
import { computed, inject } from 'vue'
import ResourceContextMenu from './ResourceContextMenu.vue'

// 0.12.112: draws the one module row menu (docs/module-row-menu.md). The service owns the state and what a choice does; the
// menu itself is the shell's own ResourceContextMenu (placement, keys, outside press, scroll, resize, blur and route change),
// put in layer 1150. Text is shown as text only.
const rowMenu = inject('tecTacRowMenu', null)
const current = computed(() => rowMenu?.state?.current || null)
</script>

<template>
  <ResourceContextMenu
    v-if="current"
    :key="current.token"
    :x="current.x"
    :y="current.y"
    :entries="current.entries"
    :opener="current.opener"
    :label="current.label"
    layer="module"
    @close="rowMenu.close(current.token)"
    @select="(entry) => rowMenu.choose(current.token, entry.id)"
  />
</template>
