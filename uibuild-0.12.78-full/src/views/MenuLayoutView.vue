<script setup>
import { computed, inject, ref } from 'vue'
import { state } from '../state'
import { coreNavigation, DEFAULT_SECTION_ORDER } from '../core-navigation'
import { preferenceState, resetNavigationPreferences, saveUserPreferences } from '../preferences'

function clone(value) { return JSON.parse(JSON.stringify(value)) }

const dynamicNav = inject('tecTacNavigation', [])
const draft = ref(clone(preferenceState.preferences.navigation || {}))
const saving = ref(false)
const saved = ref('')
const error = ref('')
const draggedSection = ref(null)
const draggedItem = ref(null)

const availableItems = computed(() => [
  ...coreNavigation(state.context),
  ...dynamicNav,
].filter((item) => item?.to && item?.label && item.visible !== false))

const availableSections = computed(() => {
  const seen = new Set(availableItems.value.map((item) => item.section || 'Extensions'))
  const preferred = Array.isArray(draft.value.section_order) ? draft.value.section_order : []
  return [...preferred, ...DEFAULT_SECTION_ORDER, ...seen]
    .filter((section, index, rows) => seen.has(section) && rows.indexOf(section) === index)
})

const sectionRows = computed(() => availableSections.value.map((section) => ({
  section,
  items: orderedItems(section),
})))

function orderedItems(section) {
  const items = availableItems.value.filter((item) => (item.section || 'Extensions') === section)
  const savedOrder = Array.isArray(draft.value.order?.[section]) ? draft.value.order[section] : []
  const position = new Map(savedOrder.map((to, index) => [to, index]))
  return [...items].sort((a, b) => {
    const ai = position.has(a.to) ? position.get(a.to) : Number.MAX_SAFE_INTEGER
    const bi = position.has(b.to) ? position.get(b.to) : Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    const ao = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER
    const bo = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    return a.label.localeCompare(b.label)
  })
}

function commitSectionOrder(order) {
  draft.value.section_order = [...order]
}

function moveSection(section, delta) {
  const order = [...availableSections.value]
  const index = order.indexOf(section)
  const target = index + delta
  if (index < 0 || target < 0 || target >= order.length) return
  ;[order[index], order[target]] = [order[target], order[index]]
  commitSectionOrder(order)
}

function sectionDragStart(section) { draggedSection.value = section }
function sectionDrop(target) {
  const source = draggedSection.value
  draggedSection.value = null
  if (!source || source === target) return
  const order = [...availableSections.value]
  const from = order.indexOf(source)
  const to = order.indexOf(target)
  if (from < 0 || to < 0) return
  order.splice(from, 1)
  order.splice(to, 0, source)
  commitSectionOrder(order)
}

function commitItemOrder(section, rows) {
  draft.value.order = { ...(draft.value.order || {}), [section]: rows.map((item) => item.to) }
}

function moveItem(section, route, delta) {
  const rows = orderedItems(section)
  const index = rows.findIndex((item) => item.to === route)
  const target = index + delta
  if (index < 0 || target < 0 || target >= rows.length) return
  ;[rows[index], rows[target]] = [rows[target], rows[index]]
  commitItemOrder(section, rows)
}

function itemDragStart(section, route) { draggedItem.value = { section, route } }
function itemDrop(section, targetRoute) {
  const source = draggedItem.value
  draggedItem.value = null
  if (!source || source.section !== section || source.route === targetRoute) return
  const rows = orderedItems(section)
  const from = rows.findIndex((item) => item.to === source.route)
  const to = rows.findIndex((item) => item.to === targetRoute)
  if (from < 0 || to < 0) return
  const [moved] = rows.splice(from, 1)
  rows.splice(to, 0, moved)
  commitItemOrder(section, rows)
}

async function save() {
  saving.value = true
  error.value = ''
  saved.value = ''
  try {
    const preferences = clone(preferenceState.preferences)
    preferences.navigation = { ...preferences.navigation, ...clone(draft.value) }
    await saveUserPreferences(preferences)
    draft.value = clone(preferenceState.preferences.navigation)
    saved.value = 'Menu layout saved.'
  } catch (e) {
    error.value = e?.message || 'Unable to save menu layout.'
  } finally {
    saving.value = false
  }
}

async function reset() {
  saving.value = true
  error.value = ''
  saved.value = ''
  try {
    resetNavigationPreferences({ save: false })
    await saveUserPreferences(preferenceState.preferences)
    draft.value = clone(preferenceState.preferences.navigation)
    saved.value = 'Menu layout reset to defaults.'
  } catch (e) {
    error.value = e?.message || 'Unable to reset menu layout.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section>
    <div class="phead">
      <div><span class="eyebrow">USER PREFERENCES / NAVIGATION</span><h1>Menu Layout</h1><p>Arrange navigation categories and the pages inside each category. Category ownership stays with Core/modules; this page changes only your personal order.</p></div>
      <div class="row"><button class="btn ghost" :disabled="saving" @click="reset">Reset layout</button><button class="btn primary" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save layout' }}</button></div>
    </div>

    <div v-if="error" class="state-inline warning mb"><b>Menu layout error.</b> {{ error }}</div>
    <div v-if="saved" class="state-inline mb"><b>{{ saved }}</b></div>

    <div class="state-inline mb"><b>Drag or use the arrow controls.</b> Pages remain in the category assigned by Core or their owning module; only category order and item order are personalized.</div>

    <div class="menu-layout-list">
      <article
        v-for="(group, groupIndex) in sectionRows"
        :key="group.section"
        class="card menu-layout-section"
        draggable="true"
        @dragstart="sectionDragStart(group.section)"
        @dragover.prevent
        @drop.prevent="sectionDrop(group.section)"
      >
        <div class="cardhead menu-layout-section-head">
          <div class="menu-layout-heading"><span class="menu-drag-handle" aria-hidden="true">⋮⋮</span><div><span class="eyebrow">CATEGORY {{ groupIndex + 1 }}</span><h3>{{ group.section }}</h3></div></div>
          <div class="row"><button class="iconbtn" type="button" :disabled="groupIndex===0" :aria-label="`Move ${group.section} up`" @click="moveSection(group.section,-1)">↑</button><button class="iconbtn" type="button" :disabled="groupIndex===sectionRows.length-1" :aria-label="`Move ${group.section} down`" @click="moveSection(group.section,1)">↓</button></div>
        </div>

        <div class="menu-layout-items">
          <div
            v-for="(item, itemIndex) in group.items"
            :key="item.to"
            class="menu-layout-item"
            draggable="true"
            @dragstart.stop="itemDragStart(group.section,item.to)"
            @dragover.prevent
            @drop.prevent.stop="itemDrop(group.section,item.to)"
          >
            <span class="menu-drag-handle" aria-hidden="true">⋮⋮</span><span class="ico">{{ item.icon || '◇' }}</span><div class="menu-layout-item-copy"><b>{{ item.label }}</b><span class="mono">{{ item.to }}</span></div><span class="pill">{{ item.owner === 'core' ? 'Core' : 'Module' }}</span><button class="iconbtn" type="button" :disabled="itemIndex===0" :aria-label="`Move ${item.label} up`" @click="moveItem(group.section,item.to,-1)">↑</button><button class="iconbtn" type="button" :disabled="itemIndex===group.items.length-1" :aria-label="`Move ${item.label} down`" @click="moveItem(group.section,item.to,1)">↓</button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
