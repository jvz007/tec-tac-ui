export function apiBase() {
  return window._env_?.PROD_URL || ''
}

// The Tactical API base for display and module use: apiBase() without a
// trailing slash, or '' when unset or not http(s).
export function tacticalServerUrl() {
  const value = String(apiBase() || '').trim()
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
  } catch {
    return ''
  }
  return value.replace(/\/+$/, '')
}

export function tecTacUiBaseUrl() {
  const basePath = import.meta.env?.BASE_URL || '/tec-tac/'
  return new URL(basePath, window.location.origin).toString()
}

export function tecTacTotpIssuer() {
  const url = new URL(tecTacUiBaseUrl())
  const path = url.pathname.replace(/\/+$/, '') || '/tec-tac'
  // otpauth labels use ':' as the issuer/account separator. Keep the issuer
  // itself colon-free and aligned with Core's QR generation.
  return `${url.hostname}${path}`.replaceAll(':', '-').slice(0, 160) || 'tec-tac'
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
  'mfa_enrollment_required',
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
  if (code === 'mfa_enrollment_required') return 'Complete authenticator enrollment before using Tec-Tac.'
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

// Every failure thrown by this module carries the same documented shape:
//   .status   0 when no HTTP response arrived, 401 without a token, otherwise
//             the HTTP status (the 2xx status for the error-key rejection)
//   .payload  the parsed body: object for JSON, string for text, null for 204,
//             empty or unparseable bodies and for status 0
//   .code     payload.code when it is a string, else null
// The original Error object is decorated so its name and message are unchanged.
function decorateFailure(error, status, payload = null) {
  const target = error instanceof Error ? error : new Error(typeof error === 'string' ? error : (error?.message || String(error)))
  const body = payload === undefined ? null : payload
  const fields = {
    status: Number.isFinite(Number(status)) ? Number(status) : 0,
    payload: body,
    code: body && typeof body === 'object' && typeof body.code === 'string' ? body.code : null,
  }
  for (const [key, value] of Object.entries(fields)) {
    try { target[key] = value } catch { try { Object.defineProperty(target, key, { value, configurable: true, writable: true }) } catch {} }
  }
  return target
}

function failure(message, status, payload = null) {
  return decorateFailure(new Error(message), status, payload)
}

// fetch() rejects with a TypeError (or an AbortError) when no response arrives.
async function fetchOrFail(url, init) {
  try {
    return await fetch(url, init)
  } catch (error) {
    throw decorateFailure(error, 0, null)
  }
}

const NO_API_URL_MESSAGE = 'Tactical API URL is unavailable. /env-config.js did not provide PROD_URL.'

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
  try {
    const text = await response.text()
    return text === '' ? null : text
  } catch { return null }
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
    throw failure(NO_API_URL_MESSAGE, 0)
  }

  const response = await fetchOrFail(`${base}${path}`, {
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
    throw failure(messageFromPayload(payload, `Tactical authentication failed: ${response.status} ${response.statusText}`), response.status, payload)
  }

  // Some Tactical helper responses may be HTTP 200 while still describing an
  // authentication failure. Treat a clear error/detail payload without a token
  // or TOTP decision as a failure rather than accepting it as a session.
  if (payload && typeof payload === 'object' && !('token' in payload) && !('totp' in payload)) {
    const explicitError = payload.error || payload.detail
    if (explicitError) {
      throw failure(messageFromPayload(payload, 'Tactical authentication failed.'), response.status, payload)
    }
  }

  return payload || {}
}


function browserCookie(name) {
  if (typeof document === 'undefined') return ''
  const prefix = `${encodeURIComponent(name)}=`
  for (const part of String(document.cookie || '').split(';')) {
    const item = part.trim()
    if (item.startsWith(prefix)) return decodeURIComponent(item.slice(prefix.length))
  }
  return ''
}

function tacticalApiUrl(path) {
  const base = String(apiBase() || '').replace(/\/+$/, '')
  if (!base) throw failure(NO_API_URL_MESSAGE, 0)
  return `${base}${path}`
}

