<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  createResourceClient,
  createResourceSite,
  listResourceClients,
  listResourceSites,
  updateResourceClient,
  updateResourceSite,
} from '../api'

const PAGE_SIZE = 50
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
const clientPage = ref(1)
const clientPages = ref(0)
const clientCount = ref(0)
const sitePage = ref(1)
const sitePages = ref(0)
const siteCount = ref(0)
const loadingClients = ref(false)
const loadingSites = ref(false)
const error = ref('')
const notice = ref('')
const clientDialog = ref(null)
const siteDialog = ref(null)
const siteClientSearch = ref('')
const siteClientOptions = ref([])
const loadingSiteClientOptions = ref(false)
const saving = ref(false)

const selectedClient = computed(() => clients.value.find((x) => x.id === selectedClientId.value) || null)

function message(errorValue, fallback) {
  return errorValue?.message || fallback
}

function normalizePage(value, fallback = 1) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function applyClientPayload(payload) {
  clients.value = Array.isArray(payload?.items) ? payload.items : []
  clientCount.value = Number(payload?.count || 0)
  clientPage.value = normalizePage(payload?.page, clientPage.value)
  clientPages.value = Number(payload?.pages || 0)
}

function applySitePayload(payload) {
  sites.value = Array.isArray(payload?.items) ? payload.items : []
  siteCount.value = Number(payload?.count || 0)
  sitePage.value = normalizePage(payload?.page, sitePage.value)
  sitePages.value = Number(payload?.pages || 0)
}

let clientRequest = 0
async function loadClients({ resetPage = false } = {}) {
  if (resetPage) clientPage.value = 1
  const request = ++clientRequest
  loadingClients.value = true
  error.value = ''
  try {
    const payload = await listResourceClients({ search: clientSearch.value, page: clientPage.value, pageSize: PAGE_SIZE })
    if (request !== clientRequest) return
    applyClientPayload(payload)
    if (clientPages.value && clientPage.value > clientPages.value) {
      clientPage.value = clientPages.value
      return loadClients()
    }
    if (selectedClientId.value && !clients.value.some((x) => x.id === selectedClientId.value)) selectedClientId.value = null
    if (!selectedClientId.value && clients.value.length) selectedClientId.value = clients.value[0].id
  } catch (e) {
    if (request === clientRequest) error.value = message(e, 'Unable to load clients.')
  } finally {
    if (request === clientRequest) loadingClients.value = false
  }
}

let siteRequest = 0
async function loadSites({ resetPage = false } = {}) {
  if (resetPage) sitePage.value = 1
  const request = ++siteRequest
  if (!selectedClientId.value) {
    sites.value = []
    siteCount.value = 0
    sitePages.value = 0
    loadingSites.value = false
    return
  }
  loadingSites.value = true
  error.value = ''
  try {
    const payload = await listResourceSites({ clientId: selectedClientId.value, search: siteSearch.value, page: sitePage.value, pageSize: PAGE_SIZE })
    if (request !== siteRequest) return
    applySitePayload(payload)
    if (sitePages.value && sitePage.value > sitePages.value) {
      sitePage.value = sitePages.value
      return loadSites()
    }
  } catch (e) {
    if (request === siteRequest) error.value = message(e, 'Unable to load sites.')
  } finally {
    if (request === siteRequest) loadingSites.value = false
  }
}

async function refreshAll() {
  await loadClients()
  await loadSites()
}

function chooseClient(id) {
  if (selectedClientId.value === id) return
  selectedClientId.value = id
}
function openCreateClient() { clientDialog.value = { mode: 'create', id: null, name: '' } }
function openEditClient(client) { clientDialog.value = { mode: 'edit', id: client.id, name: client.name } }
function openCreateSite() {
  if (!selectedClient.value) return
  siteDialog.value = { mode: 'create', id: null, client_id: selectedClient.value.id, name: '' }
  siteClientSearch.value = selectedClient.value.name
  siteClientOptions.value = [selectedClient.value]
}
function openEditSite(site) {
  siteDialog.value = { mode: 'edit', id: site.id, client_id: site.client_id, name: site.name }
  siteClientSearch.value = selectedClient.value?.name || ''
  siteClientOptions.value = selectedClient.value ? [selectedClient.value] : []
}

