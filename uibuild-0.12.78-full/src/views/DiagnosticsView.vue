<script setup>
import { computed, onMounted, ref } from 'vue'
import { getSystemDiagnostics } from '../api'

const loading = ref(true)
const liveLoading = ref(false)
const error = ref('')
const report = ref(null)
const expanded = ref(new Set())
const copied = ref(false)

const sections = computed(() => report.value?.sections || [])
const checks = computed(() => sections.value.flatMap(section => section.checks || []))
const counts = computed(() => report.value?.counts || { pass: 0, warning: 0, fail: 0, unknown: 0 })
const overall = computed(() => report.value?.overall || 'unknown')
const migrationCheck = computed(() => checks.value.find(item => item.id === 'core.migrations.modules'))
const moduleMigrationCount = computed(() => Object.keys(migrationCheck.value?.details?.drift || {}).length)

function statusClass(status) {
  return status === 'pass' ? 'ok' : status === 'fail' ? 'danger' : 'warn'
}
function statusLabel(status) {
  return status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : status === 'warning' ? 'WARNING' : 'UNKNOWN'
}
function sectionOpen(section) {
  return expanded.value.has(`section:${section.id}`)
}
function checkOpen(check) {
  return expanded.value.has(`check:${check.id}`)
}
function toggleKey(key) {
  const next = new Set(expanded.value)
  next.has(key) ? next.delete(key) : next.add(key)
  expanded.value = next
}
function expandAll() {
  const next = new Set()
  for (const section of sections.value) {
    next.add(`section:${section.id}`)
    for (const check of section.checks || []) next.add(`check:${check.id}`)
  }
  expanded.value = next
}
function collapseAll() { expanded.value = new Set() }
function fmtTime(value) { return value ? new Date(value).toLocaleString() : '—' }
function pretty(value) { return JSON.stringify(value ?? {}, null, 2) }

async function load({ live = false } = {}) {
  if (live) liveLoading.value = true
  else loading.value = true
  error.value = ''
  try {
    report.value = await getSystemDiagnostics({ liveCapabilities: live })
    if (!expanded.value.size) {
      const attention = new Set()
      for (const section of report.value?.sections || []) {
        if (section.status !== 'pass') attention.add(`section:${section.id}`)
      }
      expanded.value = attention
    }
  } catch (e) {
    error.value = e.message || 'Unable to run Tec-Tac diagnostics.'
  } finally {
    loading.value = false
    liveLoading.value = false
  }
}

