<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { clampMenuPosition, nextMenuIndex } from '../resource-context-menu'

// The right-click menu on a client or site row (0.12.99). The page decides what is in it and what each entry does; this
// component places the menu, handles the keys and closes it. It opens at the pointer and is moved inside the viewport.
const props = defineProps({
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  entries: { type: Array, required: true },
  // The element that had focus when the menu opened. Focus goes back to it when the menu closes.
  opener: { default: null },
  label: { type: String, default: 'Actions' },
  // 0.12.112: 'module' puts the menu in the module row-menu layer (1150), above a module dialog. The default is unchanged.
  layer: { type: String, default: '' },
})
const emit = defineEmits(['close', 'select'])

const root = ref(null)
const position = ref({ x: props.x, y: props.y })
const items = computed(() => props.entries.filter((entry) => !entry.divider))
let closed = false

function itemButtons() {
  return root.value ? [...root.value.querySelectorAll('[role="menuitem"]')] : []
}
function place() {
  const el = root.value
  if (!el) return
  const box = el.getBoundingClientRect()
  position.value = clampMenuPosition({ x: props.x, y: props.y }, { width: box.width, height: box.height }, { width: window.innerWidth, height: window.innerHeight })
}
function close() {
  if (closed) return
  closed = true
  emit('close')
}
function choose(entry) {
  if (entry.disabled) return
  closed = true
  emit('select', entry)
}
function onKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
  if (event.key === 'Tab') { close(); return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = itemButtons()
  const current = buttons.indexOf(document.activeElement)
  buttons[nextMenuIndex(current, event.key, buttons.length)]?.focus()
}
// Outside click, another right-click, scroll and resize close the menu. Capture phase, so a right-click on another row
// closes this menu first and that row then opens its own.
function onPointerOutside(event) {
  if (root.value && !root.value.contains(event.target)) close()
}
function onScroll(event) {
  if (root.value && root.value.contains(event.target)) return
  close()
}
const route = useRoute()
watch(() => route?.fullPath, close)

onMounted(async () => {
  document.addEventListener('mousedown', onPointerOutside, true)
  document.addEventListener('contextmenu', onPointerOutside, true)
  document.addEventListener('keydown', onKeydown, true)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', close)
  window.addEventListener('blur', close)
  await nextTick()
  place()
  itemButtons()[0]?.focus({ preventScroll: true })
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onPointerOutside, true)
  document.removeEventListener('contextmenu', onPointerOutside, true)
  document.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('blur', close)
  const opener = props.opener
  if (opener && typeof opener.focus === 'function' && opener.isConnected !== false) {
    try { opener.focus({ preventScroll: true }) } catch { /* the row left the page */ }
  }
})
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="resource-menu" :class="{ 'row-menu-layer': layer === 'module' }" role="menu" :aria-label="label" :style="{ left: `${position.x}px`, top: `${position.y}px` }" @click.stop @contextmenu.prevent>
      <template v-for="entry in entries" :key="entry.id">
        <div v-if="entry.divider" class="resource-menu-divider" role="separator"></div>
        <button
          v-else
          type="button"
          role="menuitem"
          class="resource-menu-item"
          :class="{ danger: entry.danger, disabled: entry.disabled }"
          :aria-disabled="entry.disabled ? 'true' : undefined"
          :title="entry.disabled ? entry.reason : entry.label"
          @click="choose(entry)"
        ><span>{{ entry.label }}</span><small v-if="entry.disabled && entry.reason">{{ entry.reason }}</small><small v-else-if="entry.hint">{{ entry.hint }}</small></button>
      </template>
    </div>
  </Teleport>
</template>
