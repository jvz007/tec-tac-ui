import { apiFetch } from './api.js'

export function getMyAccount() {
  return apiFetch('/api/tfd/account/')
}

export function changeMyPassword(currentPassword, newPassword) {
  return apiFetch('/api/tfd/account/password/', {
    method: 'PUT',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

export function resetMyTotp(currentPassword, currentTotp) {
  return apiFetch('/api/tfd/account/totp/reset/', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, current_totp: currentTotp }),
  })
}

export function revokeMyOtherSessions() {
  return apiFetch('/api/tfd/session/revoke-others/', {
    method: 'POST',
    body: JSON.stringify({ reason: 'user-revoke-others' }),
  })
}

export function saveMyTacticalUiPreferences(preferences) {
  return apiFetch('/api/tfd/account/tactical-ui/', {
    method: 'PUT',
    body: JSON.stringify(preferences || {}),
  })
}
