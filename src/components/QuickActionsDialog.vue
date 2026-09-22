<script setup>
import { computed, inject, ref } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  navigation: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])
const quickActions = inject('tecTacQuickActions', null)
const query = ref('')
const error = ref('')

const pins = computed(() => quickActions?.listPins?.() || [])
const catalog = computed(() => quickActions?.listCatalog?.() || [])
const q = computed(() => query.value.trim().toLowerCase())
const availableRoutes = computed(() => props.navigation
  .filter((item) => item?.to && item?.label && !quickActions?.isRoutePinned?.(item.to))
  .filter((item) => !q.value || [item.label, item.to, item.section].some((v) => String(v || '').toLowerCase().includes(q.value))))
const availableActions = computed(() => catalog.value
  .filter((item) => !quickActions?.isActionPinned?.(item.id))
  .filter((item) => !q.value || [item.label, item.id, item.provider, item.group, item.description].some((v) => String(v || '').toLowerCase().includes(q.value))))

function close() { emit('update:modelValue', false); error.value = ''; query.value = '' }
function attempt(fn) {
  error.value = ''
  try { fn() } catch (e) { error.value = e?.message || String(e) }
}
function addRoute(item) { attempt(() => quickActions.pinRoute({ to: item.to, label: item.label, icon: item.icon || '↗' })) }
function addAction(item) { attempt(() => quickActions.pinAction(item.id)) }
function remove(pin) { attempt(() => quickActions.removePin(pin.id)) }
function move(pin, offset) { attempt(() => quickActions.movePin(pin.id, offset)) }
</script>

<template>
  <div v-if="modelValue" class="modal-backdrop quick-actions-backdrop" @click.self="close">
    <section class="modal-panel quick-actions-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-actions-title">
      <div class="cardhead quick-actions-dialog-head">
        <div><span class="eyebrow">PERSONAL WORKSPACE</span><h3 id="quick-actions-title">Quick Actions</h3><p>Keep frequently used Tec-Tac pages and registered module actions one click away.</p></div>
        <button class="iconbtn" type="button" title="Close" aria-label="Close Quick Actions" @click="close">×</button>
      </div>

      <div v-if="error" class="state-inline warning mb"><b>Quick Action error.</b> {{ error }}</div>

      <div class="section-divider quick-section-divider">Pinned</div>
      <div v-if="pins.length" class="quick-manage-list">
        <div v-for="(pin,index) in pins" :key="pin.id" class="quick-manage-row">
          <span class="quick-manage-icon" aria-hidden="true">{{ pin.icon || '⚡' }}</span>
          <div class="quick-manage-copy"><b>{{ pin.label }}</b><span class="mono">{{ pin.type === 'route' ? pin.to : pin.action_id }}</span><small v-if="pin.state?.enabled === false" class="dangertext">{{ pin.state.reason }}</small></div>
          <span class="pill" :class="pin.type === 'route' ? '' : (pin.state?.enabled === false ? 'warn' : 'ok')">{{ pin.type === 'route' ? 'PAGE' : 'ACTION' }}</span>
          <div class="quick-manage-buttons"><button class="iconbtn" type="button" :disabled="index===0" title="Move left" @click="move(pin,-1)">←</button><button class="iconbtn" type="button" :disabled="index===pins.length-1" title="Move right" @click="move(pin,1)">→</button><button class="iconbtn dangertext" type="button" title="Remove shortcut" @click="remove(pin)">×</button></div>
        </div>
      </div>
      <div v-else class="callout mono">No Quick Actions pinned yet.</div>

      <div class="section-divider quick-section-divider">Add shortcut</div>
      <label class="search quick-actions-search"><span class="sr-only">Search available shortcuts</span><input v-model="query" placeholder="Search pages and registered actions…"></label>

      <div class="quick-catalog">
        <div v-if="availableRoutes.length" class="quick-catalog-group">
          <span class="eyebrow">PAGES</span>
          <button v-for="item in availableRoutes" :key="`route:${item.to}`" class="quick-catalog-row" type="button" @click="addRoute(item)"><span class="quick-manage-icon">{{ item.icon || '↗' }}</span><span><b>{{ item.label }}</b><small>{{ item.section || 'Tec-Tac' }} · {{ item.to }}</small></span><span class="quick-add">＋</span></button>
        </div>
        <div v-if="availableActions.length" class="quick-catalog-group">
          <span class="eyebrow">MODULE ACTIONS</span>
          <button v-for="item in availableActions" :key="item.id" class="quick-catalog-row" type="button" :disabled="item.state?.enabled === false" :title="item.state?.reason || item.description" @click="addAction(item)"><span class="quick-manage-icon">{{ item.icon || '⚡' }}</span><span><b>{{ item.label }}</b><small>{{ item.provider }} · {{ item.description || item.id }}</small></span><span class="quick-add">＋</span></button>
        </div>
        <div v-if="!availableRoutes.length && !availableActions.length" class="callout mono">No additional shortcuts match the current search.</div>
      </div>

      <div class="modal-actions"><button class="btn primary" type="button" @click="close">Done</button></div>
    </section>
  </div>
</template>
