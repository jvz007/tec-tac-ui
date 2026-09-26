<script setup>
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  getCoreCurrentSession,
  getCoreSessionAudit,
  getCoreSessionDiagnostics,
  getCoreSessionPolicy,
  listCoreSessions,
  revokeCoreSession,
  updateCoreSessionPolicy,
} from '../../access'
import { clearUnsaved, registerUnsaved } from '../../unsaved'

const state = inject('tecTacState')
const OWNER = 'core-session-security'

const section = ref('policy')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')

const policy = reactive({
  idle_timeout_minutes: 30,
  absolute_lifetime_minutes: 480,
  ip_change_policy: 'reauthenticate',
  session_audit_enabled: true,
  activity_heartbeat_seconds: 60,
  trusted_proxies_text: '',
})
const policyBaseline = ref('')
const currentSession = ref(null)

const sessions = ref([])
const sessionUsername = ref(state.context.user?.username || '')
const revokeTarget = ref(null)
const revokeReason = ref('administrator-request')
const revoking = ref(false)

const auditRows = ref([])
const auditUsername = ref('')
const auditEventType = ref('')
const auditLimit = ref(200)

const diagnostics = ref(null)

const tabs = [
  { id: 'policy', label: 'Policy' },
  { id: 'sessions', label: 'Trusted sessions' },
  { id: 'audit', label: 'Audit' },
  { id: 'diagnostics', label: 'Diagnostics' },
]

const policySnapshot = computed(() => JSON.stringify({
  idle_timeout_minutes: Number(policy.idle_timeout_minutes),
  absolute_lifetime_minutes: Number(policy.absolute_lifetime_minutes),
  ip_change_policy: policy.ip_change_policy,
  session_audit_enabled: Boolean(policy.session_audit_enabled),
  activity_heartbeat_seconds: Number(policy.activity_heartbeat_seconds),
  trusted_proxies: normalizeProxyLines(policy.trusted_proxies_text),
}))

const dirty = computed(() => Boolean(policyBaseline.value) && policySnapshot.value !== policyBaseline.value)
const canSave = computed(() => {
  const idle = Number(policy.idle_timeout_minutes)
  const absolute = Number(policy.absolute_lifetime_minutes)
  const heartbeat = Number(policy.activity_heartbeat_seconds)
  return idle >= 1 && idle <= 1440
    && absolute >= 1 && absolute <= 10080
    && heartbeat >= 30 && heartbeat <= 3600
    && ['off', 'audit', 'reauthenticate', 'terminate'].includes(policy.ip_change_policy)
})

watch(dirty, (value) => {
  if (value) registerUnsaved(OWNER, 'Core session security policy', { save: savePolicy, discard: loadPolicy })
  else clearUnsaved(OWNER)
})

function normalizeProxyLines(value) {
  return [...new Set(String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean))]
}

function applyPolicy(source) {
  const next = source || {}
  policy.idle_timeout_minutes = Number(next.idle_timeout_minutes ?? 30)
  policy.absolute_lifetime_minutes = Number(next.absolute_lifetime_minutes ?? 480)
  policy.ip_change_policy = String(next.ip_change_policy || 'reauthenticate')
  policy.session_audit_enabled = next.session_audit_enabled !== false
  policy.activity_heartbeat_seconds = Number(next.activity_heartbeat_seconds ?? 60)
  policy.trusted_proxies_text = Array.isArray(next.trusted_proxies) ? next.trusted_proxies.join('\n') : ''
  policyBaseline.value = JSON.stringify({
    idle_timeout_minutes: policy.idle_timeout_minutes,
    absolute_lifetime_minutes: policy.absolute_lifetime_minutes,
    ip_change_policy: policy.ip_change_policy,
    session_audit_enabled: policy.session_audit_enabled,
    activity_heartbeat_seconds: policy.activity_heartbeat_seconds,
    trusted_proxies: normalizeProxyLines(policy.trusted_proxies_text),
  })
  clearUnsaved(OWNER)
}

