export function enrollmentSetupErrorMessage(error, normalizeError) {
  const base = typeof normalizeError === 'function'
    ? normalizeError(error)
    : (error?.message || 'Authenticator enrollment failed.')
  if (error?.status === 400 || error?.status === 401 || error?.status === 403 || error?.status === 429) return base
  return `${base} If the one-time enrollment response was lost, ask an administrator to reset 2FA for this account before trying again.`
}
