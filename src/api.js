export function apiBase() {
  return window._env_?.PROD_URL || ''
}

export function tacticalToken() {
  return localStorage.getItem('access_token')
}

export function tacticalAuthStage() {
  return localStorage.getItem('tec_tac_auth_stage')
}

export function tacticalIdentityFromStorage() {
  return {
    username: localStorage.getItem('user_name'),
    display_name: localStorage.getItem('name') || localStorage.getItem('user_name'),
    role: null,
    role_id: null,
    superuser: false,
  }
}

export function storeTacticalSession({ token, username, name }) {
  if (!token) throw new Error('Tactical did not return an access token.')
  localStorage.setItem('access_token', token)
  localStorage.removeItem('tec_tac_auth_stage')
  if (username) localStorage.setItem('user_name', username)
  else localStorage.removeItem('user_name')
  if (name) localStorage.setItem('name', name)
  else localStorage.removeItem('name')
}

export function storeTacticalSetupSession({ token, username, name }) {
  storeTacticalSession({ token, username, name })
  localStorage.setItem('tec_tac_auth_stage', 'totp-setup')
}

export function clearTacticalSession() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('tec_tac_auth_stage')
  localStorage.removeItem('user_name')
  localStorage.removeItem('name')
}

export const TACTICAL_SESSION_INVALID_EVENT = 'tec-tac:tactical-session-invalid'
export const CORE_SESSION_FAILURE_CODES = new Set([
  'session_idle_timeout',
  'session_absolute_timeout',
  'session_ip_change',
  'session_ip_changed', // Framework 1.15.16 compatibility alias.
  'session_revoked',
  'session_invalid_state',
])

export function coreSessionFailureCode(payload) {
  if (!payload || typeof payload !== 'object') return null
  const code = typeof payload.code === 'string' ? payload.code : null
  return code && CORE_SESSION_FAILURE_CODES.has(code) ? code : null
}

export function coreSessionFailureMessage(code) {
  if (code === 'session_idle_timeout') return 'Your Tec-Tac session expired due to inactivity. Sign in again.'
  if (code === 'session_absolute_timeout') return 'Your Tec-Tac session reached its maximum lifetime. Sign in again.'
  if (code === 'session_ip_change' || code === 'session_ip_changed') return 'Your network address changed. Sign in again to continue.'
  if (code === 'session_revoked') return 'Your Tec-Tac session was revoked. Sign in again.'
  if (code === 'session_invalid_state') return 'Your Tec-Tac session is no longer trusted. Sign in again.'
  return null
}

export function invalidateTacticalSession(message = 'Your Tactical session is no longer valid. Sign in again.', { code = null } = {}) {
  clearTacticalSession()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TACTICAL_SESSION_INVALID_EVENT, {
      detail: { status: 401, message, code },
    }))
  }
}

