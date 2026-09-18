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
