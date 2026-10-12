<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CONFIRM_TITLE, confirmCountLine } from '../confirm-dialog'

// The one shell Yes or No dialog. It has no input field. Text is shown as text.
const props = defineProps({ service: { type: Object, required: true } })
const current = computed(() => props.service.state.current)
const countLine = computed(() => (current.value ? confirmCountLine(current.value.count, current.value.noun) : ''))
const noButton = ref(null)
const yesButton = ref(null)
let returnFocus = null

function yes() { props.service.answer(true) }
function no() { props.service.answer(false) }

function onKey(event) {
  if (!current.value) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); no(); return }
  if (event.key === 'Tab') {
    // Keep focus on the two buttons while the dialog is open.
    const order = [noButton.value, yesButton.value].filter(Boolean)
    if (!order.length) return
    const index = order.indexOf(document.activeElement)
    event.preventDefault()
    const next = event.shiftKey ? (index <= 0 ? order.length - 1 : index - 1) : (index + 1) % order.length
    order[next].focus()
  }
}

watch(() => current.value?.id, async (id, previous) => {
  if (id && !previous) returnFocus = document.activeElement
  if (!id && returnFocus) {
    try { returnFocus.focus?.() } catch { /* the element left the page */ }
    returnFocus = null
  }
  if (id) { await nextTick(); noButton.value?.focus() }
})

onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div v-if="current" class="modal-backdrop confirm-backdrop" role="presentation" @click.self="no">
    <section class="modal-panel confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-question">
      <div class="cardhead"><div><span class="eyebrow">CONFIRM</span><h3 id="confirm-title">{{ CONFIRM_TITLE }}</h3></div></div>
      <p id="confirm-question" class="confirm-question">{{ current.question }}</p>
      <p v-if="current.target" class="confirm-target mono">{{ current.target }}</p>
      <p v-if="countLine" class="confirm-count">{{ countLine }}</p>
      <p v-if="current.detail" class="muted compact-copy">{{ current.detail }}</p>
      <p v-if="current.askedBy" class="muted compact-copy confirm-asker">Asked by {{ current.askedBy }}</p>
      <div class="modal-actions">
        <button ref="noButton" type="button" class="btn" @click="no">{{ current.noLabel }}</button>
        <button ref="yesButton" type="button" class="btn" :class="current.danger ? 'danger' : 'primary'" @click="yes">{{ current.yesLabel }}</button>
      </div>
    </section>
  </div>
</template>