function tacticalSsoProvidersFromConfig(payload) {
  const providers = payload?.data?.socialaccount?.providers
  return Array.isArray(providers) ? providers : []
}

function submitBrowserForm(action, fields) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    throw failure('Tactical SSO requires a browser document.', 0)
  }
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = action
  form.style.display = 'none'
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = String(value ?? '')
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

// Mirror Tactical's native headless-allauth SSO handshake. A public Tec-Tac
// module contributes only the Tactical provider id and display metadata; Core
// UI owns the browser POST, callback address and every credential-bearing step.
export async function beginTacticalSso(providerId) {
  const id = String(providerId || '').trim()
  if (!id) throw failure('Tactical SSO provider id is missing.', 400)

  // Tactical's own LoginView loads this config before starting SSO. Besides
  // checking that the provider is currently advertised, this request ensures
  // the browser has the Django/allauth CSRF state required by the form POST.
  const response = await fetchOrFail(tacticalApiUrl('/_allauth/browser/v1/config/'), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    cache: 'no-store',
  })
  const payload = await parseResponsePayload(response)
  if (!response.ok) {
    throw failure(messageFromPayload(payload, `Tactical SSO configuration failed: ${response.status} ${response.statusText}`), response.status, payload)
  }

  const provider = tacticalSsoProvidersFromConfig(payload).find((item) => String(item?.id || '') === id)
  if (!provider) throw failure(`Tactical SSO provider ${id} is not currently available.`, 404, payload)

  const csrf = browserCookie('csrftoken')
  if (!csrf) throw failure('Tactical SSO could not obtain CSRF proof. Reload the sign-in page and try again.', 403)
  const callbackUrl = new URL('/account/provider/callback', window.location.origin).toString()

  submitBrowserForm(tacticalApiUrl('/_allauth/browser/v1/auth/provider/redirect/'), {
    provider: id,
    process: 'login',
    callback_url: callbackUrl,
    csrfmiddlewaretoken: csrf,
  })
  return { started: true, provider_id: id, callback_url: callbackUrl }
}

export async function completeTacticalSso() {
  const base = apiBase()
  if (!base) throw failure(NO_API_URL_MESSAGE, 0)
  const csrf = browserCookie('csrftoken')
  if (!csrf) throw failure('The Tactical SSO session is missing its CSRF proof. Start SSO sign-in again.', 403)

  const response = await fetchOrFail(`${base}/accounts/ssoproviders/token/`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-CSRFToken': csrf,
    },
    credentials: 'include',
    cache: 'no-store',
    body: '{}',
  })
  const payload = await parseResponsePayload(response)
  if (!response.ok) {
    clearTacticalSession()
    throw failure(messageFromPayload(payload, `Tactical SSO completion failed: ${response.status} ${response.statusText}`), response.status, payload)
  }
  if (!payload || typeof payload !== 'object' || !payload.token || !payload.username) {
    clearTacticalSession()
    throw failure('Tactical SSO completion did not return a valid access token.', 502, payload)
  }

  storeTacticalSession({ token: payload.token, username: payload.username, name: payload.name || null })
  try {
    const verification = await validateTacticalSession()
    if (!verification.authenticated) throw failure('The Tactical SSO access token could not be verified.', verification.status || 401)
    // Crossing the Core UI-context boundary immediately creates/validates the
    // normal Tec-Tac session-security trust row. SSO accounts remain subject to
    // the external provider's MFA lifecycle, exactly like Tactical itself.
    await apiFetch('/api/tfd/ui/context/')
  } catch (error) {
    clearTacticalSession()
    throw error
  }
  return { authenticated: true, username: payload.username, provider: payload.provider || null }
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

  throw failure('Tactical did not return a valid authentication decision.', 502, data)
}

