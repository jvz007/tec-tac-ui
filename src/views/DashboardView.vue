<script setup>
import { computed, inject, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createDashboard, deleteDashboard, listDashboards, updateDashboard } from '../dashboards'
import { preferenceState, updateUserPreferences } from '../preferences'

const route = useRoute()
const router = useRouter()
const state = inject('tecTacState')
const dashboardWidgets = inject('tecTacDashboardWidgets')

const dashboards = ref([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const selectedId = ref(null)
const editMode = ref(false)
const draft = ref(null)
const showCreate = ref(false)
const createName = ref('')
const createVisibility = ref('private')
const showWidgetCatalog = ref(false)
const draggedInstance = ref(null)

const availableWidgets = computed(() => dashboardWidgets?.list?.() || [])
const widgetCategories = computed(() => [...new Set(availableWidgets.value.map((item) => item.category))])
const widgetById = computed(() => new Map(availableWidgets.value.map((item) => [item.id, item])))
const selected = computed(() => dashboards.value.find((item) => item.id === selectedId.value) || null)
const myDashboards = computed(() => dashboards.value.filter((item) => item.mine))
const sharedDashboards = computed(() => dashboards.value.filter((item) => item.visibility === 'shared' && !item.mine))
const canEdit = computed(() => selected.value?.can_edit === true)
const isDefault = computed(() => preferenceState.preferences.dashboard.default_dashboard_id === selectedId.value)
const working = computed(() => editMode.value && draft.value ? draft.value : selected.value)
const workingWidgets = computed(() => working.value?.layout?.widgets || [])

function clone(value) { return JSON.parse(JSON.stringify(value)) }
function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function widgetDefinition(instance) { return widgetById.value.get(instance.widget_id) || null }
function widgetStyle(instance) {
  return {
    gridColumn: `span ${Math.min(12, Math.max(1, Number(instance.w) || 4))}`,
    minHeight: `${Math.max(2, Number(instance.h) || 3) * 74}px`,
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await listDashboards()
    dashboards.value = response?.dashboards || []
    await selectFromRouteOrPreferences()
  } catch (e) {
    error.value = e?.message || 'Unable to load dashboards.'
  } finally {
    loading.value = false
  }
}

async function selectFromRouteOrPreferences() {
  if (!dashboards.value.length) {
    selectedId.value = null
    return
  }
  const routeId = String(route.params.dashboardId || '')
  if (routeId && dashboards.value.some((item) => item.id === routeId)) {
    selectedId.value = routeId
    rememberLast(routeId)
    return
  }
  const prefs = preferenceState.preferences.dashboard
  const preferred = prefs.restore_last_dashboard && prefs.last_dashboard_id && dashboards.value.some((item) => item.id === prefs.last_dashboard_id)
    ? prefs.last_dashboard_id
    : (prefs.default_dashboard_id && dashboards.value.some((item) => item.id === prefs.default_dashboard_id) ? prefs.default_dashboard_id : null)
  const target = preferred || myDashboards.value[0]?.id || sharedDashboards.value[0]?.id || dashboards.value[0].id
  selectedId.value = target
  if (route.path === '/dashboards' || !routeId) await router.replace(`/dashboards/${target}`)
  rememberLast(target)
}

function rememberLast(id) {
  if (!id || preferenceState.preferences.dashboard.last_dashboard_id === id) return
  updateUserPreferences((next) => {
    next.dashboard.last_dashboard_id = id
    return next
  })
}

async function chooseDashboard(id) {
  if (!id || id === selectedId.value) return
  editMode.value = false
  draft.value = null
  showWidgetCatalog.value = false
  selectedId.value = id
  rememberLast(id)
  await router.push(`/dashboards/${id}`)
}

function startCreate() {
  createName.value = ''
  createVisibility.value = 'private'
  showCreate.value = true
}

async function createNew() {
  if (!createName.value.trim() || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const item = await createDashboard({
      name: createName.value.trim(),
      visibility: createVisibility.value,
      layout: { widgets: [] },
    })
    dashboards.value.push(item)
    showCreate.value = false
    selectedId.value = item.id
    rememberLast(item.id)
    await router.push(`/dashboards/${item.id}`)
    beginEdit()
  } catch (e) {
    error.value = e?.message || 'Unable to create dashboard.'
  } finally {
    saving.value = false
  }
}

function beginEdit() {
  if (!canEdit.value) return
  draft.value = clone(selected.value)
  editMode.value = true
}

function cancelEdit() {
  draft.value = null
  editMode.value = false
  showWidgetCatalog.value = false
}

async function saveEdit() {
  if (!draft.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const updated = await updateDashboard(draft.value.id, {
      name: draft.value.name,
      visibility: draft.value.visibility,
      layout: draft.value.layout,
    })
    const index = dashboards.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) dashboards.value[index] = updated
    draft.value = null
    editMode.value = false
    showWidgetCatalog.value = false
  } catch (e) {
    error.value = e?.message || 'Unable to save dashboard.'
  } finally {
    saving.value = false
  }
}

async function removeCurrent() {
  if (!selected.value?.can_edit || !window.confirm(`Delete dashboard ${selected.value.name}?`)) return
  saving.value = true
  try {
    const id = selected.value.id
    await deleteDashboard(id)
    dashboards.value = dashboards.value.filter((item) => item.id !== id)
    if (preferenceState.preferences.dashboard.default_dashboard_id === id || preferenceState.preferences.dashboard.last_dashboard_id === id) {
      updateUserPreferences((next) => {
        if (next.dashboard.default_dashboard_id === id) next.dashboard.default_dashboard_id = null
        if (next.dashboard.last_dashboard_id === id) next.dashboard.last_dashboard_id = null
        return next
      })
    }
    selectedId.value = null
    await router.push('/dashboards')
    await selectFromRouteOrPreferences()
  } catch (e) {
    error.value = e?.message || 'Unable to delete dashboard.'
  } finally {
    saving.value = false
  }
}

function addWidget(widget) {
  if (!draft.value) return
  const size = widget.defaultSize || { w: 4, h: 3 }
  draft.value.layout.widgets.push({
    instance_id: uuid(),
    widget_id: widget.id,
    w: size.w,
    h: size.h,
    settings: {},
  })
}

function removeWidget(instance) {
  if (!draft.value) return
  draft.value.layout.widgets = draft.value.layout.widgets.filter((item) => item.instance_id !== instance.instance_id)
}

function updateWidgetSettings(instance, value) {
  if (!draft.value || !value || typeof value !== 'object' || Array.isArray(value)) return
  const target = draft.value.layout.widgets.find((item) => item.instance_id === instance.instance_id)
  if (target) target.settings = { ...value }
}

function resizeWidget(instance, axis, delta) {
  if (!draft.value) return
  const target = draft.value.layout.widgets.find((item) => item.instance_id === instance.instance_id)
  if (!target) return
  const def = widgetDefinition(target)
  const min = def?.minSize?.[axis] || 1
  const max = def?.maxSize?.[axis] || 12
  target[axis] = Math.min(max, Math.max(min, Number(target[axis] || (axis === 'w' ? 4 : 3)) + delta))
}

function dragStart(instance) { if (editMode.value) draggedInstance.value = instance.instance_id }
function dragEnd() { draggedInstance.value = null }
function dropOn(target) {
  if (!draft.value || !draggedInstance.value || draggedInstance.value === target.instance_id) return
  const list = draft.value.layout.widgets
  const from = list.findIndex((item) => item.instance_id === draggedInstance.value)
  const to = list.findIndex((item) => item.instance_id === target.instance_id)
  if (from < 0 || to < 0) return
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  draggedInstance.value = null
}

function setDefault() {
  if (!selectedId.value) return
  updateUserPreferences((next) => {
    next.dashboard.default_dashboard_id = selectedId.value
    return next
  })
}

watch(() => route.params.dashboardId, async (id) => {
  if (!id || loading.value) return
  if (dashboards.value.some((item) => item.id === id)) {
    selectedId.value = id
    rememberLast(id)
    editMode.value = false
    draft.value = null
  } else {
    await load()
  }
})

onMounted(load)
</script>

<template>
  <section>
    <div class="phead dashboard-phead">
      <div>
        <span class="eyebrow">CORE DASHBOARD WORKSPACE</span>
        <h1>Dashboards</h1>
        <p>Create private dashboards for yourself or shared dashboards for every authenticated Tec-Tac user. Modules contribute widgets; Core owns the layout and visibility rules.</p>
      </div>
      <div class="row">
        <button class="btn" @click="load">Refresh</button>
        <button class="btn primary" @click="startCreate">New Dashboard</button>
      </div>
    </div>

    <div v-if="error" class="callout danger-panel mb">{{ error }}</div>

    <div v-if="showCreate" class="card dashboard-create mb">
      <div class="cardhead"><div><span class="eyebrow">NEW DASHBOARD</span><h3>Create dashboard</h3></div></div>
      <div class="dashboard-create-grid">
        <label><span>Name</span><input v-model="createName" placeholder="Helpdesk Overview" @keyup.enter="createNew"></label>
        <label><span>Visibility</span><select v-model="createVisibility"><option value="private">Private — only me</option><option value="shared">Shared — all authenticated users</option></select></label>
        <div class="row"><button class="btn ghost" @click="showCreate=false">Cancel</button><button class="btn primary" :disabled="saving || !createName.trim()" @click="createNew">Create</button></div>
      </div>
    </div>

    <div v-if="loading" class="callout mono">Loading dashboards…</div>

    <div v-else-if="!dashboards.length" class="dashboard-empty card">
      <span class="eyebrow">NO DASHBOARDS YET</span>
      <h2>Build your first dashboard</h2>
      <p>Start with the Core widgets now. As modules register dashboard widgets they will automatically become available in the widget catalogue.</p>
      <button class="btn primary" @click="startCreate">New Dashboard</button>
    </div>

    <template v-else-if="working">
      <div class="dashboard-toolbar card mb">
        <div class="dashboard-selector-wrap">
          <label class="label">DASHBOARD</label>
          <select :value="selectedId" @change="chooseDashboard($event.target.value)">
            <optgroup v-if="myDashboards.length" label="My Dashboards">
              <option v-for="item in myDashboards" :key="item.id" :value="item.id">{{ item.name }} · {{ item.visibility }}</option>
            </optgroup>
            <optgroup v-if="sharedDashboards.length" label="Shared Dashboards">
              <option v-for="item in sharedDashboards" :key="item.id" :value="item.id">{{ item.name }} · {{ item.owner.display_name }}</option>
            </optgroup>
          </select>
        </div>
        <div class="dashboard-title-block">
          <template v-if="editMode">
            <input v-model="draft.name" class="dashboard-title-input">
            <select v-model="draft.visibility" class="dashboard-visibility-select" :disabled="!selected.mine" :title="selected.mine ? 'Change dashboard visibility' : 'Only the owner can change visibility'"><option value="private">Private</option><option value="shared">Shared</option></select>
          </template>
          <template v-else>
            <h2>{{ selected.name }}</h2>
            <div class="row compact-row"><span class="pill" :class="selected.visibility==='shared'?'ok':''">{{ selected.visibility }}</span><span class="mono muted">owner: {{ selected.owner.display_name }}</span><span v-if="isDefault" class="pill ok">default</span></div>
          </template>
        </div>
        <div class="spacer"></div>
        <div class="row">
          <template v-if="editMode">
            <button class="btn" @click="showWidgetCatalog=!showWidgetCatalog">{{ showWidgetCatalog ? 'Hide widgets' : 'Add Widget' }}</button>
            <button class="btn ghost" @click="cancelEdit">Cancel</button>
            <button class="btn primary" :disabled="saving" @click="saveEdit">{{ saving ? 'Saving…' : 'Save' }}</button>
          </template>
          <template v-else>
            <button v-if="!isDefault" class="btn" @click="setDefault">Set as my default</button>
            <button v-if="canEdit" class="btn primary" @click="beginEdit">Edit Dashboard</button>
            <button v-if="canEdit" class="btn danger" @click="removeCurrent">Delete</button>
          </template>
        </div>
      </div>

      <div class="dashboard-workspace" :class="{ 'catalog-open': showWidgetCatalog && editMode }">
        <aside v-if="showWidgetCatalog && editMode" class="dashboard-widget-catalog card">
          <div class="cardhead"><div><span class="eyebrow">WIDGET CATALOGUE</span><h3>Add widget</h3></div><span class="pill">{{ availableWidgets.length }}</span></div>
          <div v-for="category in widgetCategories" :key="category" class="widget-catalog-section">
            <div class="section-divider">{{ category }}</div>
            <button v-for="widget in availableWidgets.filter(x=>x.category===category)" :key="widget.id" class="widget-catalog-item" @click="addWidget(widget)">
              <b>{{ widget.title }}</b><span>{{ widget.description || widget.id }}</span><small class="mono">{{ widget.defaultSize.w }}×{{ widget.defaultSize.h }} · {{ widget.provider }}</small>
            </button>
          </div>
          <div v-if="!availableWidgets.length" class="empty">No dashboard widgets are currently registered for your permissions.</div>
        </aside>

        <div class="dashboard-canvas">
          <div v-if="!workingWidgets.length" class="dashboard-empty-slot">
            <span class="eyebrow">EMPTY DASHBOARD</span>
            <h3>{{ editMode ? 'Add widgets to start composing this dashboard.' : 'This dashboard has no widgets yet.' }}</h3>
            <button v-if="editMode" class="btn primary" @click="showWidgetCatalog=true">Add Widget</button>
          </div>

          <article
            v-for="instance in workingWidgets"
            :key="instance.instance_id"
            class="dashboard-widget card"
            :class="{ 'widget-editing': editMode, 'widget-dragging': draggedInstance===instance.instance_id }"
            :style="widgetStyle(instance)"
            :draggable="editMode"
            @dragstart="dragStart(instance)"
            @dragend="dragEnd"
            @dragover.prevent
            @drop.prevent="dropOn(instance)"
          >
            <div class="dashboard-widget-head">
              <div><span class="eyebrow">{{ widgetDefinition(instance)?.category || 'Unavailable' }}</span><h3>{{ widgetDefinition(instance)?.title || instance.widget_id }}</h3></div>
              <div v-if="editMode" class="dashboard-widget-controls">
                <button class="iconbtn" title="Narrower" @click="resizeWidget(instance,'w',-1)">−W</button>
                <button class="iconbtn" title="Wider" @click="resizeWidget(instance,'w',1)">+W</button>
                <button class="iconbtn" title="Shorter" @click="resizeWidget(instance,'h',-1)">−H</button>
                <button class="iconbtn" title="Taller" @click="resizeWidget(instance,'h',1)">+H</button>
                <button class="iconbtn dangertext" title="Remove widget" @click="removeWidget(instance)">×</button>
              </div>
            </div>
            <div v-if="widgetDefinition(instance)" class="dashboard-widget-body">
              <component :is="widgetDefinition(instance).component" :settings="instance.settings" :dashboard="working" :editable="editMode" @update:settings="updateWidgetSettings(instance, $event)" />
            </div>
            <div v-else class="dashboard-widget-unavailable">
              <b>Widget unavailable</b>
              <span class="mono">{{ instance.widget_id }}</span>
              <p>The provider is disabled, missing, or not permitted for this user. The saved dashboard layout has been preserved.</p>
            </div>
          </article>
        </div>
      </div>
    </template>
  </section>
</template>