function summaryText() {
  const lines = [
    'TEC-TAC TROUBLESHOOTING & DIAGNOSTICS',
    `Generated: ${report.value?.generated_at || 'unknown'}`,
    `Overall: ${overall.value}`,
    `Pass: ${counts.value.pass || 0}  Warning: ${counts.value.warning || 0}  Fail: ${counts.value.fail || 0}`,
    '',
  ]
  for (const section of sections.value) {
    lines.push(`[${section.label}] ${section.status}`)
    for (const check of section.checks || []) lines.push(`- ${check.status.toUpperCase()} ${check.id}: ${check.summary}`)
    lines.push('')
  }
  return lines.join('\n')
}
async function copySummary() {
  try {
    await navigator.clipboard.writeText(summaryText())
    copied.value = true
    setTimeout(() => { copied.value = false }, 1800)
  } catch {
    error.value = 'The browser could not copy the diagnostic summary.'
  }
}
function downloadReport() {
  const blob = new Blob([JSON.stringify(report.value || {}, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `tec-tac-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

onMounted(() => load())
</script>

<template>
<section>
  <div class="phead diagnostic-phead">
    <div>
      <span class="eyebrow">ADMINISTRATION / SYSTEM</span>
      <h1>Troubleshooting & Diagnostics</h1>
      <p>Read-only Core diagnostics for framework, database, services, modules, capabilities, contracts, audit and storage.</p>
    </div>
    <div class="diagnostic-actions">
      <button class="btn" :disabled="loading || liveLoading" @click="load()">{{ loading ? 'Running…' : 'Run checks' }}</button>
      <button class="btn" :disabled="loading || liveLoading" title="Runs module/provider health callbacks and may take longer." @click="load({live:true})">{{ liveLoading ? 'Checking providers…' : 'Live capability checks' }}</button>
      <button class="btn" :disabled="!report" @click="copySummary">{{ copied ? 'Copied' : 'Copy summary' }}</button>
      <button class="btn" :disabled="!report" @click="downloadReport">Download report</button>
    </div>
  </div>

  <div v-if="error" class="auth-error">{{ error }}</div>
  <div v-if="loading && !report" class="callout mono">Running read-only Core diagnostics…</div>

  <template v-if="report">
    <div class="grid g4 mb diagnostic-summary-grid">
      <article class="tile"><div class="lbl">Overall</div><div class="big compact"><span class="pill" :class="statusClass(overall)">{{ statusLabel(overall) }}</span></div><div class="brk">generated {{ fmtTime(report.generated_at) }}</div></article>
      <article class="tile"><div class="lbl">Passing</div><div class="big">{{ counts.pass || 0 }}</div><div class="brk">checks require no action</div></article>
      <article class="tile"><div class="lbl">Warnings</div><div class="big">{{ counts.warning || 0 }}</div><div class="brk">working but needs attention</div></article>
      <article class="tile"><div class="lbl">Failures</div><div class="big">{{ counts.fail || 0 }}</div><div class="brk">component not functioning</div></article>
    </div>

    <div v-if="moduleMigrationCount" class="callout diagnostic-attention mb">
      <span class="pill warn">MIGRATION DRIFT</span>
      <div><b>{{ moduleMigrationCount }} installed module app{{ moduleMigrationCount === 1 ? '' : 's' }} require committed migrations.</b><span>Use the detail below to hand the required migration back to the owning module. Do not use production makemigrations as the permanent repair path.</span></div>
    </div>

    <div class="diagnostic-toolbar mb">
      <span class="smalltext mono">{{ checks.length }} checks · capability health {{ report.live_capabilities ? 'LIVE' : 'METADATA ONLY' }}</span>
      <span class="spacer"></span>
      <button class="btn sm" @click="expandAll">Expand all</button>
      <button class="btn sm" @click="collapseAll">Collapse all</button>
    </div>

    <section v-for="section in sections" :key="section.id" class="card diagnostic-section mb">
      <button class="diagnostic-section-head" type="button" :aria-expanded="sectionOpen(section)" @click="toggleKey(`section:${section.id}`)">
        <span class="diagnostic-chevron">{{ sectionOpen(section) ? '▾' : '▸' }}</span>
        <span><span class="eyebrow">{{ section.id }}</span><b>{{ section.label }}</b></span>
        <span class="spacer"></span>
        <span class="pill" :class="statusClass(section.status)">{{ statusLabel(section.status) }}</span>
        <span class="mono diagnostic-count">{{ (section.checks || []).length }}</span>
      </button>

      <div v-if="sectionOpen(section)" class="diagnostic-check-list">
        <article v-for="check in section.checks || []" :key="check.id" class="diagnostic-check-row">
          <button class="diagnostic-check-summary" type="button" :aria-expanded="checkOpen(check)" @click="toggleKey(`check:${check.id}`)">
            <span class="status-dot" :class="statusClass(check.status)"></span>
            <span class="diagnostic-check-copy"><b>{{ check.label }}</b><span>{{ check.summary }}</span><code>{{ check.id }}</code></span>
            <span class="pill" :class="statusClass(check.status)">{{ statusLabel(check.status) }}</span>
            <span class="diagnostic-chevron">{{ checkOpen(check) ? '▾' : '▸' }}</span>
          </button>
          <div v-if="checkOpen(check)" class="diagnostic-detail">
            <div v-if="check.help_id" class="diagnostic-detail-actions"><RouterLink class="btn sm" :to="`/help/${check.help_id}`">Open help</RouterLink></div>
            <pre>{{ pretty(check.details) }}</pre>
          </div>
        </article>
      </div>
    </section>
  </template>
</section>
</template>
