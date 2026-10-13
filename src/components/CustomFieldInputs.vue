<script setup>
// The custom-field inputs of a client or a site: one list for the Add dialogs and the Edit fields dialog (0.12.97).
// fields: [{ field_id, name, type, options, required, value }]. The inputs change field.value in place.
// status: 'ready' (the default) shows the list; 'loading' and 'error' show the read state, and 'error' offers Retry.
defineProps({
  fields: { type: Array, default: () => [] },
  status: { type: String, default: 'ready' },
  error: { type: String, default: '' },
})
defineEmits(['retry'])
</script>

<template>
  <div class="custom-field-block">
    <div v-if="status === 'loading'" class="state-inline">Loading custom fields…</div>
    <div v-else-if="status === 'error'" class="state-inline warning" role="alert">
      <b>Custom fields could not be loaded.</b> {{ error }}
      <div class="editor-actions"><button type="button" class="btn sm" @click="$emit('retry')">Retry</button></div>
    </div>
    <div v-else-if="fields.length" class="custom-field-list">
      <label v-for="field in fields" :key="field.field_id" class="field">
        <span>{{ field.name }} <small v-if="field.required">· required</small></span>
        <input v-if="field.type==='checkbox'" v-model="field.value" type="checkbox">
        <select v-else-if="field.type==='single'" v-model="field.value"><option value="">—</option><option v-for="option in field.options" :key="option" :value="option">{{ option }}</option></select>
        <select v-else-if="field.type==='multiple'" v-model="field.value" multiple><option v-for="option in field.options" :key="option" :value="option">{{ option }}</option></select>
        <input v-else-if="field.type==='number'" v-model="field.value" type="number" step="any">
        <input v-else v-model="field.value" type="text" :placeholder="field.type==='datetime'?'Tactical date/time value':''">
      </label>
    </div>
  </div>
</template>

<style scoped>
.custom-field-list{display:grid;gap:12px;max-height:55vh;overflow:auto;padding-right:4px}.custom-field-list select[multiple]{min-height:110px}
</style>