function buildHeaders(options = {}, { accept = 'application/json', jsonContentType = true } = {}) {
  const token = tacticalToken()
  const headers = new Headers(options.headers || {})
  if (!headers.has('Accept')) headers.set('Accept', accept)
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (jsonContentType && options.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Token ${token}`)
  return headers
}

async function parseResponsePayload(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try { return await response.json() } catch { return null }
  }
  try { return await response.text() } catch { return null }
}

function messageFromPayload(payload, fallback) {
  if (!payload) return fallback
  if (typeof payload === 'string') return payload
  if (typeof payload.detail === 'string') return payload.detail
  if (typeof payload.error === 'string') return payload.error
  if (typeof payload.message === 'string') return payload.message
  if (Array.isArray(payload.non_field_errors) && payload.non_field_errors.length) return payload.non_field_errors.join(' ')
  return fallback
}

async function tacticalAuthRequest(path, body) {
  const base = apiBase()
  if (!base) {
    const error = new Error('Tactical API URL is unavailable. /env-config.js did not provide PROD_URL.')
    error.status = 0
    throw error
  }

  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify(body),
  })

  const payload = await parseResponsePayload(response)
  if (!response.ok) {
    const error = new Error(messageFromPayload(payload, `Tactical authentication failed: ${response.status} ${response.statusText}`))
    error.status = response.status
    error.payload = payload
    throw error
  }

  // Some Tactical helper responses may be HTTP 200 while still describing an
  // authentication failure. Treat a clear error/detail payload without a token
  // or TOTP decision as a failure rather than accepting it as a session.
  if (payload && typeof payload === 'object' && !('token' in payload) && !('totp' in payload)) {
    const explicitError = payload.error || payload.detail
    if (explicitError) {
      const error = new Error(messageFromPayload(payload, 'Tactical authentication failed.'))
      error.status = response.status
      error.payload = payload
      throw error
    }
  }

  return payload || {}
}

export async function checkTacticalCredentials(username, password) {
  const data = await tacticalAuthRequest('/v2/checkcreds/', { username, password })

  if (data.totp === true) {
    return { requiresTotp: true, requiresTotpSetup: false }
  }

  // Tactical deliberately issues a short-lived authenticated token when an
  // account has no TOTP secret yet. Preserve that token only for Tec-Tac's
  // native enrollment step; do not grant operational access until a TOTP code
  // has been verified by Tactical's normal login endpoint.
  if (data.totp === false && data.token) {
    storeTacticalSetupSession({
      token: data.token,
      username: data.username || username,
      name: data.name || null,
    })
    return { requiresTotp: false, requiresTotpSetup: true, authenticated: false }
  }

  const error = new Error('Tactical did not return a valid authentication decision.')
  error.status = 502
  throw error
}

export async function loginTacticalWithTotp(username, password, twofactor) {
  const data = await tacticalAuthRequest('/v2/login/', { username, password, twofactor })
  if (!data.token) {
    const error = new Error('Tactical accepted the request but did not return an access token.')
    error.status = 502
    throw error
  }

  storeTacticalSession({
    token: data.token,
    username: data.username || username,
    name: data.name || null,
  })

  return { authenticated: true }
}


export async function loginTacticalWithBackupCode(username, password, backupCode) {
  const data = await tacticalAuthRequest('/api/tfd/auth/login/backup-code/', {
    username,
    password,
    backup_code: backupCode,
  })
  if (!data.token) {
    const error = new Error('Tec-Tac accepted the recovery request but did not return a Tactical access token.')
    error.status = 502
    throw error
  }
  storeTacticalSession({
    token: data.token,
    username: data.username || username,
    name: data.name || null,
  })
  return { authenticated: true, mfa: 'backup_code' }
}


export async function setupTacticalTotp() {
  const data = await apiFetch('/accounts/users/setup_totp/', { method: 'POST' })
  if (!data || typeof data !== 'object' || !data.totp_key || !data.qr_url) {
    const error = new Error('Tactical did not return TOTP enrollment details.')
    error.status = 502
    error.payload = data
    throw error
  }
  return data
}

export async function fetchTacticalTotpQr() {
  const base = apiBase()
  const token = tacticalToken()
  if (!base) throw new Error('Tactical API URL is unavailable. /env-config.js did not provide PROD_URL.')
  if (!token) {
    const error = new Error('No Tactical setup token is present in this browser session.')
    error.status = 401
    throw error
  }

  const response = await fetch(`${base}/api/tfd/auth/totp/qr/`, {
    method: 'GET',
    headers: {
      Accept: 'image/svg+xml, application/json',
      Authorization: `Token ${token}`,
    },
    credentials: 'include',
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = await parseResponsePayload(response)
    if (response.status === 401) {
      const sessionCode = coreSessionFailureCode(payload)
      invalidateTacticalSession(
        coreSessionFailureMessage(sessionCode) || messageFromPayload(payload, 'Your Tactical session is no longer valid. Sign in again.'),
        { code: sessionCode },
      )
    }
    const error = new Error(messageFromPayload(payload, `TOTP QR request failed: ${response.status} ${response.statusText}`))
    error.status = response.status
    error.payload = payload
    throw error
  }

  const blob = await response.blob()
  if (!blob.type.includes('svg') && !blob.type.includes('image')) {
    const error = new Error('Tec-Tac did not return a QR image.')
    error.status = 502
    throw error
  }
  return blob
}

export async function validateTacticalSession() {
  const base = apiBase()
  const token = tacticalToken()

  if (!base) {
    const error = new Error('Tactical API URL is unavailable. /env-config.js did not provide PROD_URL.')
    error.status = 0
    throw error
  }

  if (!token) {
    return { authenticated: false, status: 401 }
  }

  // GET /accounts/users/ is an existing Tactical endpoint protected by
  // IsAuthenticated + AccountsPerms. A 200 proves authentication and access;
  // a 403 still proves authentication but means this role lacks AccountsPerms.
  // A 401 means the browser token is missing, expired, or otherwise invalid.
  const response = await fetch(`${base}/accounts/users/`, {
    method: 'GET',
    headers: buildHeaders(),
    credentials: 'include',
    cache: 'no-store',
  })

  if (response.status === 401) {
    return { authenticated: false, status: 401 }
  }

  if (response.ok || response.status === 403) {
    return { authenticated: true, status: response.status }
  }

  const error = new Error(`Tactical session verification failed: ${response.status} ${response.statusText}`)
  error.status = response.status
  throw error
}

async function authenticatedRawRequest(path, options = {}) {
  const base = apiBase()
  const token = tacticalToken()
  if (!base) throw new Error('Tactical API URL is unavailable. /env-config.js did not provide PROD_URL.')
  if (!token) {
    const error = new Error('No Tactical access token is present in this browser session.')
    error.status = 401
    invalidateTacticalSession(error.message)
    throw error
  }

  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: buildHeaders(options, { accept: '*/*', jsonContentType: false }),
    credentials: 'include',
    cache: options.cache || 'no-store',
  })

  if (!response.ok) {
    const payload = response.status === 204 ? null : await parseResponsePayload(response.clone())
    if (response.status === 401) {
      const sessionCode = coreSessionFailureCode(payload)
      invalidateTacticalSession(
        coreSessionFailureMessage(sessionCode) || messageFromPayload(payload, 'Your Tactical session is no longer valid. Sign in again.'),
        { code: sessionCode },
      )
    }
    const error = new Error(messageFromPayload(payload, `API request failed: ${response.status} ${response.statusText}`))
    error.status = response.status
    error.payload = payload
    throw error
  }

  return response
}

export async function apiRaw(path, options = {}) {
  return authenticatedRawRequest(path, options)
}

export async function apiBlob(path, options = {}) {
  const response = await apiRaw(path, options)
  return response.blob()
}

export async function apiText(path, options = {}) {
  const response = await apiRaw(path, options)
  return response.text()
}

export async function apiFetch(path, options = {}) {
  const response = await authenticatedRawRequest(path, {
    ...options,
    headers: buildHeaders(options),
  })
  const payload = response.status === 204 ? null : await parseResponsePayload(response)

  // Tactical's notify_error helper can return a JSON error payload in a 2xx
  // response. Do not allow account/role actions to look successful in that case.
  if (options.rejectErrorPayload !== false && payload && typeof payload === 'object' && (payload.error || payload.detail)) {
    const error = new Error(messageFromPayload(payload, 'Tactical rejected the request.'))
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export async function logoutTacticalSession() {
  let failure = null
  try {
    if (tacticalToken()) await apiFetch('/logout/', { method: 'POST' })
  } catch (error) {
    // Always remove the browser token, even if Tactical is temporarily
    // unreachable. Re-using an uncertain local credential is less safe.
    failure = error
  } finally {
    clearTacticalSession()
  }
  if (failure && failure.status !== 401) throw failure
}

export async function publicApiFetch(path, options = {}) {
  const base = apiBase()
  if (!base) throw new Error('Tactical API URL is unavailable. /env-config.js did not provide PROD_URL.')
  if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('Public API path must be relative to the Tactical API root.')

  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (options.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  // Deliberately do not attach Tactical's browser token. Public extension APIs
  // must explicitly opt into anonymous access server-side (for example AllowAny).
  headers.delete('Authorization')

  const response = await fetch(`${base}${path}`, {
    ...options,
    headers,
    credentials: 'omit',
    cache: options.cache || 'no-store',
  })
  const payload = response.status === 204 ? null : await parseResponsePayload(response)
  if (!response.ok) {
    const error = new Error(messageFromPayload(payload, `Public API request failed: ${response.status} ${response.statusText}`))
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

export async function loadStaticModuleManifest() {
  const response = await fetch('/tec-tac/modules/modules.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`Module manifest failed: ${response.status} ${response.statusText}`)
  const modules = await response.json()
  if (!Array.isArray(modules)) throw new Error('Module manifest must contain a JSON array.')
  return modules
}

// Tec-Tac 0.3.0 system update APIs
export async function getSystemUpdateStatus() {
  return apiFetch('/api/tfd/system/updates/')
}

export async function getUpdateTrustPolicy() {
  return apiFetch('/api/tfd/system/updates/trust-policy/')
}

export async function setUpdateTrustPolicy(minimumLevel) {
  return apiFetch('/api/tfd/system/updates/trust-policy/', {
    method: 'PUT',
    body: JSON.stringify({ minimum_level: minimumLevel }),
  })
}

export async function checkOnlineSystemUpdate(component, { force = false } = {}) {
  const query = new URLSearchParams({ component })
  if (force) query.set('force', '1')
  return apiFetch(`/api/tfd/system/updates/online/?${query.toString()}`)
}

export async function getSystemUpdateBranches(component) {
  const query = new URLSearchParams({ component })
  return apiFetch(`/api/tfd/system/updates/branches/?${query.toString()}`)
}

export async function stageOnlineSystemUpdate(component, sourceType = 'release', ref = null) {
  return apiFetch('/api/tfd/system/updates/online/stage/', {
    method: 'POST',
    body: JSON.stringify({ component, source_type: sourceType, ref }),
  })
}

export async function inspectSystemUpdatePackage(file) {
  const form = new FormData()
  form.append('package', file)
  return apiFetch('/api/tfd/system/updates/packages/inspect/', { method: 'POST', body: form })
}

export async function discardSystemUpdatePackage(uploadId) {
  return apiFetch(`/api/tfd/system/updates/packages/${uploadId}/`, { method: 'DELETE' })
}

export async function installSystemUpdatePackage(uploadId, allowDowngrade = false) {
  return apiFetch(`/api/tfd/system/updates/packages/${uploadId}/install/`, {
    method: 'POST',
    body: JSON.stringify({ allow_downgrade: Boolean(allowDowngrade) }),
  })
}

export async function getSystemUpdateJob(jobId) {
  return apiFetch(`/api/tfd/system/updates/jobs/${jobId}/`, { rejectErrorPayload: false })
}

// Tec-Tac Core storage housekeeping APIs
export async function getStorageHousekeeping() {
  return apiFetch('/api/tfd/system/storage/')
}

export async function saveStorageHousekeeping(policies) {
  return apiFetch('/api/tfd/system/storage/', {
    method: 'PUT',
    body: JSON.stringify({ policies }),
  })
}

export async function runStorageHousekeeping({ dryRun = true, categories = null } = {}) {
  return apiFetch('/api/tfd/system/storage/purge/', {
    method: 'POST',
    body: JSON.stringify({ dry_run: Boolean(dryRun), categories }),
  })
}

// Tec-Tac Core troubleshooting diagnostics
export async function getSystemDiagnostics({ liveCapabilities = false } = {}) {
  const query = liveCapabilities ? '?live_capabilities=1' : ''
  return apiFetch(`/api/tfd/system/diagnostics/${query}`)
}
