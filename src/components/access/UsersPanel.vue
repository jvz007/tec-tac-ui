<script setup>
import { computed, inject, onMounted, reactive, ref } from 'vue'
import { createUser, deleteUser, listRoles, listUsers, resetUserPassword, resetUserTotp, updateUser } from '../../access'

const state = inject('tecTacState')
const users = ref([])
const roles = ref([])
const loading = ref(true)
const error = ref('')
const denied = ref(false)
const search = ref('')
const editing = ref(null)
const creating = ref(false)
const saving = ref(false)
const passwordReset = ref('')

const createForm = reactive({ username:'', first_name:'', last_name:'', email:'', password:'', role:null })
const canManage = computed(() => state.context.capabilities?.manage_accounts !== false)
const capabilityResolved = computed(() => state.context.capabilities !== null)
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return users.value
  return users.value.filter((u) => [u.username,u.first_name,u.last_name,u.email].some((v) => String(v || '').toLowerCase().includes(q)))
})

function roleName(roleId) {
  return roles.value.find((r) => r.id === roleId)?.name || (roleId ? `Role ${roleId}` : 'No role')
}

async function load() {
  loading.value = true; error.value = ''; denied.value = false
  try {
    const [userData, roleData] = await Promise.all([listUsers(), listRoles().catch(() => [])])
    users.value = Array.isArray(userData) ? userData : []
    roles.value = Array.isArray(roleData) ? roleData : []
  } catch (err) {
    if (err.status === 403) denied.value = true
    else error.value = err.message || 'Unable to load Tactical users.'
  } finally { loading.value = false }
}

function beginEdit(user) { editing.value = { ...user }; creating.value = false; passwordReset.value = '' }
function closeEditor() { editing.value = null; creating.value = false; passwordReset.value = '' }

async function addUser() {
  saving.value = true; error.value = ''
  try {
    const payload = { ...createForm }
    if (!payload.role) delete payload.role
    await createUser(payload)
    Object.assign(createForm, { username:'', first_name:'', last_name:'', email:'', password:'', role:null })
    creating.value = false
    await load()
  } catch (err) { error.value = err.message || 'Unable to create user.' }
  finally { saving.value = false }
}

async function saveUser() {
  if (!editing.value) return
  saving.value = true; error.value = ''
  try {
    const { id, username, last_login, last_login_ip, social_accounts, ...payload } = editing.value
    await updateUser(id, payload)
    await load()
    editing.value = users.value.find((u) => u.id === id) ? { ...users.value.find((u) => u.id === id) } : null
  } catch (err) { error.value = err.message || 'Unable to update user.' }
  finally { saving.value = false }
}

async function removeUser() {
  if (!editing.value || !window.confirm(`Delete Tactical user ${editing.value.username}? This cannot be undone.`)) return
  saving.value = true; error.value = ''
  try { await deleteUser(editing.value.id); closeEditor(); await load() }
  catch (err) { error.value = err.message || 'Unable to delete user.' }
  finally { saving.value = false }
}

async function changePassword() {
  if (!editing.value || !passwordReset.value) return
  if (!window.confirm(`Reset the password for ${editing.value.username}?`)) return
  saving.value = true; error.value = ''
  try { await resetUserPassword(editing.value.id, passwordReset.value); passwordReset.value = '' }
  catch (err) { error.value = err.message || 'Unable to reset password.' }
  finally { saving.value = false }
}

