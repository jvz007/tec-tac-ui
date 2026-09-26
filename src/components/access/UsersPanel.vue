<script setup>
import { computed, inject, onMounted, reactive, ref } from 'vue'
import { createUser, deleteUser, getUserMfaRecovery, invalidateUserMfaBackupCodes, listRoles, listUsers, resetUserPassword, resetUserTotp, updateUser } from '../../access'

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
const mfaRecovery = ref(null)
const mfaLoading = ref(false)
const mfaError = ref('')
const mfaNotice = ref('')
const showInvalidateRecovery = ref(false)

const createForm = reactive({ username:'', first_name:'', last_name:'', email:'', password:'', role:null })
const canManage = computed(() => state.context.capabilities?.manage_accounts !== false)
const capabilityResolved = computed(() => state.context.capabilities !== null)
const isCurrentUser = computed(() => Boolean(editing.value && state.context.user?.username === editing.value.username))
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

function beginEdit(user) {
  editing.value = { ...user }
  creating.value = false
  passwordReset.value = ''
  mfaRecovery.value = null
  mfaError.value = ''
  mfaNotice.value = ''
  showInvalidateRecovery.value = false
  void loadMfaRecovery(user)
}
function closeEditor() {
  editing.value = null
  creating.value = false
  passwordReset.value = ''
  mfaRecovery.value = null
  mfaError.value = ''
  mfaNotice.value = ''
  showInvalidateRecovery.value = false
}

async function loadMfaRecovery(user = editing.value) {
  if (!user || (capabilityResolved.value && !canManage.value)) {
    mfaRecovery.value = null
    mfaError.value = ''
    mfaLoading.value = false
    return
  }
  const targetId = user.id
  mfaLoading.value = true
  mfaError.value = ''
  try {
    const data = await getUserMfaRecovery(targetId)
    if (editing.value?.id === targetId) mfaRecovery.value = data || null
  } catch (err) {
    if (editing.value?.id === targetId) mfaError.value = err?.message || 'Unable to load MFA recovery status.'
  } finally {
    if (editing.value?.id === targetId) mfaLoading.value = false
  }
}

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
  saving.value = true; error.value = ''; mfaNotice.value = ''
  try {
    await resetUserTotp(editing.value.id)
    mfaNotice.value = '2FA reset. Recovery codes bound to the previous authenticator are no longer valid.'
    await loadMfaRecovery(editing.value)
  }
  catch (err) { error.value = err.message || 'Unable to reset 2FA.' }
  finally { saving.value = false }
}

function requestInvalidateRecovery() {
  if (!editing.value || !mfaRecovery.value?.status?.configured || !mfaRecovery.value?.can_invalidate) return
  showInvalidateRecovery.value = true
}

