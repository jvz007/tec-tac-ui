<script setup>
import { computed, inject, onMounted, ref, watch } from 'vue'
import {
  createResourceClient,
  createResourceSite,
  listResourceClients,
  listResourceSites,
  updateResourceClient,
  updateResourceSite,
} from '../api'

const state = inject('tecTacState')
const permissions = computed(() => new Set(state.context.permissions || []))
const superuser = computed(() => state.context.user?.superuser === true)
const canManageClients = computed(() => superuser.value || permissions.value.has('core.resources.clients.manage'))
const canManageSites = computed(() => superuser.value || permissions.value.has('core.resources.sites.manage'))

const clients = ref([])
const sites = ref([])
const selectedClientId = ref(null)
const clientSearch = ref('')
const siteSearch = ref('')
const loadingClients = ref(false)
const loadingSites = ref(false)
const error = ref('')
const notice = ref('')
const clientDialog = ref(null)
const siteDialog = ref(null)
const saving = ref(false)

const selectedClient = computed(() => clients.value.find((x) => x.id === selectedClientId.value) || null)

function message(errorValue, fallback) {
  return errorValue?.message || fallback
}

async function loadClients() {
  loadingClients.value = true
  error.value = ''
  try {
    const payload = await listResourceClients({ search: clientSearch.value, pageSize: 500 })
    clients.value = Array.isArray(payload?.items) ? payload.items : []
    if (selectedClientId.value && !clients.value.some((x) => x.id === selectedClientId.value)) selectedClientId.value = null
    if (!selectedClientId.value && clients.value.length) selectedClientId.value = clients.value[0].id
  } catch (e) {
    error.value = message(e, 'Unable to load clients.')
  } finally {
    loadingClients.value = false
  }
}

async function loadSites() {
  loadingSites.value = true
  error.value = ''
  try {
    const payload = await listResourceSites({ clientId: selectedClientId.value, search: siteSearch.value, pageSize: 500 })
    sites.value = Array.isArray(payload?.items) ? payload.items : []
  } catch (e) {
    error.value = message(e, 'Unable to load sites.')
  } finally {
    loadingSites.value = false
  }
}

function chooseClient(id) { selectedClientId.value = id }
function openCreateClient() { clientDialog.value = { mode: 'create', id: null, name: '' } }
function openEditClient(client) { clientDialog.value = { mode: 'edit', id: client.id, name: client.name } }
function openCreateSite() { if (selectedClient.value) siteDialog.value = { mode: 'create', id: null, client_id: selectedClient.value.id, name: '' } }
function openEditSite(site) { siteDialog.value = { mode: 'edit', id: site.id, client_id: site.client_id, name: site.name } }

async function saveClient() {
  const draft = clientDialog.value
  if (!draft || !draft.name.trim()) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const row = draft.mode === 'create'
      ? await createResourceClient(draft.name.trim())
      : await updateResourceClient(draft.id, draft.name.trim())
    clientDialog.value = null
    notice.value = draft.mode === 'create' ? 'Client created.' : 'Client updated.'
    await loadClients()
    if (row?.id) selectedClientId.value = row.id
    await loadSites()
  } catch (e) {
    error.value = message(e, 'Unable to save client.')
  } finally { saving.value = false }
}

async function saveSite() {
  const draft = siteDialog.value
  if (!draft || !draft.name.trim() || !draft.client_id) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    await (draft.mode === 'create'
      ? createResourceSite({ clientId: draft.client_id, name: draft.name.trim() })
      : updateResourceSite(draft.id, { clientId: draft.client_id, name: draft.name.trim() }))
    const destination = draft.client_id
    siteDialog.value = null
    notice.value = draft.mode === 'create' ? 'Site created.' : 'Site updated.'
    selectedClientId.value = destination
    await loadSites()
  } catch (e) {
    error.value = message(e, 'Unable to save site.')
  } finally { saving.value = false }
}

let clientTimer
let siteTimer
watch(clientSearch, () => { clearTimeout(clientTimer); clientTimer = setTimeout(loadClients, 250) })
watch(siteSearch, () => { clearTimeout(siteTimer); siteTimer = setTimeout(loadSites, 250) })
watch(selectedClientId, () => { siteSearch.value = ''; void loadSites() })

onMounted(async () => { await loadClients(); await loadSites() })
</script>

