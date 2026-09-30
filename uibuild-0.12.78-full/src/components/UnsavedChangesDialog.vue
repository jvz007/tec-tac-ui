<script setup>
import { discardAndContinue, saveAndContinue, stayOnPage, unsavedState } from '../unsaved'
</script>

<template>
  <div v-if="unsavedState.dialogOpen" class="modal-backdrop" role="presentation" @click.self="stayOnPage">
    <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="unsaved-dialog-title">
      <div class="cardhead">
        <div>
          <span class="eyebrow">UNSAVED CHANGES</span>
          <h3 id="unsaved-dialog-title">Leave without saving?</h3>
        </div>
        <span class="pill warn">PENDING</span>
      </div>
      <p class="compact-copy">{{ unsavedState.label }} has changes that have not been saved.</p>
      <div v-if="unsavedState.error" class="auth-error">{{ unsavedState.error }}</div>
      <div class="modal-actions">
        <button class="btn primary" :disabled="unsavedState.busy" @click="saveAndContinue">Save & continue</button>
        <button class="btn warnbtn" :disabled="unsavedState.busy" @click="discardAndContinue">Discard & continue</button>
        <button class="btn" :disabled="unsavedState.busy" @click="stayOnPage">Stay here</button>
      </div>
    </section>
  </div>
</template>
