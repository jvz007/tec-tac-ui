<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TACTICAL_PERMISSION_GROUPS, createRole, deleteRole, getRole, getRoleExtensionPermissions, listRoles, permissionLabel, updateRole, updateRoleExtensionPermissions } from '../../access'
import { clearUnsaved, registerUnsaved, requestLeave } from '../../unsaved'

const state = inject('tecTacState')
const roles = ref([])
const selected = ref(null)
const extensionCatalog = ref([])
const extensionPermissions = ref({})
const loading = ref(true)
const saving = ref(false)
const denied = ref(false)
const error = ref('')
const newRoleName = ref('')
const query = ref('')
const baseline = ref('')
const roleList = ref(null)
const editorTab = ref('overview')
const permissionQuery = ref('')
const enabledOnly = ref(false)
const collapsedGroups = ref({})
const OWNER = 'roles-editor'

const canManage = computed(() => state.context.capabilities?.manage_roles !== false)
const capabilityResolved = computed(() => state.context.capabilities !== null)
const filteredRoles = computed(() => roles.value.filter((r) => !query.value || r.name.toLowerCase().includes(query.value.toLowerCase())))
const selectedSummary = computed(() => roles.value.find((r) => r.id === selected.value?.id) || null)
const permissionCount = computed(() => TACTICAL_PERMISSION_GROUPS.reduce((n,g) => n + g.keys.filter((k) => selected.value?.[k]).length, 0))
const tacticalPermissionTotal = computed(() => TACTICAL_PERMISSION_GROUPS.reduce((n,g) => n + g.keys.filter((k) => selected.value && k in selected.value).length, 0))
const extensionPermissionCount = computed(() => Object.values(extensionPermissions.value).filter(Boolean).length)
const extensionPermissionTotal = computed(() => extensionCatalog.value.reduce((n, ext) => n + (ext.groups || []).reduce((g, group) => g + (group.permissions || []).length, 0), 0))
const totalGrantCount = computed(() => permissionCount.value + extensionPermissionCount.value)

const editorTabs = computed(() => [
  { id:'overview', label:'Overview', hint:'Identity and role summary' },
  { id:'tactical', label:'Tactical permissions', hint:`${permissionCount.value} of ${tacticalPermissionTotal.value} enabled` },
  { id:'extensions', label:'Extension permissions', hint:`${extensionPermissionCount.value} of ${extensionPermissionTotal.value} enabled` },
])

const tacticalGroups = computed(() => {
  const needle = permissionQuery.value.trim().toLowerCase()
  return TACTICAL_PERMISSION_GROUPS.map((group) => {
    const keys = group.keys.filter((key) => {
      if (!selected.value || !(key in selected.value)) return false
      if (enabledOnly.value && !selected.value[key]) return false
      if (!needle) return true
      return group.name.toLowerCase().includes(needle) || key.toLowerCase().includes(needle) || permissionLabel(key).toLowerCase().includes(needle)
    })
    const allKeys = group.keys.filter((key) => selected.value && key in selected.value)
    return {
      ...group,
      keys,
      enabled: allKeys.filter((key) => selected.value?.[key]).length,
      total: allKeys.length,
    }
  }).filter((group) => !needle && !enabledOnly.value ? group.total > 0 : group.keys.length > 0)
})

const extensionGroups = computed(() => {
  const needle = permissionQuery.value.trim().toLowerCase()
  const result = []
  for (const ext of extensionCatalog.value) {
    for (const group of ext.groups || []) {
      const allPermissions = group.permissions || []
      const permissions = allPermissions.filter((code) => {
        if (enabledOnly.value && !extensionPermissions.value[code]) return false
        if (!needle) return true
        return ext.id.toLowerCase().includes(needle) || group.name.toLowerCase().includes(needle) || code.toLowerCase().includes(needle)
      })
      if ((!needle && !enabledOnly.value) || permissions.length) {
        result.push({
          ext,
          group,
          permissions,
          enabled: allPermissions.filter((code) => extensionPermissions.value[code]).length,
          total: allPermissions.length,
        })
      }
    }
  }
  return result
})

function snapshot() {
  if (!selected.value) return ''
  const tactical = { id: selected.value.id, name: selected.value.name, is_superuser: !!selected.value.is_superuser }
  for (const group of TACTICAL_PERMISSION_GROUPS) {
    for (const key of group.keys) if (key in selected.value) tactical[key] = !!selected.value[key]
  }
  const extensions = Object.fromEntries(Object.entries(extensionPermissions.value).sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => [key, !!value]))
  return JSON.stringify({ tactical, extensions })
}

const dirty = computed(() => !!selected.value && !!baseline.value && snapshot() !== baseline.value)

