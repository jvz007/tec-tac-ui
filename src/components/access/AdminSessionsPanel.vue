<script setup>
import { computed, onMounted, ref } from 'vue'
import { listActiveLoginSessions, revokeLoginSession, revokeUserLoginSessions } from '../../access'

const sessions = ref([])
const loading = ref(true)
const busyId = ref('')
const error = ref('')
const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return sessions.value
  return sessions.value.filter((row) => [row.username, row.last_ip, row.id].some((v) => String(v || '').toLowerCase().includes(q)))
})

function when(value) {
  if (!value) return '—'
  try { return new Date(value).toLocaleString() } catch { return value }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await listActiveLoginSessions()
    sessions.value = Array.isArray(data?.sessions) ? data.sessions : []
  } catch (err) {
    error.value = err?.message || 'Unable to load active login sessions.'
  } finally {
    loading.value = false
  }
}

async function revoke(row) {
  if (!window.confirm(`Revoke this active login session for ${row.username}? The session will stop authenticating immediately.`)) return
  busyId.value = row.id
  error.value = ''
  try {
    await revokeLoginSession(row.id)
    await load()
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
    await load()
  } catch (err) {
    error.value = err?.message || 'Unable to revoke user login sessions.'
  } finally {
    busyId.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="toolbar">
      <label class="compact-input"><span class="sr-only">Search active sessions</span><input v-model="search" placeholder="Search user, IP or session…" /></label>
      <span class="muted mono">{{ filtered.length }} / {{ sessions.length }} active sessions</span>
      <span class="spacer"></span>
      <button class="btn" :disabled="loading" @click="load">Refresh</button>
    </div>

    <div class="state-inline warning"><b>Security control.</b> Revocation deletes the underlying Tactical Knox token. A revoked session cannot continue through Tactical or Tec-Tac.</div>
    <div v-if="error" class="auth-error" role="alert">{{ error }}</div>
    <div v-if="loading" class="callout mono">Loading active Tactical sessions…</div>

    <div v-else class="tablewrap">
      <table>
        <thead><tr><th>User</th><th>Created</th><th>Last activity</th><th>IP</th><th>Expires</th><th>Observed by</th><th>Action</th></tr></thead>
        <tbody>
          <tr v-for="row in filtered" :key="row.id">
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
          <tr v-if="!filtered.length"><td colspan="7" class="empty">No active login sessions match the current filter.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