<template>
  <div>
    <div class="phead">
      <div><span class="eyebrow">CORE RESOURCE DIRECTORY</span><h1>Clients & sites</h1><p>Canonical Tactical resource identities exposed through Core. Client and site changes are authorized by both Tactical scope and Tec-Tac Core RBAC.</p></div>
      <div class="row"><button class="btn" :disabled="loadingClients||loadingSites" @click="loadClients().then(loadSites)">Refresh</button><button v-if="canManageClients" class="btn primary" @click="openCreateClient">New client</button></div>
    </div>

    <div v-if="error" class="auth-error mb"><b>Resource operation failed.</b> {{ error }}</div>
    <div v-if="notice" class="state-inline ok mb"><b>{{ notice }}</b></div>

    <div class="grid g2 resources-grid">
      <section class="card resource-pane">
        <div class="cardhead"><div><span class="eyebrow">CLIENTS</span><h3>Client directory</h3><p>Only clients visible in your Tactical scope are shown.</p></div><span class="pill">{{clients.length}}</span></div>
        <label class="field"><span>Search clients</span><input v-model="clientSearch" placeholder="Client name"></label>
        <div v-if="loadingClients" class="state-inline">Loading clients…</div>
        <div v-else-if="!clients.length" class="empty">No clients match the current scope and search.</div>
        <div v-else class="tablewrap resource-table"><table><thead><tr><th>Client</th><th>ID</th><th></th></tr></thead><tbody>
          <tr v-for="client in clients" :key="client.id" class="clickrow" :class="{selected:selectedClientId===client.id}" @click="chooseClient(client.id)"><td><b>{{client.name}}</b></td><td class="mono">{{client.id}}</td><td><button v-if="canManageClients" class="btn sm" @click.stop="openEditClient(client)">Edit</button></td></tr>
        </tbody></table></div>
      </section>

      <section class="card resource-pane">
        <div class="cardhead"><div><span class="eyebrow">SITES</span><h3>{{selectedClient?.name || 'Select a client'}}</h3><p>{{selectedClient ? `Sites belonging to client ${selectedClient.id}.` : 'Choose a client to scope the site directory.'}}</p></div><button v-if="selectedClient&&canManageSites" class="btn primary sm" @click="openCreateSite">New site</button></div>
        <label class="field"><span>Search sites</span><input v-model="siteSearch" :disabled="!selectedClient" placeholder="Site name"></label>
        <div v-if="loadingSites" class="state-inline">Loading sites…</div>
        <div v-else-if="!selectedClient" class="empty">Select a client to inspect its sites.</div>
        <div v-else-if="!sites.length" class="empty">No sites match this client and search.</div>
        <div v-else class="tablewrap resource-table"><table><thead><tr><th>Site</th><th>ID</th><th></th></tr></thead><tbody>
          <tr v-for="site in sites" :key="site.id"><td><b>{{site.name}}</b></td><td class="mono">{{site.id}}</td><td><button v-if="canManageSites" class="btn sm" @click="openEditSite(site)">Edit</button></td></tr>
        </tbody></table></div>
      </section>
    </div>

    <div v-if="clientDialog" class="modal-backdrop" @click.self="clientDialog=null">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="client-resource-title">
        <div class="cardhead"><div><span class="eyebrow">{{clientDialog.mode==='create'?'CREATE CLIENT':'EDIT CLIENT'}}</span><h3 id="client-resource-title">{{clientDialog.mode==='create'?'New client':`Client ${clientDialog.id}`}}</h3></div></div>
        <label class="field"><span>Client name</span><input v-model="clientDialog.name" maxlength="255" autofocus @keydown.enter.prevent="saveClient"></label>
        <p class="muted compact-copy">Core validates uniqueness and Tactical/Tec-Tac authorization. No customer-specific workflow is stored here.</p>
        <div class="modal-actions"><button class="btn" :disabled="saving" @click="clientDialog=null">Cancel</button><button class="btn primary" :disabled="saving||!clientDialog.name.trim()" @click="saveClient">{{saving?'Saving…':'Save client'}}</button></div>
      </section>
    </div>

    <div v-if="siteDialog" class="modal-backdrop" @click.self="siteDialog=null">
      <section class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="site-resource-title">
        <div class="cardhead"><div><span class="eyebrow">{{siteDialog.mode==='create'?'CREATE SITE':'EDIT SITE'}}</span><h3 id="site-resource-title">{{siteDialog.mode==='create'?'New site':`Site ${siteDialog.id}`}}</h3></div></div>
        <label class="field"><span>Client</span><select v-model.number="siteDialog.client_id"><option v-for="client in clients" :key="client.id" :value="client.id">{{client.name}} · {{client.id}}</option></select></label>
        <label class="field"><span>Site name</span><input v-model="siteDialog.name" maxlength="255" autofocus @keydown.enter.prevent="saveSite"></label>
        <p class="muted compact-copy">Moving a site is permitted only when Core confirms your Tactical scope and <span class="mono">core.resources.sites.manage</span> grant.</p>
        <div class="modal-actions"><button class="btn" :disabled="saving" @click="siteDialog=null">Cancel</button><button class="btn primary" :disabled="saving||!siteDialog.name.trim()||!siteDialog.client_id" @click="saveSite">{{saving?'Saving…':'Save site'}}</button></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.resources-grid{align-items:start}.resource-pane{min-width:0}.resource-table{max-height:62vh;overflow:auto}.resource-table table{width:100%}.resource-table tr.selected td{background:var(--surface-hover)}
</style>
