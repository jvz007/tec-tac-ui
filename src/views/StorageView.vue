<script setup>
import { computed, onMounted, ref } from 'vue'
import { getStorageHousekeeping, runStorageHousekeeping, saveStorageHousekeeping } from '../api'

const loading = ref(true)
const busy = ref(false)
const error = ref('')
const report = ref(null)
const policies = ref({})
const selected = ref(new Set())
const confirmPurge = ref(false)

const rows = computed(() => report.value?.categories || [])
const totalBytes = computed(() => rows.value.reduce((n, r) => n + Number(r.total_bytes || 0), 0))
const purgeBytes = computed(() => rows.value.reduce((n, r) => n + Number(r.purge_bytes || 0), 0))
function fmt(v) {
  let n = Number(v || 0); const units = ['B','KB','MB','GB','TB']; let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}
function policyText(id) {
  const p = policies.value[id] || {}
  return p.mode === 'keep_count' ? `Keep newest ${p.keep ?? 0}` : `Delete older than ${p.days ?? 0} days`
}
function toggle(id) {
  const next = new Set(selected.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selected.value = next
}
async function load() {
  loading.value = true; error.value = ''
  try {
    report.value = await getStorageHousekeeping()
    policies.value = JSON.parse(JSON.stringify(report.value.policies || {}))
    selected.value = new Set(rows.value.map(r => r.id))
  } catch (e) { error.value = e.message || 'Unable to inspect Tec-Tac storage.' }
  finally { loading.value = false }
}
async function savePolicies() {
  busy.value = true; error.value = ''
  try { await saveStorageHousekeeping(policies.value); await preview() }
  catch (e) { error.value = e.message || 'Unable to save housekeeping retention.' }
  finally { busy.value = false }
}
async function preview() {
  busy.value = true; error.value = ''
  try {
    await saveStorageHousekeeping(policies.value)
    report.value = await runStorageHousekeeping({ dryRun: true, categories: [...selected.value] })
    policies.value = JSON.parse(JSON.stringify(report.value.policies || policies.value))
  } catch (e) { error.value = e.message || 'Unable to run housekeeping preview.' }
  finally { busy.value = false }
}
async function purge() {
  busy.value = true; error.value = ''; confirmPurge.value = false
  try {
    await saveStorageHousekeeping(policies.value)
    const result = await runStorageHousekeeping({ dryRun: false, categories: [...selected.value] })
    await load()
    report.value.last_purge = result
  } catch (e) { error.value = e.message || 'Housekeeping purge failed.' }
  finally { busy.value = false }
}
onMounted(load)
</script>

<template>
<section>
  <div class="phead"><div><span class="eyebrow">CORE HOUSEKEEPING</span><h1>Storage & Housekeeping</h1><p>Inspect and purge disposable Tec-Tac operational data. Persistent state, secrets, deployed UI, source trees and configured backup destinations are protected.</p></div><button class="btn" :disabled="busy" @click="load">Refresh</button></div>
  <div v-if="error" class="auth-error">{{ error }}</div>
  <div v-if="loading" class="callout mono">Scanning /var/lib/tec-tac…</div>
  <template v-else>
    <div class="grid g4 mb">
      <article class="tile"><div class="lbl">Managed storage</div><div class="big">{{ fmt(totalBytes) }}</div><div class="brk">eligible categories scanned</div></article>
      <article class="tile"><div class="lbl">Purge candidate</div><div class="big">{{ fmt(purgeBytes) }}</div><div class="brk">under current retention</div></article>
      <article class="tile"><div class="lbl">Categories</div><div class="big">{{ rows.length }}</div><div class="brk">allow-listed by Core</div></article>
      <article class="tile"><div class="lbl">Selected</div><div class="big">{{ selected.size }}</div><div class="brk">included in next run</div></article>
    </div>

    <section class="card mb">
      <div class="cardhead"><div><span class="eyebrow">RETENTION</span><h3>Disposable data</h3></div><span class="pill ok">PATHS CONTROLLED BY CORE</span></div>
      <div class="tablewrap"><table><thead><tr><th></th><th>Category</th><th>Usage</th><th>Items</th><th>Retention</th><th>Would purge</th></tr></thead><tbody>
        <tr v-for="row in rows" :key="row.id">
          <td><input type="checkbox" :checked="selected.has(row.id)" @change="toggle(row.id)"></td>
          <td><b>{{ row.label }}</b><span class="sub mono">{{ row.id }}</span></td>
          <td class="mono">{{ fmt(row.total_bytes) }}</td><td class="mono">{{ row.total_items }}</td>
          <td>
            <label v-if="policies[row.id]?.mode==='age_days'" class="compact-input"><input v-model.number="policies[row.id].days" type="number" min="0" max="3650"><span class="sub">days</span></label>
            <label v-else class="compact-input"><input v-model.number="policies[row.id].keep" type="number" min="0" max="3650"><span class="sub">copies</span></label>
            <span class="sub">{{ policyText(row.id) }}</span>
          </td>
          <td><span class="pill" :class="row.purge_items ? 'warn' : 'ok'">{{ row.purge_items }} · {{ fmt(row.purge_bytes) }}</span></td>
        </tr>
      </tbody></table></div>
      <div class="queue-footer"><button class="btn" :disabled="busy" @click="savePolicies">Save retention</button><span class="spacer"></span><button class="btn" :disabled="busy || !selected.size" @click="preview">Dry run</button><button class="btn danger" :disabled="busy || !selected.size || !purgeBytes" @click="confirmPurge=true">Purge now</button></div>
    </section>

    <section class="card mb"><div class="cardhead"><div><span class="eyebrow">PROTECTED</span><h3>Never purged by this feature</h3></div></div><div class="module-meta" v-for="item in report.protected || []" :key="item"><b class="mono">{{ item }}</b><span>protected</span></div></section>

    <div v-if="report.last_purge" class="state-inline"><b>Last purge reclaimed {{ fmt(report.last_purge.reclaimed_bytes) }}</b> across {{ report.last_purge.deleted_items }} items.</div>
  </template>

  <div v-if="confirmPurge" class="modal-backdrop" @click.self="confirmPurge=false"><section class="modal-panel"><div class="cardhead"><div><span class="eyebrow">CONFIRM PURGE</span><h3>Delete disposable data?</h3></div><span class="pill warn">IRREVERSIBLE</span></div><p>Current dry-run estimate: <b>{{ fmt(purgeBytes) }}</b>. Core will only delete files from the selected allow-listed categories according to the saved retention policy.</p><div class="modal-actions"><button class="btn danger" :disabled="busy" @click="purge">Purge now</button><button class="btn" @click="confirmPurge=false">Cancel</button></div></section></div>
</section>
</template>
