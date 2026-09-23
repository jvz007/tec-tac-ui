<script setup>
import { computed } from 'vue'
import { renderMarkdown } from '../help/markdown'

const props = defineProps({ content: { type: String, default: '' } })
const rendered = computed(() => renderMarkdown(props.content))
</script>

<template>
  <article class="help-markdown" v-html="rendered"></article>
</template>