export async function loginTacticalWithTotp(username, password, twofactor) {
  const data = await tacticalAuthRequest('/v2/login/', { username, password, twofactor })
  if (!data.token) {
    throw failure('Tactical accepted the request but did not return an access token.', 502, data)
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
    throw failure('Tec-Tac accepted the recovery request but did not return a Tactical access token.', 502, data)
  }
  storeTacticalSession({
    token: data.token,
    username: data.username || username,
    name: data.name || null,
  })
  return { authenticated: true, mfa: 'backup_code' }
}


export async function setupTacticalTotp(password) {
  const query = new URLSearchParams({ ui_url: tecTacUiBaseUrl() })
  const data = await apiFetch(`/api/tfd/auth/totp/enrollment/?${query.toString()}`, {
    method: 'POST',
    body: JSON.stringify({ password: String(password || '') }),
  })
  if (!data || typeof data !== 'object' || !data.totp_key || !data.qr_url || !data.qr_svg) {
    throw failure('Tec-Tac did not return one-time TOTP enrollment details.', 502, data)
  }

  // Core destroys Tactical's short-lived setup Knox token before returning the
  // seed. Remove the now-invalid browser copy too. Final verification uses
  // Tactical's normal /v2/login/ endpoint and returns a fresh operational token.
  clearTacticalSession()
  return data
}


