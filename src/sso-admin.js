// Single sign-on admin (0.12.100, Core 1.17.28): pure helpers for the Access area's SSO tab and the Disconnect control on a user.
// Tactical's routes do the work (/accounts/ssoproviders/ ...) through api.js. Core refuses every change except for an effective
// superuser (AD-12: refused and hidden); the UI hides the controls for anyone else. The sign-in routes are not touched here.

export const SSO_REDACTED = '[REDACTED]'
export const SSO_LOCKOUT_CODE = 'sso_lockout_guard'

// Core's superuser is the effective flag (user or role). A superuser object with no flags still counts.
export function canAdministerSso(context) {
  return context?.user?.superuser === true
}

// The tab shows for Tactical's can_list_accounts. Anyone who can see it reads the redacted list.
export function canSeeSso(context) {
  return context?.capabilities?.list_accounts === true
}

export function isRedacted(value) {
  return value === SSO_REDACTED
}

function roleValue(role) {
  if (role === '' || role === null || role === undefined) return null
  const number = Number(role)
  return Number.isInteger(number) && number > 0 ? number : null
}

// Tactical reads server_url and role with no default, so both keys are always sent; role is null when none is picked.
// Add sends name and secret too. Edit never sends name (Tactical does not allow it) and omits the secret when it is blank
// or the redacted marker, so a stored secret is never replaced with text.
export function buildProviderPayload(input, mode = 'add') {
  const base = {
    client_id: String(input?.client_id ?? '').trim(),
    server_url: String(input?.server_url ?? '').trim(),
    role: roleValue(input?.role),
  }
  const secret = String(input?.secret ?? '')
  if (mode === 'add') {
    return { name: String(input?.name ?? '').trim(), client_id: base.client_id, secret, server_url: base.server_url, role: base.role }
  }
  const payload = { client_id: base.client_id, server_url: base.server_url, role: base.role }
  if (secret && !isRedacted(secret)) payload.secret = secret
  return payload
}

// The plain checks before a call. Returns a sentence, or '' when the form is fine.
export function providerFormError(input, mode = 'add') {
  if (mode === 'add' && !String(input?.name ?? '').trim()) return 'Enter a name for the provider.'
  if (!String(input?.client_id ?? '').trim()) return 'Enter the client ID from your identity provider.'
  if (mode === 'add' && (!String(input?.secret ?? '').trim() || isRedacted(input?.secret))) return 'Enter the client secret from your identity provider.'
  const url = String(input?.server_url ?? '').trim()
  if (!/^https?:\/\/\S+$/i.test(url)) return 'Enter the server URL, starting with https://.'
  return ''
}

// Both booleans, always. Tactical's POST needs both.
export function buildSettingsPayload(input) {
  return {
    sso_enabled: input?.sso_enabled === true,
    block_local_user_logon: input?.block_local_user_logon === true,
  }
}

// Core's lock-out guard (409, code sso_lockout_guard) sends a plain sentence. Only that answer returns text; any other error returns null.
export function lockoutDetail(error) {
  if (!error || error.status !== 409 || error.code !== SSO_LOCKOUT_CODE) return null
  const detail = error.payload && typeof error.payload === 'object' ? error.payload.detail : null
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  return typeof error.message === 'string' && error.message.trim() ? error.message.trim() : null
}

// The Yes or No question comes first when a save turns local sign-in blocking on. A save that keeps it on asks nothing.
export function blockingWarningNeeded(before, after) {
  return after?.block_local_user_logon === true && before?.block_local_user_logon !== true
}
