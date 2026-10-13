<script setup>
import { computed, inject, onMounted, ref } from 'vue'
import { useConfirm } from '../../confirm-dialog'
import { createKeyedLatestRequestGate } from '../../latest-request-gate'
import { addSsoProvider, deleteSsoProvider, getSsoSettings, listRoles, listSsoProviders, saveSsoSettings, updateSsoProvider } from '../../access'
import { nextTabIndex } from '../../dialog-tabs'
import {
  blockingWarningNeeded,
  buildProviderPayload,
  buildSettingsPayload,
  canAdministerSso,
  isRedacted,
  lockoutDetail,
  providerFormError,
} from '../../sso-admin'

// 0.12.100 (Core 1.17.28): single sign-on providers and the two sign-in settings. Everyone with can_list_accounts reads the list
// (the secret shows as [REDACTED] unless they are an effective superuser). Only a superuser sees a control: Core refuses everyone
// else with 403 and a deny row (AD-12). A lock-out refusal (409, sso_lockout_guard) shows Core's sentence; nothing changes.
const state = inject('tecTacState')
const confirmAction = useConfirm()
const gate = createKeyedLatestRequestGate(['sso'])

const isSuperuser = computed(() => canAdministerSso(state.context))
const providers = ref([])
const roles = ref([])
const rolesAvailable = ref(false)
const stored = ref({ sso_enabled: false, block_local_user_logon: false })
const draft = ref({ sso_enabled: false, block_local_user_logon: false })
const loading = ref(true)
const denied = ref(false)
const error = ref('')
const notice = ref('')
const settingsError = ref('')
const settingsSaving = ref(false)
const providerDialog = ref(null)
const tabIndex = ref(0)
const providerTabs = [
  { id: 'provider', label: 'Provider' },
  { id: 'role', label: 'Sign-in role' },
]

function roleLabel(id) {
  if (id === null || id === undefined || id === '') return 'No role'
  return roles.value.find((role) => role.id === id)?.name || `Role ${id}`
}

function errorMessage(err, fallback) {
  return lockoutDetail(err) || err?.message || fallback
}

async function loadRoles() {
  try {
    const data = await listRoles()
    roles.value = Array.isArray(data) ? data : []
    rolesAvailable.value = true
  } catch {
    roles.value = []
    rolesAvailable.value = false
  }
}

async function load() {
  const request = gate.begin('sso')
  loading.value = true
  error.value = ''
  denied.value = false
  try {
    const [providerData, settingsData] = await Promise.all([listSsoProviders(), getSsoSettings()])
    if (!gate.isCurrent('sso', request)) return
    providers.value = Array.isArray(providerData) ? providerData : []
    stored.value = buildSettingsPayload(settingsData)
    draft.value = { ...stored.value }
  } catch (err) {
    if (!gate.isCurrent('sso', request)) return
    if (err.status === 403) denied.value = true
    else error.value = errorMessage(err, 'Unable to load single sign-on.')
  } finally {
    if (gate.isCurrent('sso', request)) loading.value = false
  }
}

// Tactical stores the settings and may clear the local-sign-in block itself (its failsafe when SSO is off). The stored values win.
async function reloadSettings() {
  try {
    const data = buildSettingsPayload(await getSsoSettings())
    stored.value = data
    draft.value = { ...data }
  } catch (err) {
    draft.value = { ...stored.value }
    settingsError.value = settingsError.value || errorMessage(err, 'Unable to read the stored settings.')
  }
}

async function saveSettings() {
  if (!isSuperuser.value || settingsSaving.value) return
  settingsError.value = ''
  notice.value = ''
  const after = buildSettingsPayload(draft.value)
  if (blockingWarningNeeded(stored.value, after)) {
    const confirmed = await confirmAction({
      question: 'Block local sign-in for everyone?',
      detail: 'Everyone must then sign in through single sign-on. Only a local superuser account can still sign in with a password.',
      danger: true,
    })
    if (!confirmed) return
  }
  settingsSaving.value = true
  try {
    await saveSsoSettings(after)
    notice.value = 'Single sign-on settings saved.'
  } catch (err) {
    settingsError.value = errorMessage(err, 'Unable to save the settings.')
  } finally {
    await reloadSettings()
    settingsSaving.value = false
  }
}

function openAdd() {
  if (!isSuperuser.value) return
  notice.value = ''
  tabIndex.value = 0
  providerDialog.value = { mode: 'add', id: null, name: '', client_id: '', secret: '', server_url: '', role: null, callback_url: '', error: '', saving: false }
}

