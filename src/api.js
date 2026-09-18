export function apiBase() {
  return window._env_?.PROD_URL || ''
}

export function tacticalToken() {
  return localStorage.getItem('access_token')
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

function apiError(response, payload = null) {
  const error = new Error(`API request failed: ${response.status} ${response.statusText}`)
  error.status = response.status
  error.payload = payload
  return error
}

export async function validateTacticalSession() {
  const base = apiBase()
  const token = tacticalToken()

  if (!base) {
    const error = new Error('Tactical API URL is unavailable. /env-config.js did not provide PROD_URL.')
    error.code = 'API_BASE_UNAVAILABLE'
    throw error
  }

  if (!token) {
    return { authenticated: false, status: 401, reason: 'missing-token' }
  }

  // Tactical 1.5.x exposes PATCH /accounts/users/ui/ for the authenticated
  // user's UI settings. A harmless GET still runs authentication/permissions
  // before Django returns Method Not Allowed. This gives the shell a way to
  // validate the existing Tactical token without modifying user data.
  const response = await fetch(`${base}/accounts/users/ui/`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Token ${token}`,
    },
    credentials: 'include',
    cache: 'no-store',
  })

  if (response.status === 401) {
    return { authenticated: false, status: 401, reason: 'rejected-token' }
  }

  // 405 is the expected response for a valid normal Tactical user because
  // this endpoint only implements PATCH. 403 still proves authentication
  // occurred, but indicates Tactical denied this account at the permission
  // layer (for example an installer-only account).
  if (response.status === 405) {
    return { authenticated: true, status: 405, reason: 'verified' }
  }

  if (response.status === 403) {
    return { authenticated: true, status: 403, reason: 'verified-restricted' }
  }

  const error = new Error(`Unable to verify Tactical session: ${response.status} ${response.statusText}`)
  error.status = response.status
  throw error
}

export async function apiFetch(path, options = {}) {
  const base = apiBase()
  const token = tacticalToken()
  if (!base) throw new Error('Tactical API URL is unavailable. /env-config.js did not provide PROD_URL.')
  if (!token) {
    const error = new Error('No Tactical access token is present in this browser session.')
    error.status = 401
    throw error
  }

  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  headers.set('Authorization', `Token ${token}`)

  const response = await fetch(`${base}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    let payload = null
    try { payload = await response.json() } catch {}
    throw apiError(response, payload)
  }

  if (response.status === 204) return null
  return response.json()
}

export async function loadStaticModuleManifest() {
  const response = await fetch('/tec-tac/modules/modules.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`Module manifest failed: ${response.status} ${response.statusText}`)
  const modules = await response.json()
  if (!Array.isArray(modules)) throw new Error('Module manifest must contain a JSON array.')
  return modules
}
