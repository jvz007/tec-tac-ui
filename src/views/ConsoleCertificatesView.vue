<script setup>
import { computed, onMounted, ref } from 'vue'
import { formatDateTime } from '../date-format'
import { useConfirm } from '../confirm-dialog'
import { state } from '../state'
import { listUsers } from '../access'
import { createKeyedLatestRequestGate } from '../latest-request-gate'
import ConsoleCertificateCaPanel from '../components/ConsoleCertificateCaPanel.vue'
import ConsoleCertificateRevoke from '../components/ConsoleCertificateRevoke.vue'
import {
  CANCEL_ENROLMENT_DETAIL,
  CANCEL_ENROLMENT_QUESTION,
  AUDIT_HINT,
  CONSOLE_CERT_STATES,
  canManageConsoleCertificates,
  canViewConsoleCertificates,
  cancelConsoleEnrolment,
  certificateDisplayState,
  consoleCertificateError,
  issueConsoleEnrolment,
  listConsoleCertificates,
} from '../console-certificates'

// Console certificates page (Core 1.18.52). Everyone signed in sees their own rows and can revoke them. People with the
// view or manage permission see every row. Hiding a control is display only: Core refuses the rest and its message is shown.
const confirmAction = useConfirm()
const gate = createKeyedLatestRequestGate(['list'])
const canViewAll = computed(() => canViewConsoleCertificates(state.context))
const canManage = computed(() => canManageConsoleCertificates(state.context))

const loading = ref(true)
const error = ref('')
const notice = ref('')
const certs = ref([])
const enrolments = ref([])
const count = ref(0)
const page = ref(1)
const pageSize = ref(50)
const engineer = ref('')
const stateFilter = ref('')
const users = ref([])
const usersError = ref('')
const issueUser = ref('')
const busy = ref('')
const revoking = ref('')

const lastPage = computed(() => Math.max(1, Math.ceil(count.value / pageSize.value)))
const formatTime = (value) => (value ? formatDateTime(value) : '—')
const stateLabel = (cert) => ({ active: 'Active', expiring: 'Active', expired: 'Expired', revoked: 'Revoked' }[certificateDisplayState(cert)] || '')
const stateClass = (cert) => ({ active: 'ok', expiring: 'warn', expired: 'warn', revoked: 'bad' }[certificateDisplayState(cert)] || '')
const activeUsers = computed(() => users.value.filter((user) => user && user.is_active !== false))

async function load() {
  const request = gate.begin('list')
  loading.value = true
  error.value = ''
  try {
    const result = await listConsoleCertificates({ engineer: canViewAll.value ? engineer.value : '', state: stateFilter.value, page: page.value })
    // A late answer to an older filter or page never overwrites a newer one.
    if (!gate.isCurrent('list', request)) return
    certs.value = result.results
    enrolments.value = result.enrolments
    count.value = result.count
    page.value = result.page
    pageSize.value = result.page_size
  } catch (err) {
    if (!gate.isCurrent('list', request)) return
    error.value = consoleCertificateError(err, 'Console certificates could not be loaded.')
  } finally {
    if (gate.isCurrent('list', request)) loading.value = false
  }
}

function applyFilters() { page.value = 1; load() }
function goto(next) { page.value = Math.min(lastPage.value, Math.max(1, next)); load() }

async function loadUsers() {
  if (!canViewAll.value) return
  try {
    const rows = await listUsers()
    users.value = Array.isArray(rows) ? rows : []
  } catch (err) {
    usersError.value = consoleCertificateError(err, 'The list of people could not be loaded.')
  }
}

async function issue() {
  const id = Number.parseInt(issueUser.value, 10)
  if (!Number.isInteger(id) || busy.value) return
  busy.value = 'issue'
  error.value = ''
  notice.value = ''
  try {
    await issueConsoleEnrolment(id)
    notice.value = 'The engineer can now enrol a PC from My Account.'
    issueUser.value = ''
    await load()
  } catch (err) {
    // Core refuses an inactive or blocked account with account_inactive; its text is shown as sent.
    error.value = consoleCertificateError(err, 'The engineer could not be allowed to enrol.')
  } finally {
    busy.value = ''
  }
}

async function cancelEnrolment(row) {
  if (busy.value) return
  busy.value = row.id
  error.value = ''
  notice.value = ''
  try {
    const yes = await confirmAction({ question: CANCEL_ENROLMENT_QUESTION, target: row.username, detail: CANCEL_ENROLMENT_DETAIL, danger: true, yesLabel: 'Yes', noLabel: 'No' })
    if (!yes) return
    await cancelConsoleEnrolment(row.id)
    notice.value = 'The enrolment was cancelled.'
    await load()
  } catch (err) {
    error.value = consoleCertificateError(err, 'The enrolment could not be cancelled.')
  } finally {
    busy.value = ''
  }
}

// Revoke is offered on every row for a manager, and on the person's own rows for everyone. Core decides.
function canRevoke(cert) {
  if (cert.state !== 'active') return false
  if (canManage.value || !canViewAll.value) return true
  return cert.engineer_id != null && cert.engineer_id === state.context?.user?.id
}

async function onRevoked() {
  revoking.value = ''
  notice.value = 'Certificate revoked.'
  await load()
}

onMounted(() => { load(); loadUsers() })
</script>

