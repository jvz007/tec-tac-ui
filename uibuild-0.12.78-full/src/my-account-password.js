export function passwordFailureMessage(error, fallback = 'Unable to change password.') {
  const message = String(error?.message || '').trim()
  return message || fallback
}