watch(dirty, (value) => {
  if (value) registerUnsaved(OWNER, `Role ${selected.value?.name || ''}`, { save: persistRole, discard: discardChanges })
  else clearUnsaved(OWNER)
})

watch(() => selected.value?.name, () => {
  if (dirty.value) registerUnsaved(OWNER, `Role ${selected.value?.name || ''}`, { save: persistRole, discard: discardChanges })
})

async function loadRoles(preferredId = null) {
  loading.value = true; error.value = ''; denied.value = false
  try {
    roles.value = await listRoles()
    const id = preferredId || selected.value?.id || roles.value[0]?.id
    if (id) await chooseRole(id, true)
  } catch (err) {
    if (err.status === 403) denied.value = true
    else error.value = err.message || 'Unable to load roles.'
  } finally { loading.value = false }
}

async function loadRole(id) {
  error.value = ''
  selected.value = await getRole(id)
  try {
    const ext = await getRoleExtensionPermissions(id)
    extensionCatalog.value = ext.extensions || []
    extensionPermissions.value = { ...(ext.permissions || {}) }
  } catch (err) {
    extensionCatalog.value = []
    extensionPermissions.value = {}
    if (err.status !== 404 && err.status !== 403) throw err
  }
  baseline.value = snapshot()
  permissionQuery.value = ''
  enabledOnly.value = false
  collapsedGroups.value = {}
  clearUnsaved(OWNER)
}

async function chooseRole(id, force = false) {
  if (selected.value?.id === id) return
  if (!force && dirty.value) {
    requestLeave(() => chooseRole(id, true))
    return
  }
  try { await loadRole(id) }
  catch (err) { error.value = err.message || 'Unable to load role.' }
}

async function focusSelectedRole(id) {
  await nextTick()
  roleList.value?.querySelector(`[data-role-id="${id}"]`)?.scrollIntoView({ block: 'nearest' })
}

async function addRole() {
  const name = newRoleName.value.trim()
  if (!name) return
  if (dirty.value) {
    requestLeave(() => addRole())
    return
  }
  saving.value = true; error.value = ''
  try {
    await createRole(name)
    newRoleName.value = ''
    query.value = ''
    roles.value = await listRoles()
    const created = roles.value.find((role) => role.name === name)
    if (!created) throw new Error(`Role ${name} was created, but could not be found after refreshing the role list.`)
    await loadRole(created.id)
    await focusSelectedRole(created.id)
  } catch (err) { error.value = err.message || 'Unable to create role.' }
  finally { saving.value = false }
}

async function persistRole() {
  if (!selected.value) return
  saving.value = true
  const id = selected.value.id
  try {
    const payload = { ...selected.value }
    delete payload.user_count
    await updateRole(id, payload)
    if (Object.keys(extensionPermissions.value).length) await updateRoleExtensionPermissions(id, extensionPermissions.value)
    roles.value = await listRoles()
    await loadRole(id)
    await focusSelectedRole(id)
  } finally { saving.value = false }
}

async function saveRole() {
  error.value = ''
  try { await persistRole() }
  catch (err) { error.value = err.message || 'Unable to save role.' }
}

async function discardChanges() {
  if (!selected.value?.id) return
  await loadRole(selected.value.id)
}

async function removeRole() {
  if (!selected.value) return
  if (dirty.value) {
    requestLeave(() => removeRole())
    return
  }
  const summary = roles.value.find((r) => r.id === selected.value.id)
  if (summary?.user_count > 0) { error.value = 'Reassign users before deleting this role.'; return }
  if (!window.confirm(`Delete role ${selected.value.name}? This cannot be undone.`)) return
  saving.value = true; error.value = ''
  try { await deleteRole(selected.value.id); selected.value = null; baseline.value = ''; clearUnsaved(OWNER); await loadRoles() }
  catch (err) { error.value = err.message || 'Unable to delete role.' }
  finally { saving.value = false }
}

function setGroup(group, value) { for (const key of group.keys) if (key in selected.value) selected.value[key] = value }
function setExtensionGroup(group, value) { for (const code of group.permissions || []) extensionPermissions.value[code] = value }
function toggleGroup(name) { collapsedGroups.value = { ...collapsedGroups.value, [name]: !collapsedGroups.value[name] } }
function setEditorTab(id) { editorTab.value = id; permissionQuery.value = ''; enabledOnly.value = false }
function beforeUnload(event) { if (!dirty.value) return; event.preventDefault(); event.returnValue = '' }

onMounted(() => { window.addEventListener('beforeunload', beforeUnload); loadRoles() })
onBeforeUnmount(() => { window.removeEventListener('beforeunload', beforeUnload) })
</script>