async function invalidateRecovery() {
  if (!editing.value) return
  saving.value = true; mfaError.value = ''; mfaNotice.value = ''
  try {
    const data = await invalidateUserMfaBackupCodes(editing.value.id)
    mfaRecovery.value = { ...mfaRecovery.value, status: data?.status || mfaRecovery.value?.status }
    mfaNotice.value = `${data?.invalidated ?? 0} backup code${data?.invalidated === 1 ? '' : 's'} invalidated.`
    showInvalidateRecovery.value = false
  } catch (err) {
    mfaError.value = err?.message || 'Unable to invalidate backup codes.'
  } finally { saving.value = false }
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

        <div class="section-divider"><span>MFA & recovery</span></div>
        <div v-if="capabilityResolved && !canManage" class="state-inline warning"><b>Status unavailable.</b> MFA recovery administration requires <span class="mono">can_manage_accounts</span>.</div>
        <div v-else-if="mfaLoading" class="callout mono">Loading MFA recovery status…</div>
        <div v-else-if="mfaError" class="state-inline denied" role="alert"><b>MFA recovery status failed.</b> {{ mfaError }}</div>
        <template v-else-if="mfaRecovery?.status">
          <dl class="kvlist">
            <dt>TOTP</dt><dd>{{ mfaRecovery.status.totp_configured ? 'configured' : 'not configured' }}</dd>
            <dt>Backup codes</dt><dd>{{ mfaRecovery.status.configured ? 'configured' : 'not created' }}</dd>
            <dt>Available</dt><dd class="mono">{{ mfaRecovery.status.unused ?? 0 }} / {{ mfaRecovery.status.total ?? 0 }}</dd>
            <dt>Used</dt><dd class="mono">{{ mfaRecovery.status.used ?? 0 }}</dd>
            <dt>Last generated</dt><dd class="mono smalltext">{{ mfaRecovery.status.generated_at || '—' }}</dd>
          </dl>
          <div v-if="mfaRecovery.status.sso_user" class="state-inline warning"><b>SSO managed.</b> Tec-Tac backup codes are not available for this account.</div>
          <div v-else-if="!mfaRecovery.status.totp_configured" class="state-inline warning"><b>Authenticator enrollment required.</b> Backup codes can only be created after TOTP is configured.</div>
          <div v-else-if="!mfaRecovery.status.configured" class="state-inline"><b>No recovery set exists.</b> {{ isCurrentUser ? 'Create one from the MFA & recovery tab.' : 'The user can create their first set from Access → MFA & recovery after signing in.' }}</div>
          <div v-else class="state-inline"><b>Recovery set active.</b> Creation and rotation remain self-service because they require the user’s current password and TOTP proof.</div>
          <div v-if="mfaNotice" class="state-inline"><b>Updated.</b> {{ mfaNotice }}</div>
          <div class="editor-actions">
            <button class="btn danger" :disabled="saving || !mfaRecovery.status.configured || !mfaRecovery.can_invalidate" @click="requestInvalidateRecovery">Invalidate backup codes</button>
            <button class="btn" :disabled="mfaLoading" @click="loadMfaRecovery()">Refresh MFA status</button>
          </div>
          <p v-if="!mfaRecovery.can_invalidate" class="field-help">This protected/root account requires effective superuser authority for destructive MFA recovery actions.</p>
        </template>
        <p class="field-help">Tactical protects the installation/root user from destructive UI changes. Tec-Tac never lets an administrator generate or reveal another user's backup codes.</p>
      </aside>

      <aside v-else class="editor-panel empty-editor"><span class="eyebrow">USER DETAIL</span><p>Select a user to inspect or edit the account.</p></aside>
    </div>

    <div v-if="showInvalidateRecovery && editing" class="modal-backdrop" @click.self="showInvalidateRecovery = false">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="invalidate-recovery-title">
        <div class="cardhead">
          <div><span class="eyebrow">MFA RECOVERY</span><h3 id="invalidate-recovery-title">Invalidate backup codes</h3></div>
          <button class="btn sm ghost" :disabled="saving" aria-label="Close" @click="showInvalidateRecovery = false">×</button>
        </div>
        <div class="state-inline warning"><b>{{ editing.username }}</b> will immediately lose every remaining Tec-Tac backup code. This does not reset their authenticator or password.</div>
        <dl class="kvlist">
          <dt>Target</dt><dd class="mono">{{ editing.username }}</dd>
          <dt>Available codes</dt><dd class="mono">{{ mfaRecovery?.status?.unused ?? 0 }}</dd>
          <dt>Total set</dt><dd class="mono">{{ mfaRecovery?.status?.total ?? 0 }}</dd>
        </dl>
        <div class="modal-actions">
          <button class="btn danger" :disabled="saving" @click="invalidateRecovery">{{ saving ? 'Invalidating…' : 'Invalidate codes' }}</button>
          <button class="btn" :disabled="saving" @click="showInvalidateRecovery = false">Cancel</button>
        </div>
      </section>
    </div>
  </div>
</template>
