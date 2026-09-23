export const DEFAULT_SECTION_ORDER = Object.freeze([
  'Workspace',
  'Operations',
  'Extensions',
  'Administration',
  'Configuration',
])

export function coreNavigation(context = {}) {
  const capabilities = context.capabilities || {}
  const superuser = context.user?.superuser === true
  return [
    { label: 'Dashboards', icon: '⌂', to: '/dashboards', section: 'Workspace', visible: true, owner: 'core' },
    { label: 'Schedules', icon: '◷', to: '/schedules', section: 'Operations', visible: capabilities.manage_schedules !== false, owner: 'core' },
    { label: 'Modules', icon: '▦', to: '/modules', section: 'Administration', visible: true, owner: 'core' },
    { label: 'Access', icon: '⛨', to: '/access', section: 'Administration', visible: capabilities.list_accounts !== false || capabilities.list_roles !== false, owner: 'core' },
    { label: 'Scheduler Configuration', icon: '◷', to: '/system/scheduler', section: 'Administration', visible: capabilities.manage_schedules === true || superuser, owner: 'core' },
    { label: 'System Updates', icon: '⇧', to: '/system/updates', section: 'Administration', visible: capabilities.manage_modules === true || superuser, owner: 'core' },
    { label: 'Storage & Housekeeping', icon: '⌫', to: '/system/storage', section: 'Administration', visible: capabilities.manage_modules === true || superuser, owner: 'core' },
    { label: 'Public Contracts', icon: '⌘', to: '/contracts', section: 'Administration', visible: capabilities.manage_modules === true || superuser, owner: 'core' },
  ]
}