export async function validateTacticalSession() {
  const base = apiBase()
  const token = tacticalToken()

  if (!base) {
    throw failure(NO_API_URL_MESSAGE, 0)
  }

  if (!token) {
    return { authenticated: false, status: 401 }
  }

  // GET /accounts/users/ is an existing Tactical endpoint protected by
  // IsAuthenticated + AccountsPerms. A 200 proves authentication and access;
  // a 403 still proves authentication but means this role lacks AccountsPerms.
  // A 401 means the browser token is missing, expired, or otherwise invalid.
  const response = await fetchOrFail(`${base}/accounts/users/`, {
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

  throw failure(`Tactical session verification failed: ${response.status} ${response.statusText}`, response.status)
}

async function authenticatedRawRequest(path, options = {}) {
  const base = apiBase()
  const token = tacticalToken()
  if (!base) throw failure(NO_API_URL_MESSAGE, 0)
  if (!token) {
    const error = failure('No Tactical access token is present in this browser session.', 401)
    invalidateTacticalSession(error.message)
    throw error
  }

  const response = await fetchOrFail(`${base}${path}`, {
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
    throw failure(messageFromPayload(payload, `API request failed: ${response.status} ${response.statusText}`), response.status, payload)
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
  // response. apiFetch (and only apiFetch) throws when a 2xx JSON object has a
  // truthy `error` or `detail` key, with .status set to that 2xx status, unless
  // the caller passes rejectErrorPayload: false. apiRaw, apiBlob and apiText
  // never inspect the body this way.
  if (options.rejectErrorPayload !== false && payload && typeof payload === 'object' && (payload.error || payload.detail)) {
    throw failure(messageFromPayload(payload, 'Tactical rejected the request.'), response.status, payload)
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
  if (!base) throw failure(NO_API_URL_MESSAGE, 0)
  if (typeof path !== 'string' || !path.startsWith('/')) throw failure('Public API path must be relative to the Tactical API root.', 0)

  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  if (options.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  // Deliberately do not attach Tactical's browser token. Public extension APIs
  // must explicitly opt into anonymous access server-side (for example AllowAny).
  headers.delete('Authorization')

  const response = await fetchOrFail(`${base}${path}`, {
    ...options,
    headers,
    credentials: 'omit',
    cache: options.cache || 'no-store',
  })
  const payload = response.status === 204 ? null : await parseResponsePayload(response)
  if (!response.ok) {
    throw failure(messageFromPayload(payload, `Public API request failed: ${response.status} ${response.statusText}`), response.status, payload)
  }
  return payload
}

export async function loadStaticModuleManifest() {
  const response = await fetch('/tec-tac/modules/modules.json', { cache: 'no-store' })
  if (!response.ok) throw failure(`Module manifest failed: ${response.status} ${response.statusText}`, response.status)
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

// Tec-Tac Core Resource Directory APIs
export async function listResourceClients({ search = '', page = 1, pageSize = 100 } = {}) {
  const query = new URLSearchParams()
  if (search) query.set('search', search)
  query.set('page', String(page))
  query.set('page_size', String(pageSize))
  return apiFetch(`/api/tfd/resources/clients/?${query.toString()}`)
}

export async function createResourceClient(name) {
  return apiFetch('/api/tfd/resources/clients/', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function updateResourceClient(clientId, name) {
  return apiFetch(`/api/tfd/resources/clients/${clientId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export async function listResourceSites({ clientId = null, search = '', page = 1, pageSize = 100 } = {}) {
  const query = new URLSearchParams()
  if (clientId) query.set('client_id', String(clientId))
  if (search) query.set('search', search)
  query.set('page', String(page))
  query.set('page_size', String(pageSize))
  return apiFetch(`/api/tfd/resources/sites/?${query.toString()}`)
}

export async function createResourceSite({ clientId, name }) {
  return apiFetch('/api/tfd/resources/sites/', {
    method: 'POST',
    body: JSON.stringify({ client_id: clientId, name }),
  })
}

export async function updateResourceSite(siteId, { clientId, name }) {
  const payload = { name }
  if (clientId) payload.client_id = clientId
  return apiFetch(`/api/tfd/resources/sites/${siteId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteResourceClient(clientId, { moveToSiteId = null } = {}) {
  return apiFetch(`/api/tfd/resources/clients/${clientId}/`, {
    method: 'DELETE',
    body: JSON.stringify(moveToSiteId ? { move_to_site_id: moveToSiteId } : {}),
  })
}

export async function deleteResourceSite(siteId, { moveToSiteId = null } = {}) {
  return apiFetch(`/api/tfd/resources/sites/${siteId}/`, {
    method: 'DELETE',
    body: JSON.stringify(moveToSiteId ? { move_to_site_id: moveToSiteId } : {}),
  })
}

export async function getResourceCustomFields(resourceType, resourceId) {
  if (resourceType === 'client') return apiFetch(`/api/tfd/resources/clients/${resourceId}/custom-fields/`)
  return apiFetch(`/api/tfd/resources/sites/${resourceId}/custom-fields/`)
}

export async function updateResourceCustomFields(resourceType, resourceId, values) {
  const options = { method: 'PATCH', body: JSON.stringify({ values }) }
  if (resourceType === 'client') return apiFetch(`/api/tfd/resources/clients/${resourceId}/custom-fields/`, options)
  return apiFetch(`/api/tfd/resources/sites/${resourceId}/custom-fields/`, options)
}


export async function getBackupRestoreDestinations() {
  return apiFetch('/api/tfd/system/backups/restore/')
}

export async function startBackupInventory(destinationIds) {
  return apiFetch('/api/tfd/system/backups/restore/', {
    method: 'POST',
    body: JSON.stringify({ action: 'list', destination_ids: destinationIds }),
  })
}

export async function startRestoreValidation({ backupRef, destinationId, restoreMode, overrides = [] }) {
  return apiFetch('/api/tfd/system/backups/restore/', {
    method: 'POST',
    body: JSON.stringify({ action: 'validate', backup_ref: backupRef, destination_id: destinationId, restore_mode: restoreMode, overrides }),
  })
}

export async function startServerRestore({ backupRef, destinationId, restoreMode, validationJobId, overrides = {} }) {
  return apiFetch('/api/tfd/system/backups/restore/', {
    method: 'POST',
    body: JSON.stringify({ action: 'restore', backup_ref: backupRef, destination_id: destinationId, restore_mode: restoreMode, validation_job_id: validationJobId, overrides, confirmed: true }),
  })
}


export async function getBackupRestoreJob(jobId) {
  return apiFetch(`/api/tfd/system/backups/restore/jobs/${jobId}/`, { rejectErrorPayload: false })
}
