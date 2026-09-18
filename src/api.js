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

export function storeTacticalSession({ token, username, name }) {
  if (!token) throw new Error('Tactical did not return an access token.')
  localStorage.setItem('access_token', token)
  if (username) localStorage.setItem('user_name', username)
  else localStorage.removeItem('user_name')
  if (name) localStorage.setItem('name', name)
  else localStorage.removeItem('name')
}

export function clearTacticalSession() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('user_name')
  localStorage.removeItem('name')
}

function buildHeaders(options = {}) {
  const token = tacticalToken()
  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
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
  // account has no TOTP secret yet, then its own frontend sends the user to
  // /totp_setup. Mirror that security flow: preserve the setup token but do
  // not grant Tec-Tac access until enrollment is complete.
  if (data.totp === false && data.token) {
    storeTacticalSession({
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

export async function apiFetch(path, options = {}) {
  const base = apiBase()
  const token = tacticalToken()
  if (!base) throw new Error('Tactical API URL is unavailable. /env-config.js did not provide PROD_URL.')
  if (!token) {
    const error = new Error('No Tactical access token is present in this browser session.')
    error.status = 401
    throw error
  }

  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: buildHeaders(options),
    credentials: 'include',
  })

  if (!response.ok) {
    const error = new Error(`API request failed: ${response.status} ${response.statusText}`)
    error.status = response.status
    try { error.payload = await response.json() } catch {}
    throw error
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