async function loadPolicy() {
  loading.value = true
  error.value = ''
  success.value = ''
  try {
    const [policyData, currentData] = await Promise.all([
      getCoreSessionPolicy(),
      getCoreCurrentSession().catch(() => null),
    ])
    applyPolicy(policyData?.policy)
    currentSession.value = currentData?.session || null
  } catch (err) {
    error.value = err?.message || 'Unable to load Core session security policy.'
  } finally {
    loading.value = false
  }
}

async function savePolicy() {
  if (!canSave.value || saving.value) return
  saving.value = true
  error.value = ''
  success.value = ''
  try {
    const payload = {
      idle_timeout_minutes: Number(policy.idle_timeout_minutes),
      absolute_lifetime_minutes: Number(policy.absolute_lifetime_minutes),
      ip_change_policy: policy.ip_change_policy,
      session_audit_enabled: Boolean(policy.session_audit_enabled),
      activity_heartbeat_seconds: Number(policy.activity_heartbeat_seconds),
      trusted_proxies: normalizeProxyLines(policy.trusted_proxies_text),
    }
    const data = await updateCoreSessionPolicy(payload)
    applyPolicy(data?.policy || payload)
    success.value = 'Session security policy saved.'
  } catch (err) {
    error.value = err?.message || 'Unable to save Core session security policy.'
    throw err
  } finally {
    saving.value = false
  }
}

async function loadSessions() {
  loading.value = true
  error.value = ''
  try {
    const data = await listCoreSessions(sessionUsername.value.trim())
    sessions.value = Array.isArray(data?.sessions) ? data.sessions : []
  } catch (err) {
    sessions.value = []
    error.value = err?.message || 'Unable to load Core trusted sessions.'
  } finally {
    loading.value = false
  }
}

function openRevoke(row) {
  revokeTarget.value = row
  revokeReason.value = row.current ? 'administrator-current-session-revoke' : 'administrator-request'
  error.value = ''
}

function closeRevoke() {
  if (revoking.value) return
  revokeTarget.value = null
  revokeReason.value = 'administrator-request'
}

async function confirmRevoke() {
  if (!revokeTarget.value || revoking.value) return
  revoking.value = true
  error.value = ''
  try {
    await revokeCoreSession(revokeTarget.value.id, revokeReason.value.trim() || 'administrator-request')
    const currentWasRevoked = revokeTarget.value.current
    revokeTarget.value = null
    revokeReason.value = 'administrator-request'
    if (currentWasRevoked) {
      success.value = 'Current Core trust session revoked. The next authenticated request will require sign-in again.'
      return
    }
    await loadSessions()
  } catch (err) {
    error.value = err?.message || 'Unable to revoke Core trusted session.'
  } finally {
    revoking.value = false
  }
}

async function loadAudit() {
  loading.value = true
  error.value = ''
  try {
    const data = await getCoreSessionAudit({
      username: auditUsername.value.trim(),
      eventType: auditEventType.value.trim(),
      limit: Number(auditLimit.value) || 200,
    })
    auditRows.value = Array.isArray(data?.events) ? data.events : []
  } catch (err) {
    auditRows.value = []
    error.value = err?.message || 'Unable to load Core session audit events.'
  } finally {
    loading.value = false
  }
}

async function loadDiagnostics() {
  loading.value = true
  error.value = ''
  try {
    diagnostics.value = await getCoreSessionDiagnostics()
  } catch (err) {
    diagnostics.value = null
    error.value = err?.message || 'Unable to load Core session diagnostics.'
  } finally {
    loading.value = false
  }
}

async function selectSection(id) {
  section.value = id
  success.value = ''
  error.value = ''
  if (id === 'sessions' && !sessions.value.length) await loadSessions()
  if (id === 'audit' && !auditRows.value.length) await loadAudit()
  if (id === 'diagnostics' && !diagnostics.value) await loadDiagnostics()
}