<template>
  <div v-if="loading" class="callout mono">Loading Tactical roles…</div>
  <div v-else-if="denied" class="state-inline denied"><b>Permission denied.</b> This Tactical role does not have <span class="mono">can_list_roles</span>.</div>
  <div v-else>
    <div class="roles-commandbar card">
      <label class="roles-search"><span class="sr-only">Search roles</span><input v-model="query" placeholder="Search roles…" /></label>
      <span class="roles-count mono">{{ filteredRoles.length }} of {{ roles.length }} roles</span>
      <span class="spacer"></span>
      <div class="role-create"><input v-model="newRoleName" placeholder="New role name" @keyup.enter="addRole" /><button class="btn primary" :disabled="saving || !newRoleName.trim() || (capabilityResolved && !canManage)" @click="addRole">+ Create role</button></div>
    </div>

    <div v-if="error" class="auth-error">{{ error }}</div>
    <div v-if="capabilityResolved && !canManage" class="state-inline warning"><b>Read-only.</b> Your Tactical role can list roles but does not have <span class="mono">can_manage_roles</span>.</div>

    <div class="role-workspace">
      <aside ref="roleList" class="role-sidebar card">
        <div class="role-sidebar-head"><span class="eyebrow">ROLES</span><span class="mono muted">{{ roles.length }}</span></div>
        <button class="role-list-item" v-for="role in filteredRoles" :key="role.id" :data-role-id="role.id" :class="{ selected: selected?.id === role.id }" @click="chooseRole(role.id)">
          <span class="role-status-dot" :class="role.is_superuser ? 'super' : ''"></span>
          <span class="role-list-copy"><b>{{ role.name }}</b><span>{{ role.user_count }} user{{ role.user_count === 1 ? '' : 's' }}</span></span>
          <span class="role-id mono">#{{ role.id }}</span>
        </button>
        <div v-if="!filteredRoles.length" class="empty role-list-empty">No matching roles.</div>
      </aside>

      <div v-if="selected" class="role-editor-shell">
        <header class="role-editor-header card">
          <div class="role-title-block">
            <span class="eyebrow">ROLE #{{ selected.id }}</span>
            <div class="role-title-row"><h2>{{ selected.name }}</h2><span class="pill" :class="dirty ? 'warn' : 'ok'">{{ dirty ? 'UNSAVED' : 'SAVED' }}</span></div>
            <div class="role-summary-line">
              <span><b>{{ selectedSummary?.user_count ?? 0 }}</b> users</span>
              <span><b>{{ permissionCount }}</b> Tactical grants</span>
              <span><b>{{ extensionPermissionCount }}</b> extension grants</span>
              <span><b>{{ totalGrantCount }}</b> total</span>
            </div>
          </div>
          <div v-if="selected.is_superuser" class="role-superuser-badge">SUPERUSER</div>
        </header>

        <nav class="role-editor-tabs" aria-label="Role editor sections">
          <button v-for="item in editorTabs" :key="item.id" :class="{ active: editorTab === item.id }" @click="setEditorTab(item.id)"><b>{{ item.label }}</b><span>{{ item.hint }}</span></button>
        </nav>

        <section v-if="editorTab === 'overview'" class="role-overview-grid">
          <article class="card role-settings-card">
            <div class="cardhead"><div><span class="eyebrow">ROLE SETTINGS</span><h3>Identity</h3></div></div>
            <label class="field"><span>Role name</span><input v-model="selected.name" :disabled="capabilityResolved && !canManage" /></label>
            <label class="role-superuser-toggle"><input v-model="selected.is_superuser" type="checkbox" :disabled="capabilityResolved && !canManage" /><span><b>Superuser role</b><small>Grant unrestricted Tactical access. Individual permission switches become informational.</small></span></label>
            <div v-if="selected.is_superuser" class="state-inline warning"><b>Unrestricted Tactical access.</b> Review this setting carefully before saving.</div>
          </article>

          <article class="card role-overview-card">
            <div class="cardhead"><div><span class="eyebrow">ACCESS SUMMARY</span><h3>Effective grants</h3></div></div>
            <div class="role-stat-grid">
              <div><span>Tactical</span><b>{{ permissionCount }}</b><small>of {{ tacticalPermissionTotal }}</small></div>
              <div><span>Extensions</span><b>{{ extensionPermissionCount }}</b><small>of {{ extensionPermissionTotal }}</small></div>
              <div><span>Assigned users</span><b>{{ selectedSummary?.user_count ?? 0 }}</b><small>accounts</small></div>
            </div>
            <div class="role-overview-links"><button class="btn" @click="setEditorTab('tactical')">Review Tactical permissions</button><button class="btn" @click="setEditorTab('extensions')">Review extension permissions</button></div>
          </article>
        </section>

        <template v-else>
          <div class="permission-toolbar card">
            <label class="permission-search"><span class="sr-only">Search permissions</span><input v-model="permissionQuery" placeholder="Search permissions…" /></label>
            <label class="permission-filter"><input v-model="enabledOnly" type="checkbox" /> Enabled only</label>
            <span class="spacer"></span>
            <span class="permission-summary mono" v-if="editorTab === 'tactical'">{{ permissionCount }}/{{ tacticalPermissionTotal }} enabled</span>
            <span class="permission-summary mono" v-else>{{ extensionPermissionCount }}/{{ extensionPermissionTotal }} enabled</span>
          </div>

          <div v-if="editorTab === 'tactical'" class="permission-stack">
            <article v-for="group in tacticalGroups" :key="group.name" class="card permission-section">
              <button class="permission-section-head" @click="toggleGroup(`tactical:${group.name}`)">
                <span class="permission-section-title"><span class="chevron" :class="{ collapsed: collapsedGroups[`tactical:${group.name}`] }">⌄</span><b>{{ group.name }}</b></span>
                <span class="permission-section-meta"><span class="mono">{{ group.enabled }} / {{ group.total }}</span><span class="permission-meter"><i :style="{ width: `${group.total ? (group.enabled / group.total) * 100 : 0}%` }"></i></span></span>
              </button>
              <div v-if="!collapsedGroups[`tactical:${group.name}`]" class="permission-section-body">
                <div class="permission-section-actions"><button class="textbtn" :disabled="capabilityResolved && !canManage" @click="setGroup(group,true)">Select all</button><button class="textbtn" :disabled="capabilityResolved && !canManage" @click="setGroup(group,false)">Clear</button></div>
                <label v-for="key in group.keys" :key="key" class="permission-row"><input v-model="selected[key]" type="checkbox" :disabled="capabilityResolved && !canManage" /><span class="permission-copy"><b>{{ permissionLabel(key) }}</b><code>{{ key }}</code></span></label>
              </div>
            </article>
            <div v-if="!tacticalGroups.length" class="card empty">No Tactical permissions match this filter.</div>
          </div>

          <div v-else class="permission-stack">
            <div v-if="!extensionCatalog.length" class="card empty">No first-class Tec-Tac extension permission groups are registered yet.</div>
            <article v-for="entry in extensionGroups" :key="`${entry.ext.id}:${entry.group.name}`" class="card permission-section extension-permission-section">
              <button class="permission-section-head" @click="toggleGroup(`extension:${entry.ext.id}:${entry.group.name}`)">
                <span class="permission-section-title"><span class="chevron" :class="{ collapsed: collapsedGroups[`extension:${entry.ext.id}:${entry.group.name}`] }">⌄</span><span><b>{{ entry.group.name }}</b><small>{{ entry.ext.id }} · v{{ entry.ext.version }}</small></span></span>
                <span class="permission-section-meta"><span class="mono">{{ entry.enabled }} / {{ entry.total }}</span><span class="permission-meter"><i :style="{ width: `${entry.total ? (entry.enabled / entry.total) * 100 : 0}%` }"></i></span></span>
              </button>
              <div v-if="!collapsedGroups[`extension:${entry.ext.id}:${entry.group.name}`]" class="permission-section-body">
                <div class="permission-section-actions"><button class="textbtn" :disabled="selected.is_superuser || (capabilityResolved && !canManage)" @click="setExtensionGroup(entry.group,true)">Select all</button><button class="textbtn" :disabled="selected.is_superuser || (capabilityResolved && !canManage)" @click="setExtensionGroup(entry.group,false)">Clear</button></div>
                <label v-for="code in entry.permissions" :key="code" class="permission-row"><input v-model="extensionPermissions[code]" type="checkbox" :disabled="selected.is_superuser || (capabilityResolved && !canManage)" /><span class="permission-copy"><b>{{ code.split('.').slice(-1)[0].replace(/[-_]/g,' ') }}</b><code>{{ code }}</code></span></label>
              </div>
            </article>
            <div v-if="extensionCatalog.length && !extensionGroups.length" class="card empty">No extension permissions match this filter.</div>
          </div>
        </template>

        <div class="role-actionbar">
          <div class="role-action-state"><span class="status-dot" :class="dirty ? 'warn' : 'ok'"></span><div><b>{{ selected.name }}</b><span>{{ dirty ? 'Unsaved role or permission changes' : 'All changes saved' }}</span></div></div>
          <div class="role-action-buttons"><button class="btn danger" :disabled="saving || (capabilityResolved && !canManage)" @click="removeRole">Delete role</button><button class="btn" :disabled="saving || !dirty" @click="discardChanges">Discard</button><button class="btn primary" :disabled="saving || !dirty || (capabilityResolved && !canManage)" @click="saveRole">{{ saving ? 'Saving…' : 'Save changes' }}</button></div>
        </div>
      </div>
      <div v-else class="card empty-editor">Select a role to manage permissions.</div>
    </div>
  </div>
</template>
