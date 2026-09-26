import { apiFetch } from './api'

export const TACTICAL_PERMISSION_GROUPS = [
  { name: 'Agents', keys: ['can_list_agents','can_use_mesh','can_uninstall_agents','can_update_agents','can_edit_agent','can_manage_procs','can_view_eventlogs','can_send_cmd','can_reboot_agents','can_install_agents','can_run_scripts','can_run_bulk','can_recover_agents','can_list_agent_history','can_send_wol','can_use_registry','can_use_terminal'] },
  { name: 'Core', keys: ['can_list_notes','can_manage_notes','can_view_core_settings','can_edit_core_settings','can_do_server_maint','can_code_sign','can_run_urlactions','can_view_customfields','can_manage_customfields','can_run_server_scripts','can_use_webterm','can_view_global_keystore','can_edit_global_keystore','can_view_schedules','can_manage_schedules'] },
  { name: 'Checks', keys: ['can_list_checks','can_manage_checks','can_run_checks'] },
  { name: 'Clients & sites', keys: ['can_list_clients','can_manage_clients','can_list_sites','can_manage_sites','can_list_deployments','can_manage_deployments'] },
  { name: 'Automation', keys: ['can_list_automation_policies','can_manage_automation_policies','can_list_autotasks','can_manage_autotasks','can_run_autotasks'] },
  { name: 'Logs', keys: ['can_view_auditlogs','can_list_pendingactions','can_manage_pendingactions','can_view_debuglogs'] },
  { name: 'Scripts', keys: ['can_list_scripts','can_manage_scripts'] },
  { name: 'Alerts', keys: ['can_list_alerts','can_manage_alerts','can_list_alerttemplates','can_manage_alerttemplates'] },
  { name: 'Endpoint operations', keys: ['can_manage_winsvcs','can_list_software','can_manage_software','can_manage_winupdates'] },
  { name: 'Accounts & roles', keys: ['can_list_accounts','can_manage_accounts','can_list_roles','can_manage_roles','can_list_api_keys','can_manage_api_keys'] },
  { name: 'Reporting', keys: ['can_view_reports','can_manage_reports'] },
]

export function permissionLabel(key) {
  return key.replace(/^can_/, '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function listUsers(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : ''
  return apiFetch(`/accounts/users/${query}`)
}

export function createUser(payload) {
  return apiFetch('/accounts/users/', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateUser(id, payload) {
  return apiFetch(`/accounts/${id}/users/`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteUser(id) {
  return apiFetch(`/accounts/${id}/users/`, { method: 'DELETE' })
}

export function resetUserPassword(id, password) {
  return apiFetch('/accounts/users/reset/', { method: 'POST', body: JSON.stringify({ id, password }) })
}

export function resetUserTotp(id) {
  return apiFetch('/accounts/users/reset_totp/', { method: 'PUT', body: JSON.stringify({ id }) })
}

export function listRoles() {
  return apiFetch('/accounts/roles/')
}

export function getRole(id) {
  return apiFetch(`/accounts/roles/${id}/`)
}

export function createRole(name) {
  return apiFetch('/accounts/roles/', { method: 'POST', body: JSON.stringify({ name }) })
}

export function updateRole(id, payload) {
  return apiFetch(`/accounts/roles/${id}/`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteRole(id) {
  return apiFetch(`/accounts/roles/${id}/`, { method: 'DELETE' })
}

export function getExtensionPermissionCatalog() {
  return apiFetch('/api/tfd/access/extensions/')
}

export function getRoleExtensionPermissions(id) {
  return apiFetch(`/api/tfd/access/roles/${id}/permissions/`)
}

export function updateRoleExtensionPermissions(id, permissions) {
  return apiFetch(`/api/tfd/access/roles/${id}/permissions/`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  })
}

export function getMfaBackupCodeStatus() {
  return apiFetch('/api/tfd/auth/mfa/backup-codes/')
}

export function generateMfaBackupCodes(password, totp) {
  return apiFetch('/api/tfd/auth/mfa/backup-codes/', {
    method: 'POST',
    body: JSON.stringify({ password, totp }),
  })
}

export function listActiveLoginSessions() {
  return apiFetch('/api/tfd/access/sessions/')
}

export function revokeLoginSession(sessionId, reason = 'administrator-request') {
  return apiFetch(`/api/tfd/access/sessions/${encodeURIComponent(sessionId)}/revoke/`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  })
}

export function revokeUserLoginSessions(userId, reason = 'administrator-request') {
  return apiFetch(`/api/tfd/access/users/${encodeURIComponent(userId)}/sessions/revoke/`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}
