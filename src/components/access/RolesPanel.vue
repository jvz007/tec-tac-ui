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
const OWNER = 'roles-editor'

const canManage = computed(() => state.context.capabilities?.manage_roles !== false)
const capabilityResolved = computed(() => state.context.capabilities !== null)
const filteredRoles = computed(() => roles.value.filter((r) => !query.value || r.name.toLowerCase().includes(query.value.toLowerCase())))
const permissionCount = computed(() => TACTICAL_PERMISSION_GROUPS.reduce((n,g) => n + g.keys.filter((k) => selected.value?.[k]).length, 0))

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
function beforeUnload(event) { if (!dirty.value) return; event.preventDefault(); event.returnValue = '' }

onMounted(() => { window.addEventListener('beforeunload', beforeUnload); loadRoles() })
onBeforeUnmount(() => { window.removeEventListener('beforeunload', beforeUnload) })
</script>

<template>
  <div v-if="loading" class="callout mono">Loading Tactical roles…</div>
  <div v-else-if="denied" class="state-inline denied"><b>Permission denied.</b> This Tactical role does not have <span class="mono">can_list_roles</span>.</div>
  <div v-else>
    <div class="toolbar">
      <label class="compact-input"><span class="sr-only">Search roles</span><input v-model="query" placeholder="Search roles…" /></label>
      <span class="muted mono">{{ roles.length }} roles</span><span class="spacer"></span>
      <input v-model="newRoleName" class="inline-create" placeholder="New role name" @keyup.enter="addRole" />
      <button class="btn primary" :disabled="saving || !newRoleName.trim() || (capabilityResolved && !canManage)" @click="addRole">+ Create role</button>
    </div>
    <div v-if="error" class="auth-error">{{ error }}</div>
    <div v-if="capabilityResolved && !canManage" class="state-inline warning"><b>Read-only.</b> Your Tactical role can list roles but does not have <span class="mono">can_manage_roles</span>.</div>
    <div v-if="dirty" class="unsaved-banner" role="status">
      <div><span class="eyebrow">UNSAVED CHANGES</span><b>{{ selected.name }}</b><span>Role or permission changes have not been saved.</span></div>
      <div class="row compact-row"><button class="btn primary sm" :disabled="saving" @click="saveRole">Save now</button><button class="btn sm" :disabled="saving" @click="discardChanges">Discard</button></div>
    </div>

    <div class="role-layout">
      <aside ref="roleList" class="role-list card">
        <div class="listrow role-row" v-for="role in filteredRoles" :key="role.id" :data-role-id="role.id" :class="{ selected: selected?.id === role.id }" @click="chooseRole(role.id)">
          <span class="dot" :class="role.is_superuser ? 'warn' : 'ok'"></span><div><b>{{ role.name }}</b><span class="sub">{{ role.user_count }} user{{ role.user_count === 1 ? '' : 's' }}</span></div><span class="mono">#{{ role.id }}</span>
        </div>
        <div v-if="!filteredRoles.length" class="empty">No matching roles.</div>
      </aside>

      <div v-if="selected" class="role-detail">
        <article class="card mb">
          <div class="cardhead"><div><span class="eyebrow">ROLE ID {{ selected.id }}</span><h3>{{ selected.name }}</h3></div><span class="pill" :class="dirty ? 'warn' : ''">{{ dirty ? 'UNSAVED' : `${permissionCount} Tactical grants` }}</span></div>
          <div class="field-grid"><label class="field"><span>Role name</span><input v-model="selected.name" :disabled="capabilityResolved && !canManage" /></label><label class="checkline danger-zone"><input v-model="selected.is_superuser" type="checkbox" :disabled="capabilityResolved && !canManage" /><span>Superuser role</span></label></div>
          <p v-if="selected.is_superuser" class="state-inline warning"><b>Superuser role.</b> Tactical treats this role as unrestricted. Individual permission switches are informational for effective access.</p>
        </article>

        <div class="permission-groups">
          <article v-for="group in TACTICAL_PERMISSION_GROUPS" :key="group.name" class="card permission-group">
            <div class="cardhead"><h3>{{ group.name }}</h3><div class="group-actions"><button class="textbtn" @click="setGroup(group,true)" :disabled="capabilityResolved && !canManage">all</button><button class="textbtn" @click="setGroup(group,false)" :disabled="capabilityResolved && !canManage">none</button></div></div>
            <label v-for="key in group.keys" :key="key" class="permission-line" v-show="key in selected"><input v-model="selected[key]" type="checkbox" :disabled="capabilityResolved && !canManage" /><span>{{ permissionLabel(key) }}</span><code>{{ key }}</code></label>
          </article>
        </div>

        <article class="card mt">
          <div class="cardhead"><div><span class="eyebrow">TEC-TAC EXTENSIONS</span><h3>Extension permissions</h3></div><span class="pill">{{ Object.keys(extensionPermissions).length }}</span></div>
          <div v-if="!extensionCatalog.length" class="empty">No first-class Tec-Tac extension permission groups are registered yet. This area is ready for module discovery.</div>
          <template v-for="ext in extensionCatalog" :key="ext.id">
            <div v-for="group in ext.groups" :key="`${ext.id}:${group.name}`" class="ext-perm-group">
              <div class="listrow"><b>{{ ext.id }} / {{ group.name }}</b><span class="mono">v{{ ext.version }}</span></div>
              <label v-for="code in group.permissions" :key="code" class="permission-line"><input v-model="extensionPermissions[code]" type="checkbox" :disabled="selected.is_superuser || (capabilityResolved && !canManage)" /><span class="mono">{{ code }}</span></label>
            </div>
          </template>
        </article>

        <div class="sticky-actions"><button class="btn primary" :disabled="saving || !dirty || (capabilityResolved && !canManage)" @click="saveRole">{{ saving ? 'Saving…' : 'Save role & permissions' }}</button><button class="btn danger" :disabled="saving || (capabilityResolved && !canManage)" @click="removeRole">Delete role</button></div>
      </div>
      <div v-else class="card empty-editor">Select a role to manage permissions.</div>
    </div>
  </div>
</template>