async function resetTotp() {
  if (!editing.value || !window.confirm(`Reset 2FA for ${editing.value.username}? They must enroll again at next sign-in.`)) return
  saving.value = true; error.value = ''
  try { await resetUserTotp(editing.value.id) }
  catch (err) { error.value = err.message || 'Unable to reset 2FA.' }
  finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <div v-if="loading" class="callout mono">Loading Tactical users…</div>
  <div v-else-if="denied" class="state-inline denied"><b>Permission denied.</b> This Tactical role does not have <span class="mono">can_list_accounts</span>.</div>
  <div v-else>
    <div class="toolbar">
      <label class="compact-input"><span class="sr-only">Search users</span><input v-model="search" placeholder="Search users…" /></label>
      <span class="muted mono">{{ filtered.length }} / {{ users.length }} users</span>
      <span class="spacer"></span>
      <button class="btn primary" :disabled="capabilityResolved && !canManage" @click="creating = true; editing = null">+ Add user</button>
      <button class="btn" @click="load">Refresh</button>
    </div>
    <div v-if="error" class="auth-error">{{ error }}</div>
    <div v-if="capabilityResolved && !canManage" class="state-inline warning"><b>Read-only.</b> Your Tactical role can list accounts but does not have <span class="mono">can_manage_accounts</span>.</div>

    <div class="split-layout">
      <div class="tablewrap">
        <table>
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th></tr></thead>
          <tbody>
            <tr v-for="user in filtered" :key="user.id" class="clickrow" :class="{ selected: editing?.id === user.id }" @click="beginEdit(user)">
              <td><b>{{ user.username }}</b><span class="sub">{{ [user.first_name,user.last_name].filter(Boolean).join(' ') || user.email || '—' }}</span></td>
              <td>{{ roleName(user.role) }}</td>
              <td><span class="pill" :class="user.is_active ? 'ok' : 'warn'">{{ user.is_active ? 'active' : 'disabled' }}</span></td>
              <td class="mono smalltext">{{ user.last_login || '—' }}</td>
            </tr>
            <tr v-if="!filtered.length"><td colspan="4" class="empty">No users match the current filter.</td></tr>
          </tbody>
        </table>
      </div>

      <aside v-if="creating" class="editor-panel">
        <div class="cardhead"><div><span class="eyebrow">NEW USER</span><h3>Create Tactical user</h3></div><button class="btn sm ghost" @click="closeEditor">×</button></div>
        <label class="field"><span>Username</span><input v-model="createForm.username" autocomplete="off" /></label>
        <div class="field-grid"><label class="field"><span>First name</span><input v-model="createForm.first_name" /></label><label class="field"><span>Last name</span><input v-model="createForm.last_name" /></label></div>
        <label class="field"><span>Email</span><input v-model="createForm.email" type="email" /></label>
        <label class="field"><span>Initial password</span><input v-model="createForm.password" type="password" autocomplete="new-password" /></label>
        <label class="field"><span>Role</span><select v-model="createForm.role"><option :value="null">No role</option><option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option></select></label>
        <div class="editor-actions"><button class="btn primary" :disabled="saving || !createForm.username || !createForm.password || (capabilityResolved && !canManage)" @click="addUser">Create user</button><button class="btn" @click="closeEditor">Cancel</button></div>
      </aside>

      <aside v-else-if="editing" class="editor-panel">
        <div class="cardhead"><div><span class="eyebrow">TACTICAL USER</span><h3>{{ editing.username }}</h3></div><button class="btn sm ghost" @click="closeEditor">×</button></div>
        <div class="field-grid"><label class="field"><span>First name</span><input v-model="editing.first_name" :disabled="capabilityResolved && !canManage" /></label><label class="field"><span>Last name</span><input v-model="editing.last_name" :disabled="capabilityResolved && !canManage" /></label></div>
        <label class="field"><span>Email</span><input v-model="editing.email" type="email" :disabled="capabilityResolved && !canManage" /></label>
        <label class="field"><span>Role</span><select v-model="editing.role" :disabled="capabilityResolved && !canManage"><option :value="null">No role</option><option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option></select></label>
        <label class="checkline"><input v-model="editing.is_active" type="checkbox" :disabled="capabilityResolved && !canManage" /><span>Account active</span></label>
        <label class="checkline"><input v-model="editing.block_dashboard_login" type="checkbox" :disabled="capabilityResolved && !canManage" /><span>Block dashboard login</span></label>
        <div class="editor-actions"><button class="btn primary" :disabled="saving || (capabilityResolved && !canManage)" @click="saveUser">Save user</button><button class="btn danger" :disabled="saving || (capabilityResolved && !canManage)" @click="removeUser">Delete</button></div>
        <div class="section-divider"><span>Credential actions</span></div>
        <label class="field"><span>New password</span><input v-model="passwordReset" type="password" autocomplete="new-password" /></label>
        <div class="editor-actions"><button class="btn" :disabled="saving || !passwordReset || (capabilityResolved && !canManage)" @click="changePassword">Reset password</button><button class="btn warnbtn" :disabled="saving || (capabilityResolved && !canManage)" @click="resetTotp">Reset 2FA</button></div>
        <p class="field-help">Tactical protects the installation/root user from destructive UI changes. Any such rejection is returned by Tactical and shown here.</p>
      </aside>

      <aside v-else class="editor-panel empty-editor"><span class="eyebrow">USER DETAIL</span><p>Select a user to inspect or edit the account.</p></aside>
    </div>
  </div>
</template>
