// Core 1.17.22: the first-login setup session ended before enrolment finished.
export const SETUP_SESSION_REQUIRED_CODE = 'setup_session_required'
export const SETUP_SESSION_ENDED_MESSAGE = 'Your setup session ended. Sign in again.'

// Each sign-in step names only what that step asked for (0.12.99). Steps: credentials, totp, backup, setup-proof, setup.
const REFUSED_BY_STEP = {
  credentials: 'The username or password was not accepted by Tactical.',
  totp: 'The authentication code was not accepted. Check the code and try again.',
  backup: 'The backup code was not accepted. Enter one you have not used yet.',
  'setup-proof': 'The password was not accepted. Enter your current password again.',
  setup: 'The authentication code was not accepted. Check the code and try again.',
}
export function signInErrorMessage(error, step = 'credentials') {
  if (!error) return 'Authentication failed.'
  if (error.code === SETUP_SESSION_REQUIRED_CODE) return SETUP_SESSION_ENDED_MESSAGE
  if (error.status === 400 || error.status === 401 || error.status === 403) return REFUSED_BY_STEP[step] || REFUSED_BY_STEP.credentials
  if (error.status === 429) return 'Too many authentication attempts. Wait a moment before trying again.'
  return error.message || 'Authentication failed.'
}

export function enrollmentSetupErrorMessage(error, normalizeError) {
  if (error?.code === SETUP_SESSION_REQUIRED_CODE) return SETUP_SESSION_ENDED_MESSAGE
  const base = typeof normalizeError === 'function'
    ? normalizeError(error)
    : (error?.message || 'Authenticator enrollment failed.')
  if (error?.status === 400 || error?.status === 401 || error?.status === 403 || error?.status === 429) return base
  return `${base} If the one-time enrollment response was lost, ask an administrator to reset 2FA for this account before trying again.`
}
