<script setup>
import { computed, inject, onMounted, reactive, ref } from 'vue'
import { useConfirm } from '../../confirm-dialog'
import { copyTextWithFeedback } from '../../copy-feedback'
import { createKeyedLatestRequestGate } from '../../latest-request-gate'
import { createLoadPhase, finishLoadPhase, startLoadPhase } from '../../load-phase'
import { createApiKey, deleteApiKey, listApiKeys, listUsers, updateApiKey } from '../../access'
import {
  API_KEY_NAME_MAX,
  apiKeyErrorText,
  apiKeyNameError,
  buildCreatePayload,
  buildUpdatePayload,
  canManageApiKeys,
  expiryFromLocal,
  expiryToLocal,
  findCreatedKey,
  isRedacted,
  normalizeApiKeys,
  selfOwner,
} from '../../api-keys'

// 0.12.100 (Core 1.17.26): Tactical's API keys. The list needs can_list_api_keys; the key value, Add, Edit and Delete need
// can_manage_api_keys (AD-12: hidden, and Core and Tactical refuse the rest). The key value lives only in component state:
// never in storage, a toast, the console or a notice.
const state = inject('tecTacState')
const confirmAction = useConfirm()
const gate = createKeyedLatestRequestGate(['keys'])

const keys = ref([])
const users = ref([])
const usersAvailable = ref(false)
// 0.12.101: loading is the first load only; refreshing marks a later load, and the list controls wait for it.
const phase = reactive(createLoadPhase())
const error = ref('')
const denied = ref(false)
const search = ref('')
const notice = ref('')
const revealed = ref(new Set())
const editor = ref(null)
const oneTime = ref(null)
const oneTimeMessage = ref('')

const canManage = computed(() => canManageApiKeys(state.context))
// 0.12.101: the create default is the person's own id, only when Core sent a valid one (no guess).
const self = computed(() => selfOwner(state.context))
// A role that cannot list Tactical users creates a key only for its own account, so it needs that id.
const createBlocked = computed(() => !usersAvailable.value && !self.value)
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return keys.value
  return keys.value.filter((row) => [row.name, row.username].some((value) => String(value || '').toLowerCase().includes(q)))
})

function formatExpiry(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? String(iso) : date.toLocaleString()
}

async function load() {
  const request = gate.begin('keys')
  startLoadPhase(phase)
  error.value = ''
  denied.value = false
  try {
    const data = await listApiKeys()
    if (!gate.isCurrent('keys', request)) return
    keys.value = normalizeApiKeys(data)
  } catch (err) {
    if (!gate.isCurrent('keys', request)) return
    if (err.status === 403) denied.value = true
    else error.value = apiKeyErrorText(err, 'Unable to load API keys.')
  } finally {
    if (gate.isCurrent('keys', request)) finishLoadPhase(phase)
  }
}

// The owner picker needs Tactical's user list. Without it (a role that cannot list accounts) the owner stays the signed-in user.
async function loadUsers() {
  try {
    const data = await listUsers()
    users.value = Array.isArray(data) ? data.filter((u) => u && u.id !== undefined).map((u) => ({ id: u.id, username: u.username || `User ${u.id}` })) : []
    usersAvailable.value = true
  } catch {
    users.value = []
    usersAvailable.value = false
  }
}

function openCreate() {
  if (createBlocked.value) return
  notice.value = ''
  oneTime.value = null
  editor.value = {
    mode: 'create',
    id: null,
    name: '',
    ownerId: self.value?.id ?? null,
    ownerLabel: self.value?.username || '',
    expires: '',
    error: '',
    saving: false,
  }
}

function openEdit(row) {
  notice.value = ''
  editor.value = {
    mode: 'edit',
    id: row.id,
    name: row.name,
    ownerId: row.user,
    ownerLabel: row.username,
    expires: expiryToLocal(row.expiration),
    error: '',
    saving: false,
  }
}

function closeEditor() {
  if (editor.value?.saving) return
  editor.value = null
}

function closeOneTime() {
  oneTime.value = null
  oneTimeMessage.value = ''
}

