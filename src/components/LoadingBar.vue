<script setup>
// 0.12.107: the thin loading bar at the top of the window. Mounted once in App.vue, so it shows on the signed-in shell, the
// sign-in screen and the popup layout alike. Its state comes from src/loading-bar.js; it sends no request and stores nothing.
// The visible strip is decorative for pointers (pointer-events none). The screen-reader text is the quiet part: a live
// region says "Loading" while the bar is shown, and the progressbar carries the same label and aria-busy.
import { onBeforeUnmount, ref } from 'vue'
import { loadingBarVisible, subscribeLoadingBar } from '../loading-bar.js'

const visible = ref(loadingBarVisible())
const unsubscribe = subscribeLoadingBar((value) => { visible.value = value })
onBeforeUnmount(() => { unsubscribe() })
</script>

<template>
  <div class="app-loading-bar-host" aria-live="polite">
    <span class="sr-only">{{ visible ? 'Loading' : '' }}</span>
    <div v-if="visible" class="app-loading-bar" role="progressbar" aria-label="Loading" aria-busy="true"></div>
  </div>
</template>
