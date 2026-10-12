<script setup>
import { computed, ref } from 'vue'
import { SCOPE_CLIENT_NOTE, SCOPE_HIDDEN_REASON, chipRows, normalizeIdList, toggleId } from '../../role-scope'

// Clients and Sites pickers for the role form. The parent owns the two id lists; this component
// only proposes new ones through the two update events. Ids the directory does not show stay
// in the list and show as chips (the PUT replaces both lists).
const props = defineProps({
  clients: { type: Array, default: () => [] },
  sites: { type: Array, default: () => [] },
  directory: { type: Object, required: true },
  mode: { type: String, default: 'none' },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  truncated: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:clients', 'update:sites'])

const clientQuery = ref('')
const siteQuery = ref('')
const locked = computed(() => props.readOnly || props.disabled)
const showPickers = computed(() => props.mode !== 'none' && !props.error && !props.loading && !props.readOnly)
const clientChips = computed(() => chipRows(props.clients, props.directory, 'client'))
const siteChips = computed(() => chipRows(props.sites, props.directory, 'site'))
const clientSet = computed(() => new Set(normalizeIdList(props.clients)))
const siteSet = computed(() => new Set(normalizeIdList(props.sites)))

const clientRows = computed(() => {
  const needle = clientQuery.value.trim().toLowerCase()
  return props.directory.clients.filter((c) => !needle || String(c.name).toLowerCase().includes(needle) || String(c.id) === needle)
})
const siteGroups = computed(() => {
  const needle = siteQuery.value.trim().toLowerCase()
  return props.directory.clients
    .map((client) => {
      const clientMatches = !needle || String(client.name).toLowerCase().includes(needle)
      const sites = (client.sites || []).filter((site) => clientMatches || String(site.name).toLowerCase().includes(needle) || String(site.id) === needle)
      return { id: client.id, name: client.name, sites }
    })
    .filter((group) => group.sites.length)
})

function setClient(id) { if (!locked.value) emit('update:clients', toggleId(props.clients, id)) }
function setSite(id) { if (!locked.value) emit('update:sites', toggleId(props.sites, id)) }
</script>

<template>
  <div class="role-scope">
    <div v-if="loading" class="callout mono">Loading clients and sites…</div>
    <div v-if="error" class="auth-error">{{ error }}</div>
    <div v-else-if="mode === 'none' && !loading" class="state-inline warning">{{ SCOPE_HIDDEN_REASON }}. The ids below are still kept when you save.</div>
    <div v-if="truncated" class="state-inline warning">Only the first part of the directory is shown. Ids not shown are kept when you save.</div>

    <div class="role-scope-grid">
      <article class="card role-scope-card">
        <div class="cardhead"><div><span class="eyebrow">CLIENTS</span><h3>Whole clients</h3></div><span class="pill">{{ clientChips.length }}</span></div>
        <p class="muted compact-copy">{{ SCOPE_CLIENT_NOTE }}</p>
        <div class="role-scope-chips" aria-label="Selected clients">
          <span v-for="chip in clientChips" :key="chip.id" class="pill role-scope-chip" :class="{ warn: !chip.known }">{{ chip.label }}<button v-if="!locked" type="button" class="textbtn" :aria-label="'Remove ' + chip.label" @click="setClient(chip.id)">×</button></span>
          <span v-if="!clientChips.length" class="muted">No clients ticked.</span>
        </div>
        <template v-if="showPickers">
          <label class="field"><span>Search clients</span><input v-model="clientQuery" placeholder="Client name" :disabled="disabled" /></label>
          <div class="role-scope-list">
            <label v-for="client in clientRows" :key="client.id" class="permission-row"><input type="checkbox" :checked="clientSet.has(client.id)" :disabled="locked" @change="setClient(client.id)" /><span class="permission-copy"><b>{{ client.name }}</b><code>Whole client #{{ client.id }}: every site, now and later</code></span></label>
            <div v-if="!clientRows.length" class="empty">No matching clients.</div>
          </div>
        </template>
      </article>

      <article class="card role-scope-card">
        <div class="cardhead"><div><span class="eyebrow">SITES</span><h3>Single sites</h3></div><span class="pill">{{ siteChips.length }}</span></div>
        <p class="muted compact-copy">Sites are grouped under their client.</p>
        <div class="role-scope-chips" aria-label="Selected sites">
          <span v-for="chip in siteChips" :key="chip.id" class="pill role-scope-chip" :class="{ warn: !chip.known }">{{ chip.label }}<button v-if="!locked" type="button" class="textbtn" :aria-label="'Remove ' + chip.label" @click="setSite(chip.id)">×</button></span>
          <span v-if="!siteChips.length" class="muted">No sites ticked.</span>
        </div>
        <template v-if="showPickers">
          <label class="field"><span>Search sites</span><input v-model="siteQuery" placeholder="Site or client name" :disabled="disabled" /></label>
          <div class="role-scope-list">
            <div v-for="group in siteGroups" :key="group.id" class="role-scope-group">
              <span class="eyebrow">{{ group.name }}</span>
              <label v-for="site in group.sites" :key="site.id" class="permission-row"><input type="checkbox" :checked="siteSet.has(site.id)" :disabled="locked" @change="setSite(site.id)" /><span class="permission-copy"><b>{{ site.name }}</b><code>Site #{{ site.id }}</code></span></label>
            </div>
            <div v-if="!siteGroups.length" class="empty">No matching sites.</div>
          </div>
        </template>
      </article>
    </div>
  </div>
</template>

<style scoped>
.role-scope-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.role-scope-card{min-width:0}.role-scope-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.role-scope-chip{display:inline-flex;align-items:center;gap:6px}.role-scope-list{max-height:320px;overflow:auto;border-top:1px solid var(--line-soft)}.role-scope-group{padding-top:8px}
</style>