<template>
  <section class="phead">
    <div><span class="eyebrow">ACCESS</span><h1>Console certificates</h1><p>Certificates that let an engineer's PC prove who is using the Engineer Console.</p></div>
    <div class="row"><router-link class="btn ghost" to="/account">My Account</router-link></div>
  </section>

  <div v-if="error" class="auth-error mb" role="alert">{{ error }}</div>
  <div v-if="notice" class="state-inline mb" role="status"><b>{{ notice }}</b></div>

  <ConsoleCertificateCaPanel v-if="canViewAll" @replaced="load" />

  <section class="card mb" aria-labelledby="console-certs-title">
    <div class="cardhead"><div><span class="eyebrow">CERTIFICATES</span><h3 id="console-certs-title">{{ canViewAll ? 'Every certificate' : 'My certificates' }}</h3></div></div>
    <div class="toolbar">
      <label v-if="canViewAll && users.length" class="compact-input"><span class="sr-only">Engineer</span>
        <select v-model="engineer" @change="applyFilters">
          <option value="">All engineers</option>
          <option v-for="user in users" :key="user.id" :value="String(user.id)">{{ user.username }}</option>
        </select>
      </label>
      <label class="compact-input"><span class="sr-only">State</span>
        <select v-model="stateFilter" @change="applyFilters">
          <option value="">Any state</option>
          <option v-for="item in CONSOLE_CERT_STATES" :key="item" :value="item">{{ item.charAt(0).toUpperCase() + item.slice(1) }}</option>
        </select>
      </label>
      <span class="muted mono">{{ count }} certificates</span>
      <span class="spacer"></span>
      <button class="btn" type="button" :disabled="loading" @click="load">Refresh</button>
    </div>
    <div v-if="loading" class="state-panel"><span class="spinner" aria-hidden="true"></span><span>Loading…</span></div>
    <div class="tablewrap table-clean">
      <table>
        <thead><tr><th>PC</th><th v-if="canViewAll">Engineer</th><th>Serial</th><th>Issued</th><th>Expires</th><th>State</th><th>Last used</th><th>Revoked reason</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          <tr v-if="!certs.length && !loading"><td :colspan="canViewAll ? 9 : 8" class="muted">No certificates match.</td></tr>
          <template v-for="cert in certs" :key="cert.serial">
            <tr>
              <td class="cell-truncate" :title="cert.pc_label"><b>{{ cert.pc_label || '—' }}</b></td>
              <td v-if="canViewAll">{{ cert.username || '—' }}</td>
              <td class="mono smalltext">{{ cert.short_serial }}</td>
              <td class="smalltext">{{ formatTime(cert.issued_at) }}</td>
              <td class="smalltext">{{ formatTime(cert.not_after) }}</td>
              <td><span class="pill" :class="stateClass(cert)">{{ stateLabel(cert) }}</span> <span v-if="cert.expiring && cert.state === 'active'" class="pill warn">Expiring</span></td>
              <td class="smalltext">{{ cert.last_used_at ? formatTime(cert.last_used_at) : '—' }}</td>
              <td class="smalltext">{{ cert.revoked_reason || '—' }}</td>
              <td class="row-actions"><button v-if="canRevoke(cert)" class="btn sm danger" type="button" @click="revoking = cert.serial">Revoke</button></td>
            </tr>
            <tr v-if="revoking === cert.serial">
              <td :colspan="canViewAll ? 9 : 8"><ConsoleCertificateRevoke :serial="cert.serial" :label="cert.pc_label" @revoked="onRevoked" @cancel="revoking = ''" /></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <div v-if="lastPage > 1" class="toolbar">
      <button class="btn sm" type="button" :disabled="loading || page <= 1" @click="goto(page - 1)">Previous</button>
      <span class="muted mono">Page {{ page }} of {{ lastPage }}</span>
      <button class="btn sm" type="button" :disabled="loading || page >= lastPage" @click="goto(page + 1)">Next</button>
    </div>
  </section>

  <section class="card mb" aria-labelledby="console-enrolments-title">
    <div class="cardhead"><div><span class="eyebrow">ENROLMENTS</span><h3 id="console-enrolments-title">Open enrolments</h3></div></div>
    <p class="compact-copy muted">{{ AUDIT_HINT }}</p>
    <p class="compact-copy muted">An administrator allows an engineer to enrol for 7 days. The engineer then asks for a one-time code on My Account. The administrator never sees the code.</p>
    <form v-if="canManage" class="runtime-settings-form" @submit.prevent="issue">
      <label class="field"><span>Allow an engineer to enrol a PC</span>
        <select v-model="issueUser" :disabled="busy === 'issue'">
          <option value="" disabled>Choose an engineer</option>
          <option v-for="user in activeUsers" :key="user.id" :value="String(user.id)">{{ user.username }}</option>
        </select>
      </label>
      <p v-if="usersError" class="field-help dangertext">{{ usersError }}</p>
      <div class="login-actions"><button class="btn primary" type="submit" :disabled="busy === 'issue' || !issueUser">{{ busy === 'issue' ? 'Allowing…' : 'Allow to enrol' }}</button></div>
    </form>
    <div class="tablewrap table-clean">
      <table>
        <thead><tr><th>Engineer</th><th>Allowed by</th><th>Allowed</th><th>Ends</th><th>State</th><th>Code</th><th v-if="canManage"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          <tr v-if="!enrolments.length"><td :colspan="canManage ? 7 : 6" class="muted">No open enrolments.</td></tr>
          <tr v-for="row in enrolments" :key="row.id">
            <td><b>{{ row.username || '—' }}</b></td>
            <td>{{ row.authorised_by_username || '—' }}</td>
            <td class="smalltext">{{ formatTime(row.authorised_at) }}</td>
            <td class="smalltext">{{ formatTime(row.expires_at) }}</td>
            <td>{{ row.state || '—' }}</td>
            <td>{{ row.code_active ? 'A code is active' : 'No code yet' }}</td>
            <td v-if="canManage" class="row-actions"><button class="btn sm danger" type="button" :disabled="!!busy" @click="cancelEnrolment(row)">Cancel</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