function when(value) {
  if (!value) return '—'
  try { return new Date(value).toLocaleString() } catch { return String(value) }
}

function eventSummary(row) {
  const parts = [row.reason, row.previous_ip && row.new_ip ? `${row.previous_ip} → ${row.new_ip}` : ''].filter(Boolean)
  return parts.join(' · ') || '—'
}

onMounted(loadPolicy)
onBeforeUnmount(() => clearUnsaved(OWNER))
</script>

<template>
  <div class="session-security-workspace">
    <div class="toolbar session-security-toolbar">
      <div class="segmented" role="tablist" aria-label="Core session security sections">
        <button v-for="item in tabs" :key="item.id" class="btn sm" :class="{ primary: section === item.id }" role="tab" :aria-selected="section === item.id" @click="selectSection(item.id)">{{ item.label }}</button>
      </div>
      <span class="spacer"></span>
      <span class="pill ok">CORE ENFORCED</span>
    </div>

    <div class="state-inline warning"><b>Independent trust layer.</b> Tactical still authenticates the user; Core separately enforces Tec-Tac idle expiry, absolute lifetime, IP-change handling and explicit revocation.</div>
    <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
    <div v-if="success" class="state-inline ok"><b>Saved.</b> {{ success }}</div>

    <template v-if="section === 'policy'">
      <div v-if="loading" class="callout mono">Loading Core session policy…</div>
      <div v-else class="split-layout session-security-policy-layout">
        <section class="card">
          <div class="cardhead"><div><span class="eyebrow">GLOBAL POLICY</span><h3>Tec-Tac session trust</h3></div><span v-if="dirty" class="pill warn">UNSAVED</span></div>
          <div class="field-grid">
            <label class="field"><span>Idle timeout (minutes)</span><input v-model.number="policy.idle_timeout_minutes" type="number" min="1" max="1440" /><small>1–1440 minutes</small></label>
            <label class="field"><span>Absolute lifetime (minutes)</span><input v-model.number="policy.absolute_lifetime_minutes" type="number" min="1" max="10080" /><small>1–10080 minutes</small></label>
          </div>
          <div class="field-grid">
            <label class="field"><span>IP address change</span><select v-model="policy.ip_change_policy"><option value="off">Off</option><option value="audit">Audit only</option><option value="reauthenticate">Require reauthentication</option><option value="terminate">Terminate session</option></select></label>
            <label class="field"><span>Activity heartbeat (seconds)</span><input v-model.number="policy.activity_heartbeat_seconds" type="number" min="30" max="3600" /><small>30–3600 seconds</small></label>
          </div>
          <label class="checkline"><input v-model="policy.session_audit_enabled" type="checkbox" /><span>Record session-security audit events</span></label>
          <label class="field"><span>Trusted reverse proxies</span><textarea v-model="policy.trusted_proxies_text" rows="5" spellcheck="false" placeholder="10.0.0.10/32&#10;192.168.1.0/24"></textarea><small>One IP address or CIDR network per line. Core rejects /0 networks.</small></label>
          <div class="editor-actions"><button class="btn primary" :disabled="saving || !dirty || !canSave" @click="savePolicy">{{ saving ? 'Saving…' : 'Save policy' }}</button><button class="btn" :disabled="saving || !dirty" @click="loadPolicy">Discard changes</button></div>
        </section>

        <aside class="card">
          <div class="cardhead"><div><span class="eyebrow">CURRENT SESSION</span><h3>{{ currentSession?.username || state.context.user?.username || 'Tec-Tac user' }}</h3></div><span class="pill" :class="currentSession?.revoked ? 'warn' : 'ok'">{{ currentSession?.revoked ? 'REVOKED' : 'TRUSTED' }}</span></div>
          <dl class="kvlist">
            <dt>Session ID</dt><dd class="mono smalltext">{{ currentSession?.id || '—' }}</dd>
            <dt>Last IP</dt><dd class="mono">{{ currentSession?.last_ip || '—' }}</dd>
            <dt>Last activity</dt><dd class="mono smalltext">{{ when(currentSession?.last_activity_at) }}</dd>
            <dt>Idle expiry</dt><dd class="mono smalltext">{{ when(currentSession?.idle_expires_at) }}</dd>
            <dt>Absolute expiry</dt><dd class="mono smalltext">{{ when(currentSession?.absolute_expires_at) }}</dd>
            <dt>Tactical linked</dt><dd>{{ currentSession?.tactical_session_linked ? 'yes' : 'no' }}</dd>
          </dl>
        </aside>
      </div>
    </template>

    <template v-else-if="section === 'sessions'">
      <div class="toolbar">
        <label class="compact-input"><span class="sr-only">Username</span><input v-model="sessionUsername" placeholder="Username" @keyup.enter="loadSessions" /></label>
        <span class="muted">Core HTTP intentionally scopes an unfiltered request to your own account; enter another username to inspect it.</span>
        <span class="spacer"></span>
        <button class="btn" :disabled="loading" @click="loadSessions">Load sessions</button>
      </div>
      <div v-if="loading" class="callout mono">Loading trusted sessions…</div>
      <div v-else class="tablewrap">
        <table>
          <thead><tr><th>User</th><th>State</th><th>Last activity</th><th>Last IP</th><th>Idle expiry</th><th>Absolute expiry</th><th>Action</th></tr></thead>
          <tbody>
            <tr v-for="row in sessions" :key="row.id">
              <td><b>{{ row.username }}</b><span class="sub mono">{{ row.id.slice(0, 12) }}… <span v-if="row.current" class="pill ok">CURRENT</span></span></td>
              <td><span class="pill" :class="row.revoked ? 'warn' : 'ok'">{{ row.revoked ? 'REVOKED' : 'TRUSTED' }}</span><span v-if="row.revocation_reason" class="sub">{{ row.revocation_reason }}</span></td>
              <td class="mono smalltext">{{ when(row.last_activity_at) }}</td>
              <td class="mono smalltext">{{ row.last_ip || '—' }}</td>
              <td class="mono smalltext">{{ when(row.idle_expires_at) }}</td>
              <td class="mono smalltext">{{ when(row.absolute_expires_at) }}</td>
              <td><button class="btn sm danger" :disabled="row.revoked" @click="openRevoke(row)">Revoke</button></td>
            </tr>
            <tr v-if="!sessions.length"><td colspan="7" class="empty">No Core trusted sessions returned for this user.</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else-if="section === 'audit'">
      <div class="toolbar">
        <label class="compact-input"><span class="sr-only">Filter audit by username</span><input v-model="auditUsername" placeholder="Username (optional)" /></label>
        <label class="compact-input"><span class="sr-only">Filter audit by event type</span><input v-model="auditEventType" placeholder="Event type (optional)" /></label>
        <label class="compact-input narrow"><span class="sr-only">Audit event limit</span><input v-model.number="auditLimit" type="number" min="1" max="1000" /></label>
        <span class="spacer"></span><button class="btn" :disabled="loading" @click="loadAudit">Apply</button>
      </div>
      <div v-if="loading" class="callout mono">Loading session audit…</div>
      <div v-else class="tablewrap">
        <table>
          <thead><tr><th>Time</th><th>User</th><th>Event</th><th>Detail</th><th>Requested by</th><th>Session</th></tr></thead>
          <tbody>
            <tr v-for="row in auditRows" :key="row.id">
              <td class="mono smalltext">{{ when(row.created_at) }}</td><td><b>{{ row.username || '—' }}</b></td><td><span class="pill">{{ row.event_type }}</span></td><td>{{ eventSummary(row) }}</td><td class="mono smalltext">{{ row.requested_by || '—' }}</td><td class="mono smalltext">{{ row.session_id ? `${row.session_id.slice(0, 12)}…` : '—' }}</td>
            </tr>
            <tr v-if="!auditRows.length"><td colspan="6" class="empty">No session-security audit events match the current filter.</td></tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else>
      <div class="toolbar"><span class="muted">Live Core session-security state.</span><span class="spacer"></span><button class="btn" :disabled="loading" @click="loadDiagnostics">Refresh</button></div>
      <div v-if="loading" class="callout mono">Loading session diagnostics…</div>
      <div v-else-if="diagnostics" class="grid g2">
        <article class="card"><div class="cardhead"><div><span class="eyebrow">CAPABILITY</span><h3>{{ diagnostics.capability || 'core.session_security' }}</h3></div><span class="pill" :class="diagnostics.enabled ? 'ok' : 'warn'">{{ diagnostics.enabled ? 'ENABLED' : 'DISABLED' }}</span></div><dl class="kvlist"><dt>Version</dt><dd class="mono">{{ diagnostics.version || '—' }}</dd><dt>IP-change policy</dt><dd class="mono">{{ diagnostics.policy?.ip_change_policy || '—' }}</dd><dt>Audit enabled</dt><dd>{{ diagnostics.policy?.session_audit_enabled ? 'yes' : 'no' }}</dd></dl></article>
        <article class="card"><div class="cardhead"><div><span class="eyebrow">SESSION COUNTS</span><h3>Core trust records</h3></div></div><dl class="kvlist"><dt>Active</dt><dd class="mono">{{ diagnostics.counts?.active ?? 0 }}</dd><dt>Revoked</dt><dd class="mono">{{ diagnostics.counts?.revoked ?? 0 }}</dd><dt>Expired, not revoked</dt><dd class="mono">{{ diagnostics.counts?.expired_unrevoked ?? 0 }}</dd></dl></article>
      </div>
    </template>

    <div v-if="revokeTarget" class="modal-backdrop" @click.self="closeRevoke">
      <section class="modal-panel session-revoke-modal" role="dialog" aria-modal="true" aria-labelledby="session-revoke-title">
        <div class="cardhead"><div><span class="eyebrow">REVOKE CORE TRUST</span><h3 id="session-revoke-title">Revoke {{ revokeTarget.username }} session?</h3></div><button class="btn sm ghost" aria-label="Close" :disabled="revoking" @click="closeRevoke">×</button></div>
        <div class="state-inline warning"><b>{{ revokeTarget.current ? 'Current session.' : 'Immediate enforcement.' }}</b> {{ revokeTarget.current ? 'Revoking this session will force this browser to authenticate again on its next Core request.' : 'This Tec-Tac trust record will stop authenticating immediately. The Tactical login token is not deleted by this action.' }}</div>
        <dl class="kvlist"><dt>Session</dt><dd class="mono smalltext">{{ revokeTarget.id }}</dd><dt>Last IP</dt><dd class="mono">{{ revokeTarget.last_ip || '—' }}</dd><dt>Last activity</dt><dd class="mono smalltext">{{ when(revokeTarget.last_activity_at) }}</dd></dl>
        <label class="field"><span>Reason</span><input v-model="revokeReason" maxlength="255" /></label>
        <div class="editor-actions"><button class="btn danger" :disabled="revoking || !revokeReason.trim()" @click="confirmRevoke">{{ revoking ? 'Revoking…' : 'Revoke session' }}</button><button class="btn" :disabled="revoking" @click="closeRevoke">Cancel</button></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.session-security-workspace{display:grid;gap:12px}.session-security-toolbar{align-items:center}.segmented{display:flex;gap:6px;flex-wrap:wrap}.session-security-policy-layout{grid-template-columns:minmax(0,1.4fr) minmax(300px,.6fr)}.compact-input.narrow{max-width:110px}.field small{display:block;color:var(--dim);font-size:11px;margin-top:4px}.field textarea{width:100%;resize:vertical;font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace)}.session-revoke-modal{max-width:620px}@media(max-width:900px){.session-security-policy-layout{grid-template-columns:1fr}}
</style>
