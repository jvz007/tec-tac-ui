<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { listActiveLoginSessions, revokeLoginSession, revokeUserLoginSessions } from '../../access'

const sessions = ref([])
const loading = ref(true)
const busyId = ref('')
const error = ref('')
const search = ref('')
const page = ref(1)
const pageSize = 50
const total = ref(0)
const pages = ref(0)
let searchTimer = null

function when(value) {
  if (!value) return '—'
  try { return new Date(value).toLocaleString() } catch { return value }
}

async function load(targetPage = page.value) {
  loading.value = true
  error.value = ''
  try {
    const requestedPage = Math.max(1, Number(targetPage) || 1)
    const data = await listActiveLoginSessions({ page: requestedPage, pageSize, search: search.value.trim() })
    const rows = Array.isArray(data?.sessions) ? data.sessions : []
    const resolvedPages = Number(data?.pages || 0)
    const resolvedTotal = Number(data?.total ?? data?.count ?? rows.length)
    if (!rows.length && resolvedTotal > 0 && resolvedPages > 0 && requestedPage > resolvedPages) {
      return load(resolvedPages)
    }
    sessions.value = rows
    page.value = Number(data?.page || requestedPage)
    total.value = resolvedTotal
    pages.value = resolvedPages
  } catch (err) {
    error.value = err?.message || 'Unable to load active login sessions.'
  } finally {
    loading.value = false
  }
}

function scheduleSearch() {
  if (searchTimer) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    page.value = 1
    void load(1)
  }, 300)
}

async function revoke(row) {
  if (!window.confirm(`Revoke this active login session for ${row.username}? The session will stop authenticating immediately.`)) return
  busyId.value = row.id
  error.value = ''
  try {
    await revokeLoginSession(row.id)
    await load(page.value)
  } catch (err) {
    error.value = err?.message || 'Unable to revoke login session.'
  } finally {
    busyId.value = ''
  }
}

async function revokeAll(row) {
  if (!window.confirm(`Revoke ALL active login sessions for ${row.username}? This may also sign out the current administrator if it is the same account.`)) return
  busyId.value = `user:${row.user_id}`
  error.value = ''
  try {
    await revokeUserLoginSessions(row.user_id)
    await load(page.value)
  } catch (err) {
    error.value = err?.message || 'Unable to revoke user login sessions.'
  } finally {
    busyId.value = ''
  }
}

watch(search, scheduleSearch)
onMounted(() => load(1))
onBeforeUnmount(() => { if (searchTimer) window.clearTimeout(searchTimer) })
</script>

<template>
  <div>
    <div class="toolbar">
      <label class="compact-input"><span class="sr-only">Search active sessions</span><input v-model="search" placeholder="Search user or IP…" /></label>
      <span class="muted mono">{{ total }} active sessions · page {{ page }}{{ pages ? ` / ${pages}` : '' }}</span>
      <span class="spacer"></span>
      <button class="btn" :disabled="loading" @click="load(page)">Refresh</button>
    </div>

    <div class="state-inline warning"><b>Security control.</b> Revocation deletes the underlying Tactical Knox token. A revoked session cannot continue through Tactical or Tec-Tac.</div>
    <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
    <div v-if="loading && !sessions.length" class="callout mono">Loading active Tactical sessions…</div>

    <div v-else class="tablewrap">
      <table>
        <thead><tr><th>User</th><th>Created</th><th>Last activity</th><th>IP</th><th>Expires</th><th>Observed by</th><th>Action</th></tr></thead>
        <tbody>
          <tr v-for="row in sessions" :key="row.id">
            <td><b>{{ row.username }}</b><span class="sub"><span v-if="row.current" class="pill ok">CURRENT</span><span class="mono">{{ row.id.slice(0, 12) }}…</span></span></td>
            <td class="mono smalltext">{{ when(row.created_at) }}</td>
            <td class="mono smalltext">{{ when(row.last_activity_at || row.last_seen_at) }}</td>
            <td class="mono smalltext">{{ row.last_ip || '—' }}</td>
            <td class="mono smalltext">{{ when(row.expires_at) }}</td>
            <td><span class="pill" :class="row.tec_tac_observed ? 'ok' : ''">{{ row.tec_tac_observed ? 'TACTICAL + TEC-TAC' : 'TACTICAL' }}</span></td>
            <td>
              <div class="table-actions">
                <button class="btn sm danger" :disabled="busyId === row.id" @click="revoke(row)">Revoke</button>
                <button class="btn sm" :disabled="busyId === `user:${row.user_id}`" @click="revokeAll(row)">Revoke user</button>
              </div>
            </td>
          </tr>
          <tr v-if="!sessions.length"><td colspan="7" class="empty">No active login sessions match the current filter.</td></tr>
        </tbody>
      </table>
    </div>
    <div class="toolbar mt"><span class="muted mono">Showing {{ sessions.length }} of {{ total }} active sessions</span><span class="spacer"></span><button class="btn sm" :disabled="loading || page <= 1" @click="load(page - 1)">Previous</button><button class="btn sm" :disabled="loading || !pages || page >= pages" @click="load(page + 1)">Next</button></div>
  </div>
</template>