function openEdit(row) {
  if (!isSuperuser.value) return
  notice.value = ''
  tabIndex.value = 0
  providerDialog.value = {
    mode: 'edit',
    id: row.id,
    name: row.name || '',
    client_id: row.client_id || '',
    secret: isRedacted(row.secret) ? '' : (row.secret || ''),
    server_url: row.server_url || '',
    role: row.role ?? null,
    callback_url: row.callback_url || '',
    error: '',
    saving: false,
  }
}

function closeProvider() {
  if (providerDialog.value?.saving) return
  providerDialog.value = null
}

async function saveProvider() {
  const draftProvider = providerDialog.value
  if (!isSuperuser.value || !draftProvider || draftProvider.saving) return
  const problem = providerFormError(draftProvider, draftProvider.mode)
  if (problem) {
    draftProvider.error = problem
    return
  }
  draftProvider.saving = true
  draftProvider.error = ''
  try {
    if (draftProvider.mode === 'add') {
      await addSsoProvider(buildProviderPayload(draftProvider, 'add'))
      notice.value = `Added ${draftProvider.name.trim()}.`
    } else {
      await updateSsoProvider(draftProvider.id, buildProviderPayload(draftProvider, 'edit'))
      notice.value = `Saved ${draftProvider.name}.`
    }
    providerDialog.value = null
    await load()
  } catch (err) {
    if (providerDialog.value === draftProvider) {
      draftProvider.error = errorMessage(err, 'Unable to save the provider.')
      draftProvider.saving = false
    }
  }
}

async function removeProvider(row) {
  if (!isSuperuser.value) return
  const confirmed = await confirmAction({
    question: `Delete the sign-in provider ${row.name}?`,
    target: row.name,
    detail: 'People can no longer sign in through it.',
    danger: true,
  })
  if (!confirmed) return
  error.value = ''
  notice.value = ''
  try {
    await deleteSsoProvider(row.id)
    notice.value = `Deleted ${row.name}.`
    await load()
  } catch (err) {
    error.value = errorMessage(err, 'Unable to delete the provider.')
  }
}

function onTabKey(event) {
  const next = nextTabIndex(tabIndex.value, providerTabs.length, event.key)
  if (next < 0) return
  event.preventDefault()
  tabIndex.value = next
  event.currentTarget?.querySelectorAll('[role="tab"]')[next]?.focus?.()
}

onMounted(async () => {
  await Promise.all([load(), loadRoles()])
})
</script>