let siteClientRequest = 0
async function loadSiteClientOptions() {
  if (!siteDialog.value) return
  const request = ++siteClientRequest
  loadingSiteClientOptions.value = true
  try {
    const payload = await listResourceClients({ search: siteClientSearch.value, page: 1, pageSize: 50 })
    if (request !== siteClientRequest) return
    const rows = Array.isArray(payload?.items) ? payload.items : []
    const current = selectedClient.value
    const merged = current && !rows.some((row) => row.id === current.id) ? [current, ...rows] : rows
    siteClientOptions.value = merged
  } catch (e) {
    if (request === siteClientRequest) error.value = message(e, 'Unable to search clients for the site.')
  } finally {
    if (request === siteClientRequest) loadingSiteClientOptions.value = false
  }
}

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
    if (row?.id && clients.value.some((item) => item.id === row.id)) selectedClientId.value = row.id
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
    if (destination === selectedClientId.value) {
      await loadSites()
    } else {
      const visibleDestination = clients.value.some((client) => client.id === destination)
      if (visibleDestination) selectedClientId.value = destination
      else await loadSites()
    }
  } catch (e) {
    error.value = message(e, 'Unable to save site.')
  } finally { saving.value = false }
}

function changeClientPage(next) {
  if (next < 1 || next > clientPages.value || next === clientPage.value) return
  clientPage.value = next
  void loadClients()
}
function changeSitePage(next) {
  if (next < 1 || next > sitePages.value || next === sitePage.value) return
  sitePage.value = next
  void loadSites()
}

let clientTimer
let siteTimer
let siteClientTimer
watch(clientSearch, () => {
  clearTimeout(clientTimer)
  clientTimer = setTimeout(() => { void loadClients({ resetPage: true }) }, 300)
})
watch(siteSearch, () => {
  clearTimeout(siteTimer)
  siteTimer = setTimeout(() => { void loadSites({ resetPage: true }) }, 300)
})
watch(siteClientSearch, () => {
  clearTimeout(siteClientTimer)
  siteClientTimer = setTimeout(() => { void loadSiteClientOptions() }, 300)
})
watch(selectedClientId, () => {
  siteSearch.value = ''
  sitePage.value = 1
  void loadSites()
})

onMounted(() => { void loadClients() })
onBeforeUnmount(() => {
  clearTimeout(clientTimer)
  clearTimeout(siteTimer)
  clearTimeout(siteClientTimer)
  clientRequest += 1
  siteRequest += 1
  siteClientRequest += 1
})
</script>