async function saveEditor() {
  const draft = editor.value
  if (!draft || draft.saving) return
  const nameError = apiKeyNameError(draft.name)
  if (nameError) { draft.error = nameError; return }
  if (draft.ownerId === null || draft.ownerId === undefined || draft.ownerId === '') {
    draft.error = 'Choose an owner for the key.'
    return
  }
  const expiry = expiryFromLocal(draft.expires)
  if (expiry.error) { draft.error = expiry.error; return }

  draft.saving = true
  draft.error = ''
  try {
    const input = { name: draft.name, ownerId: draft.ownerId, expiration: expiry.iso }
    if (draft.mode === 'create') {
      const payload = buildCreatePayload(input)
      await createApiKey(payload)
      // Tactical never returns the key on create. Read the list again and find the row by name and owner.
      await load()
      const created = findCreatedKey(keys.value, payload.name, payload.user)
      editor.value = null
      oneTimeMessage.value = ''
      oneTime.value = {
        name: payload.name,
        owner: created?.username || self.value?.username || '',
        key: created && !isRedacted(created.key) ? created.key : '',
        note: !created
          ? 'The key was saved. Find it in the list below.'
          : (isRedacted(created.key) ? 'Its value is hidden by account protection.' : ''),
      }
    } else {
      const payload = buildUpdatePayload(input)
      await updateApiKey(draft.id, payload)
      editor.value = null
      notice.value = `Saved ${payload.name}.`
      await load()
    }
  } catch (err) {
    if (editor.value === draft) {
      draft.error = apiKeyErrorText(err)
      draft.saving = false
    }
  }
}

async function removeKey(row) {
  const confirmed = await confirmAction({
    question: `Delete the API key ${row.name}?`,
    target: row.name,
    detail: 'Anything that uses this key stops working.',
    danger: true,
  })
  if (!confirmed) return
  error.value = ''
  notice.value = ''
  try {
    await deleteApiKey(row.id)
    if (editor.value?.id === row.id) editor.value = null
    notice.value = `Deleted ${row.name}.`
    await load()
  } catch (err) {
    error.value = apiKeyErrorText(err, 'Unable to delete the key.')
  }
}

