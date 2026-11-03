import { canEditRuntimeSettings } from './runtime-settings.js'
import { canSeeResourceDirectory } from './resource-directory-read.js'
import { canListApiKeys } from './api-keys.js'
import { badgeText, canSeeModuleUpdates } from './module-updates.js'

export const DEFAULT_SECTION_ORDER = Object.freeze([
  'Workspace',
  'Operations',
  'Extensions',
  'Administration',
  'Configuration',
])

// 0.12.125: extras.moduleUpdateCount is the module update count (Core 1.17.104). The Modules entry shows it as a badge only for
// a person who can manage modules and only when it is above 0.
export function coreNavigation(context = {}, extras = {}) {
  const capabilities = context.capabilities || {}
  const superuser = context.user?.superuser === true
  const modulesBadge = canSeeModuleUpdates(context) ? badgeText(extras?.moduleUpdateCount) : ''
  return [
    { label: 'Dashboards', icon: '⌂', to: '/dashboards', section: 'Workspace', visible: true, owner: 'core' },
    { label: 'My Account', icon: '◎', to: '/account', section: 'Workspace', visible: true, owner: 'core' },
    { label: 'Schedules', icon: '◷', to: '/schedules', section: 'Operations', visible: capabilities.manage_schedules !== false, owner: 'core' },
    { label: 'Modules', icon: '▦', to: '/modules', section: 'Administration', visible: true, owner: 'core', ...(modulesBadge ? { badge: modulesBadge, badgeTitle: `${modulesBadge} module update${modulesBadge === '1' ? '' : 's'} available` } : {}) },
    { label: 'Access', icon: '⛨', to: '/access', section: 'Administration', visible: capabilities.list_accounts !== false || capabilities.list_roles !== false || canListApiKeys(context), owner: 'core' },
    { label: 'Clients & Sites', icon: '▤', to: '/resources', section: 'Administration', visible: capabilities.list_clients === true || canSeeResourceDirectory(context), owner: 'core' },
    { label: 'Scheduler Configuration', icon: '◷', to: '/system/scheduler', section: 'Administration', visible: capabilities.manage_schedules === true || superuser, owner: 'core' },
    { label: 'System Configuration', icon: '⚙', to: '/system/settings', section: 'Administration', visible: canEditRuntimeSettings(context), owner: 'core' },
    { label: 'System Updates', icon: '⇧', to: '/system/updates', section: 'Administration', visible: capabilities.manage_modules === true || superuser, owner: 'core' },
    { label: 'Storage & Housekeeping', icon: '⌫', to: '/system/storage', section: 'Administration', visible: capabilities.manage_modules === true || superuser, owner: 'core' },
    { label: 'Backup & Restore', icon: '↺', to: '/system/backups', section: 'Administration', visible: superuser, owner: 'core' },
    { label: 'Troubleshooting & Diagnostics', icon: '◇', to: '/system/diagnostics', section: 'Administration', visible: capabilities.manage_modules === true || superuser, owner: 'core' },
    { label: 'Public Contracts', icon: '⌘', to: '/contracts', section: 'Administration', visible: capabilities.manage_modules === true || superuser, owner: 'core' },
  ]
}