<template>
  <div>
    <div class="phead">
      <div><span class="eyebrow">CORE RESOURCE DIRECTORY</span><h1>Clients & sites</h1><p>Canonical Tactical resource identities exposed through Core. Client and site changes are authorized by both Tactical scope and Tec-Tac Core RBAC.</p></div>
      <div class="row"><button class="btn" :disabled="loadingClients||loadingSites" @click="refreshAll">Refresh</button><button v-if="canManageClients" class="btn primary" @click="openCreateClient">New client</button></div>
    </div>

    <div v-if="error" class="auth-error mb"><b>Resource operation failed.</b> {{ error }}</div>
    <div v-if="notice" class="state-inline ok mb"><b>{{ notice }}</b></div>

    <div class="grid g2 resources-grid">
      <section class="card resource-pane">
        <div class="cardhead"><div><span class="eyebrow">CLIENTS</span><h3>Client directory</h3><p>Only clients visible in your Tactical scope are shown.</p></div><span class="pill">{{clientCount}}</span></div>
        <label class="field"><span>Search clients</span><input v-model="clientSearch" placeholder="Client name"></label>
        <div v-if="loadingClients && !clients.length" class="state-inline">Loading clients…</div>
        <div v-else-if="!clients.length" class="empty">No clients match the current scope and search.</div>
        <div v-else class="tablewrap resource-table"><table><thead><tr><th>Client</th><th>ID</th><th></th></tr></thead><tbody>
          <tr v-for="client in clients" :key="client.id" class="clickrow" :class="{selected:selectedClientId===client.id}" @click="chooseClient(client.id)"><td><b>{{client.name}}</b></td><td class="mono">{{client.id}}</td><td><button v-if="canManageClients" class="btn sm" @click.stop="openEditClient(client)">Edit</button></td></tr>
        </tbody></table></div>
        <div v-if="clientPages>1" class="resource-pager"><span class="muted mono">Page {{clientPage}} / {{clientPages}}</span><div class="row"><button class="btn sm" :disabled="clientPage<=1||loadingClients" @click="changeClientPage(clientPage-1)">Previous</button><button class="btn sm" :disabled="clientPage>=clientPages||loadingClients" @click="changeClientPage(clientPage+1)">Next</button></div></div>
      </section>

      <section class="card resource-pane">
        <div class="cardhead"><div><span class="eyebrow">SITES</span><h3>{{selectedClient?.name || 'Select a client'}}</h3><p>{{selectedClient ? `Sites belonging to client ${selectedClient.id}.` : 'Choose a client to scope the site directory.'}}</p></div><div class="row"><span v-if="selectedClient" class="pill">{{siteCount}}</span><button v-if="selectedClient&&canManageSites" class="btn primary sm" @click="openCreateSite">New site</button></div></div>
        <label class="field"><span>Search sites</span><input v-model="siteSearch" :disabled="!selectedClient" placeholder="Site name"></label>
        <div v-if="loadingSites && !sites.length" class="state-inline">Loading sites…</div>
        <div v-else-if="!selectedClient" class="empty">Select a client to inspect its sites.</div>
        <div v-else-if="!sites.length" class="empty">No sites match this client and search.</div>
        <div v-else class="tablewrap resource-table"><table><thead><tr><th>Site</th><th>ID</th><th></th></tr></thead><tbody>
          <tr v-for="site in sites" :key="site.id"><td><b>{{site.name}}</b></td><td class="mono">{{site.id}}</td><td><button v-if="canManageSites" class="btn sm" @click="openEditSite(site)">Edit</button></td></tr>
        </tbody></table></div>
        <div v-if="sitePages>1" class="resource-pager"><span class="muted mono">Page {{sitePage}} / {{sitePages}}</span><div class="row"><button class="btn sm" :disabled="sitePage<=1||loadingSites" @click="changeSitePage(sitePage-1)">Previous</button><button class="btn sm" :disabled="sitePage>=sitePages||loadingSites" @click="changeSitePage(sitePage+1)">Next</button></div></div>
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
        <label class="field"><span>Find client</span><input v-model="siteClientSearch" placeholder="Search client name"></label>
        <label class="field"><span>Client</span><select v-model.number="siteDialog.client_id" :disabled="loadingSiteClientOptions"><option v-for="client in siteClientOptions" :key="client.id" :value="client.id">{{client.name}} · {{client.id}}</option></select></label>
        <label class="field"><span>Site name</span><input v-model="siteDialog.name" maxlength="255" autofocus @keydown.enter.prevent="saveSite"></label>
        <p class="muted compact-copy">Moving a site is permitted only when Core confirms your Tactical scope and <span class="mono">core.resources.sites.manage</span> grant.</p>
        <div class="modal-actions"><button class="btn" :disabled="saving" @click="siteDialog=null">Cancel</button><button class="btn primary" :disabled="saving||!siteDialog.name.trim()||!siteDialog.client_id" @click="saveSite">{{saving?'Saving…':'Save site'}}</button></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.resources-grid{align-items:start}.resource-pane{min-width:0}.resource-table{max-height:62vh;overflow:auto}.resource-table table{width:100%}.resource-table tr.selected td{background:var(--surface-hover)}.resource-pager{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px}.resource-pager .row{margin:0}
</style>