function toggleReveal(id) {
  const next = new Set(revealed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  revealed.value = next
}

async function copyKey(row) {
  if (!canManage.value || isRedacted(row.key) || !row.key) return
  const result = await copyTextWithFeedback(row.key, { failureMessage: 'Could not copy the key.' })
  notice.value = result.copied ? 'Key copied.' : result.error
}

async function copyOneTime() {
  if (!oneTime.value?.key) return
  const result = await copyTextWithFeedback(oneTime.value.key, { failureMessage: 'Could not copy the key.' })
  oneTimeMessage.value = result.copied ? 'Key copied.' : result.error
}

onMounted(async () => {
  const tasks = [load()]
  if (canManage.value) tasks.push(loadUsers())
  await Promise.all(tasks)
})
</script>

<template>
  <div v-if="phase.loading" class="callout mono">Loading API keys…</div>
  <div v-else-if="denied" class="state-inline denied"><b>Permission denied.</b> This Tactical role does not have <span class="mono">can_list_api_keys</span>.</div>
  <div v-else>
    <div class="toolbar">
      <label class="compact-input"><span class="sr-only">Search API keys</span><input v-model="search" placeholder="Search API keys…" /></label>
      <span class="muted mono">{{ filtered.length }} / {{ keys.length }} keys</span>
      <span v-if="phase.refreshing" class="muted mono" role="status">Refreshing…</span>
      <span class="spacer"></span>
      <button v-if="canManage" class="btn primary" :disabled="phase.refreshing || createBlocked" @click="openCreate">+ Add API key</button>
      <button class="btn" :disabled="phase.refreshing" @click="load">Refresh</button>
    </div>
    <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
    <div v-if="notice" class="state-inline" role="status">{{ notice }}</div>
    <div v-if="!canManage" class="state-inline warning"><b>Read-only.</b> Your Tactical role can list API keys but does not have <span class="mono">can_manage_api_keys</span>, so the key values stay hidden.</div>
    <p v-if="canManage && createBlocked" class="field-help">Your account id is not available, so a key cannot be created here. Sign in again.</p>

    <div class="split-layout">
      <div class="tablewrap table-clean">
        <table>
          <thead><tr><th>Name</th><th>Owner</th><th>Expires</th><th>Key</th><th v-if="canManage"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="row in filtered" :key="row.id" :class="{ selected: editor?.id === row.id }">
              <td class="cell-truncate" :title="row.name"><b>{{ row.name }}</b></td>
              <td class="cell-truncate" :title="row.username">{{ row.username || '—' }}</td>
              <td class="mono smalltext">{{ row.expiration ? formatExpiry(row.expiration) : 'Never' }}</td>
              <td>
                <span v-if="isRedacted(row.key)" class="sub">Hidden by account protection</span>
                <span v-else-if="!canManage" class="sub">Shown to people who can manage API keys</span>
                <template v-else>
                  <span class="mono smalltext key-value">{{ revealed.has(row.id) ? row.key : '••••••••••••' }}</span>
                  <button class="btn sm" :disabled="phase.refreshing" :aria-label="`${revealed.has(row.id) ? 'Hide' : 'Show'} the key for ${row.name}`" @click="toggleReveal(row.id)">{{ revealed.has(row.id) ? 'Hide' : 'Show' }}</button>
                  <button class="btn sm" :disabled="!row.key || phase.refreshing" :aria-label="`Copy the key for ${row.name}`" @click="copyKey(row)">Copy</button>
                </template>
              </td>
              <td v-if="canManage" class="row-actions">
                <button class="btn sm" :disabled="phase.refreshing" @click="openEdit(row)">Edit</button>
                <button class="btn sm danger" :disabled="phase.refreshing" @click="removeKey(row)">Delete</button>
              </td>
            </tr>
            <tr v-if="!filtered.length"><td :colspan="canManage ? 5 : 4" class="table-empty">{{ keys.length ? 'No API keys match the current search.' : 'No API keys yet. Add one for a script or tool that calls Tactical.' }}</td></tr>
          </tbody>
        </table>
      </div>

      <aside v-if="canManage && editor" class="editor-panel">
        <div class="cardhead">
          <div><span class="eyebrow">API KEY</span><h3>{{ editor.mode === 'create' ? 'Create API key' : 'Edit API key' }}</h3></div>
          <button class="btn sm ghost" :disabled="editor.saving" aria-label="Close" @click="closeEditor">×</button>
        </div>
        <div v-if="editor.error" class="auth-error" role="alert">{{ editor.error }}</div>
        <label class="field"><span>Name</span><input v-model="editor.name" :maxlength="API_KEY_NAME_MAX" autocomplete="off" /></label>
        <p class="field-help">{{ editor.name.trim().length }} / {{ API_KEY_NAME_MAX }} characters. Tactical allows one key per name.</p>
        <label class="field">
          <span>Owner</span>
          <select v-if="usersAvailable" v-model="editor.ownerId" :disabled="editor.saving">
            <option v-for="u in users" :key="u.id" :value="u.id">{{ u.username }}</option>
          </select>
          <input v-else :value="editor.ownerLabel" disabled />
        </label>
        <p v-if="!usersAvailable" class="field-help">{{ editor.mode === 'create' ? 'Your role cannot list Tactical users, so the key belongs to your own account.' : 'Your role cannot list Tactical users, so the owner cannot change here.' }}</p>
        <label class="field"><span>Expires (optional)</span><input v-model="editor.expires" type="datetime-local" :disabled="editor.saving" /></label>
        <p class="field-help">Leave blank and the key never expires.</p>
        <div class="editor-actions">
          <button class="btn primary" :disabled="editor.saving" @click="saveEditor">{{ editor.saving ? 'Saving…' : (editor.mode === 'create' ? 'Create key' : 'Save key') }}</button>
          <button class="btn" :disabled="editor.saving" @click="closeEditor">Cancel</button>
        </div>
      </aside>
    </div>

    <div v-if="oneTime" class="modal-backdrop" @click.self="closeOneTime">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="api-key-created-title">
        <div class="cardhead">
          <div><span class="eyebrow">API KEY CREATED</span><h3 id="api-key-created-title">{{ oneTime.name }}</h3></div>
          <button class="btn sm ghost" aria-label="Close" @click="closeOneTime">×</button>
        </div>
        <template v-if="oneTime.key">
          <div class="state-inline warning"><b>Copy this key now.</b> You can read it again later in the list, as long as your role can list API keys.</div>
          <label class="field"><span>Key for {{ oneTime.owner || 'the owner' }}</span><input class="mono" :value="oneTime.key" readonly @focus="$event.target.select()" /></label>
          <div v-if="oneTimeMessage" class="field-help" role="status">{{ oneTimeMessage }}</div>
          <div class="modal-actions">
            <button class="btn" @click="copyOneTime">Copy key</button>
            <button class="btn primary" @click="closeOneTime">Done</button>
          </div>
        </template>
        <template v-else>
          <div class="state-inline"><b>Saved.</b> {{ oneTime.note }}</div>
          <div class="modal-actions"><button class="btn primary" @click="closeOneTime">Done</button></div>
        </template>
      </section>
    </div>
  </div>
</template>
