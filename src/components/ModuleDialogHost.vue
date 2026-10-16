<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { unsavedState } from '../unsaved'

// 0.12.112: draws the one module dialog (docs/module-dialogs.md). The service owns the state, the mount and the close rules;
// this component draws the backdrop, the panel, the focus trap and the Escape key. Text is shown as text only.
const dialogs = inject('tecTacModuleDialogs', null)
const confirmService = inject('tecTacConfirm', null)
const panel = ref(null)
const body = ref(null)
const current = computed(() => dialogs?.state?.current || null)
const titleId = computed(() => (current.value ? `module-dialog-title-${current.value.token}` : ''))

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// A shell dialog above this one (the Yes or No confirm, the unsaved-changes prompt) takes the keys while it is open.
function shellLayerAbove() {
  return unsavedState.dialogOpen === true || confirmService?.state?.current != null
}

function dismiss() { void dialogs?.requestClose?.() }

function focusFirstInside(container) {
  if (!container) return false
  const first = container.querySelector(FOCUSABLE)
  if (!first) return false
  try { first.focus() } catch { return false }
  return true
}

function onKey(event) {
  if (!current.value || !panel.value || shellLayerAbove()) return
  if (event.key === 'Escape') {
    // Stops here, so Quick Actions, help and the notice drawer below do not close too.
    event.preventDefault()
    event.stopImmediatePropagation()
    dismiss()
    return
  }
  if (event.key !== 'Tab') return
  const items = [...panel.value.querySelectorAll(FOCUSABLE)]
  if (!items.length) {
    event.preventDefault()
    panel.value.focus()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  const inside = panel.value.contains(active)
  if (event.shiftKey) {
    if (!inside || active === first) { event.preventDefault(); last.focus() }
  } else if (!inside || active === last) {
    event.preventDefault()
    first.focus()
  }
}

// Mounts the module's content once the panel is in the page.
watch(() => current.value?.token, async (token) => {
  if (!token) return
  await nextTick()
  if (body.value) dialogs?.mountCurrent?.(body.value)
  try { panel.value?.focus() } catch { /* the panel is gone */ }
}, { flush: 'post' })

// Focus goes to the first control the module drew, once its content is in.
watch(() => current.value?.status, async (status) => {
  if (status !== 'open') return
  await nextTick()
  focusFirstInside(body.value)
}, { flush: 'post' })

// Registered in the bubble phase on window, before App.vue's handler, so a stopped Escape never reaches it.
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="current" class="modal-backdrop module-dialog-backdrop" role="presentation" @click.self="dismiss">
    <section ref="panel" class="modal-panel module-dialog-panel tt-ws" :class="{ 'modal-wide': current.size === 'wide' }" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1">
      <div class="cardhead module-dialog-head">
        <div><span class="eyebrow mono">{{ current.moduleId }}</span><h3 :id="titleId">{{ current.title }}</h3></div>
        <button class="iconbtn" type="button" title="Close" aria-label="Close dialog" @click="dismiss">×</button>
      </div>
      <p v-if="current.status === 'failed'" class="state-inline denied module-dialog-error" role="alert">{{ current.error }}</p>
      <div ref="body" class="module-dialog-body"></div>
      <div v-if="current.status === 'failed'" class="modal-actions"><button class="btn" type="button" @click="dismiss">Close</button></div>
    </section>
  </div>
</template>
