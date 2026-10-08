<script setup>
import { computed, inject } from 'vue'
import RuntimeSettingsCard from '../components/RuntimeSettingsCard.vue'
import { canEditRuntimeSettings } from '../runtime-settings'

const state = inject('tecTacState')
// Hiding is not authorization: the backend GET is open to any signed-in user and
// Core refuses the PATCH. A denied visitor sees this message and no request is made.
const allowed = computed(() => canEditRuntimeSettings(state?.context))
</script>

<template>
<section>
  <div class="phead">
    <div>
      <span class="eyebrow">ADMINISTRATION / SYSTEM</span>
      <h1>System Configuration</h1>
      <p>Settings that change how Tec-Tac itself runs. Each setting says when a change takes effect.</p>
    </div>
  </div>
  <RuntimeSettingsCard v-if="allowed" />
  <div v-else class="state-inline denied" role="alert">
    <b>System Configuration is not available to your account.</b>
    Only a superuser, or an administrator with the core.privileged_operations or core.runtime_settings.manage permission, can open this page.
  </div>
</section>
</template>
