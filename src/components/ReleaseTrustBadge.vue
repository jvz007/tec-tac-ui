<script setup>
// The signed/unsigned badge and its details popover for one release row. The
// parent owns the popover state (System Updates, so only one is open at a time)
// and passes it in; this block only draws it.
defineProps({
  trust: { type: Object, default: null },
  label: { type: String, required: true },
  tone: { type: String, default: '' },
  open: { type: Boolean, default: false },
  popoverId: { type: String, required: true },
})
const emit = defineEmits(['trust-hover', 'trust-leave', 'trust-focus', 'trust-blur', 'trust-close'])
</script>

<template>
  <span class="system-trust-badge">
    <span
      class="pill system-trust-trigger"
      tabindex="0"
      :class="tone"
      @mouseenter="emit('trust-hover')"
      @mouseleave="emit('trust-leave')"
      @focus="emit('trust-focus')"
      @blur="emit('trust-blur')"
      @click="emit('trust-close', $event)"
      @keydown.esc.stop.prevent="emit('trust-close', $event)"
      :aria-describedby="open ? popoverId : undefined"
    >{{ label }}</span>
    <span :id="popoverId" v-if="open" class="system-trust-popover" role="tooltip">
      <b>{{ trust?.publisher_display_name || (trust?.signed ? 'Signed release' : 'Unsigned release') }}</b>
      <span v-if="trust?.publisher_id">Publisher ID: <span class="mono">{{ trust.publisher_id }}</span></span>
      <span v-if="trust?.key_id">Key ID: <span class="mono">{{ trust.key_id }}</span></span>
      <span v-if="trust?.algorithm">Algorithm: {{ trust.algorithm }}</span>
      <span v-if="trust?.file_count">Manifest files: {{ trust.file_count }}</span>
      <span v-if="trust?.details">{{ trust.details }}</span>
    </span>
  </span>
</template>
