export function authorizationRevokedState(health) {
  const count = Number(health?.authorization_revoked_last_24h || 0)
  if (!count) return { count: 0, visible: false, label: '', error: '' }

  const latest = health?.last_authorization_revoked || {}
  return {
    count,
    visible: true,
    label: latest.schedule_name || latest.schedule_id || 'schedule',
    error: latest.error || '',
  }
}
