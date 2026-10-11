<script setup>
// The page a popup window shows until its module page is ready, and the refusal when it cannot open (0.12.95).
// It never loads a module and never shows the dashboard.
import { computed } from 'vue'
import { state } from '../state'
import { POPUP_MESSAGE_NOT_POPUP } from '../popup-mode'

const popup = computed(() => state.popup || { active: false, status: 'idle', message: '' })
const refused = computed(() => !popup.value.active || popup.value.status === 'refused')
const message = computed(() => popup.value.message || POPUP_MESSAGE_NOT_POPUP)
</script>

<template>
  <div class="state-panel popup-pending" role="status" aria-live="polite">
    <template v-if="refused">
      <span class="eyebrow">POPUP WINDOW</span>
      <h2>{{ message }}</h2>
      <p>Close this window and open the page again from Tec-Tac.</p>
    </template>
    <template v-else>
      <span class="eyebrow">POPUP WINDOW</span>
      <h2>Opening window…</h2>
      <div class="verify-line"><span class="spinner" aria-hidden="true"></span><span class="mono">Loading this page only.</span></div>
    </template>
  </div>
</template>
