// Core 1.17.22: the first-login setup session ended before enrolment finished.
export const SETUP_SESSION_REQUIRED_CODE = 'setup_session_required'
export const SETUP_SESSION_ENDED_MESSAGE = 'Your setup session ended. Sign in again.'

export function enrollmentSetupErrorMessage(error, normalizeError) {
  if (error?.code === SETUP_SESSION_REQUIRED_CODE) return SETUP_SESSION_ENDED_MESSAGE
  const base = typeof normalizeError === 'function'
    ? normalizeError(error)
    : (error?.message || 'Authenticator enrollment failed.')
  if (error?.status === 400 || error?.status === 401 || error?.status === 403 || error?.status === 429) return base
  return `${base} If the one-time enrollment response was lost, ask an administrator to reset 2FA for this account before trying again.`
}