<template>
  <div v-if="loading" class="callout mono">Loading single sign-on…</div>
  <div v-else-if="denied" class="state-inline denied"><b>Permission denied.</b> This Tactical role does not have <span class="mono">can_list_accounts</span>.</div>
  <div v-else>
    <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
    <div v-if="notice" class="state-inline" role="status">{{ notice }}</div>
    <div v-if="!isSuperuser" class="state-inline warning"><b>Read-only.</b> Only a Tec-Tac superuser can add, change, delete or disconnect sign-in providers, or change these settings.</div>

    <div class="cardhead"><div><span class="eyebrow">SINGLE SIGN-ON</span><h3>Sign-in settings</h3></div></div>
    <div v-if="settingsError" class="auth-error" role="alert">{{ settingsError }}</div>
    <template v-if="isSuperuser">
      <label class="checkline"><input v-model="draft.sso_enabled" type="checkbox" :disabled="settingsSaving" /><span>Allow sign-in with single sign-on</span></label>
      <label class="checkline"><input v-model="draft.block_local_user_logon" type="checkbox" :disabled="settingsSaving" /><span>Block local sign-in with passwords</span></label>
      <p class="field-help">If single sign-on is off, Tactical clears the local sign-in block when you save. The stored values show after every save.</p>
      <div class="editor-actions"><button class="btn primary" :disabled="settingsSaving" @click="saveSettings">{{ settingsSaving ? 'Saving…' : 'Save settings' }}</button></div>
    </template>
    <dl v-else class="kvlist">
      <dt>Single sign-on</dt><dd>{{ stored.sso_enabled ? 'On' : 'Off' }}</dd>
      <dt>Local sign-in blocked</dt><dd>{{ stored.block_local_user_logon ? 'Yes' : 'No' }}</dd>
    </dl>

    <div class="toolbar">
      <span class="muted mono">{{ providers.length }} {{ providers.length === 1 ? 'provider' : 'providers' }}</span>
      <span class="spacer"></span>
      <button v-if="isSuperuser" class="btn primary" @click="openAdd">+ Add provider</button>
      <button class="btn" @click="load">Refresh</button>
    </div>

    <div class="tablewrap table-clean">
      <table>
        <thead><tr><th>Provider</th><th>Client ID</th><th>Secret</th><th>Server URL</th><th>Role</th><th>Callback URL</th><th v-if="isSuperuser"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          <tr v-for="row in providers" :key="row.id">
            <td class="cell-truncate" :title="row.name"><b>{{ row.name }}</b><span class="sub mono">{{ row.provider_id }}</span></td>
            <td class="cell-truncate mono" :title="row.client_id">{{ row.client_id || '—' }}</td>
            <td class="cell-truncate mono" :title="row.secret">{{ row.secret || '—' }}</td>
            <td class="cell-truncate mono" :title="row.server_url">{{ row.server_url || '—' }}</td>
            <td class="cell-truncate" :title="roleLabel(row.role)">{{ roleLabel(row.role) }}</td>
            <td class="cell-truncate mono" :title="row.callback_url">{{ row.callback_url || '—' }}</td>
            <td v-if="isSuperuser" class="row-actions">
              <button class="btn sm" @click="openEdit(row)">Edit</button>
              <button class="btn sm danger" @click="removeProvider(row)">Delete</button>
            </td>
          </tr>
          <tr v-if="!providers.length"><td :colspan="isSuperuser ? 7 : 6" class="table-empty">No sign-in providers yet. Add one to let people sign in with your identity provider.</td></tr>
        </tbody>
      </table>
    </div>

    <div v-if="isSuperuser && providerDialog" class="modal-backdrop" @click.self="closeProvider">
      <section class="modal-panel modal-wide" role="dialog" aria-modal="true" aria-labelledby="sso-provider-title">
        <div class="cardhead">
          <div><span class="eyebrow">SIGN-IN PROVIDER</span><h3 id="sso-provider-title">{{ providerDialog.mode === 'add' ? 'Add sign-in provider' : `Edit ${providerDialog.name}` }}</h3></div>
          <button class="btn sm ghost" :disabled="providerDialog.saving" aria-label="Close" @click="closeProvider">×</button>
        </div>
        <div class="dialog-tabs" role="tablist" aria-label="Provider sections" @keydown="onTabKey">
          <button v-for="(item, index) in providerTabs" :key="item.id" :id="`sso-tab-${item.id}`" type="button" role="tab" :aria-selected="tabIndex === index ? 'true' : 'false'" :aria-controls="`sso-panel-${item.id}`" :tabindex="tabIndex === index ? 0 : -1" @click="tabIndex = index">{{ item.label }}</button>
        </div>
        <div v-if="providerDialog.error" class="auth-error" role="alert">{{ providerDialog.error }}</div>

        <div v-if="tabIndex === 0" id="sso-panel-provider" role="tabpanel" aria-labelledby="sso-tab-provider">
          <label v-if="providerDialog.mode === 'add'" class="field"><span>Name</span><input v-model="providerDialog.name" autocomplete="off" :disabled="providerDialog.saving" /></label>
          <p v-else class="field-help">Name: <b>{{ providerDialog.name }}</b>. Tactical does not allow a rename, so add a new provider to use another name.</p>
          <label class="field"><span>Client ID</span><input v-model="providerDialog.client_id" autocomplete="off" :disabled="providerDialog.saving" /></label>
          <label class="field"><span>Client secret</span><input v-model="providerDialog.secret" type="password" autocomplete="new-password" :placeholder="providerDialog.mode === 'edit' ? 'Leave as it is to keep the current secret' : ''" :disabled="providerDialog.saving" /></label>
          <label class="field"><span>Server URL</span><input v-model="providerDialog.server_url" autocomplete="off" placeholder="https://" :disabled="providerDialog.saving" /></label>
          <p v-if="providerDialog.mode === 'edit' && providerDialog.callback_url" class="field-help">Callback URL to register with your identity provider: <span class="mono">{{ providerDialog.callback_url }}</span></p>
        </div>

        <div v-else id="sso-panel-role" role="tabpanel" aria-labelledby="sso-tab-role">
          <label class="field">
            <span>Role for a new account</span>
            <select v-model="providerDialog.role" :disabled="providerDialog.saving">
              <option :value="null">No role</option>
              <option v-if="providerDialog.role !== null && !roles.some((r) => r.id === providerDialog.role)" :value="providerDialog.role">Role {{ providerDialog.role }}</option>
              <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </label>
          <p class="field-help">Tactical gives the role to an account the first time someone signs in through this provider. Existing accounts keep their role.</p>
          <p v-if="!rolesAvailable" class="field-help">Your role cannot list Tactical roles, so a role shows as its number.</p>
        </div>

        <div class="modal-actions">
          <button class="btn primary" :disabled="providerDialog.saving" @click="saveProvider">{{ providerDialog.saving ? 'Saving…' : (providerDialog.mode === 'add' ? 'Add provider' : 'Save provider') }}</button>
          <button class="btn" :disabled="providerDialog.saving" @click="closeProvider">Cancel</button>
        </div>
      </section>
    </div>
  </div>
</template>
