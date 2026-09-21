import { h } from 'vue'

function metricCard(label, value, detail) {
  return h('div', { class: 'dashboard-core-metric' }, [
    h('span', { class: 'label' }, label),
    h('strong', String(value ?? '—')),
    detail ? h('small', detail) : null,
  ])
}

export function registerCoreDashboardWidgets(registry, state) {
  const core = registry.forModule('core')

  core.register({
    id: 'core.session',
    title: 'Session',
    description: 'Current authenticated Tec-Tac user and role.',
    category: 'Core',
    defaultSize: { w: 4, h: 2 },
    component: {
      name: 'CoreSessionDashboardWidget',
      setup() {
        return () => h('div', { class: 'dashboard-core-widget' }, [
          metricCard('User', state.context.user?.display_name || state.context.user?.username || '—', state.context.user?.username || ''),
          metricCard('Role', state.context.user?.role || (state.context.user?.superuser ? 'Superuser' : '—')),
        ])
      },
    },
  })

  core.register({
    id: 'core.modules',
    title: 'Module runtime',
    description: 'Loaded, failed, and skipped dynamic module totals.',
    category: 'Core',
    defaultSize: { w: 4, h: 2 },
    component: {
      name: 'CoreModuleDashboardWidget',
      setup() {
        return () => h('div', { class: 'dashboard-core-widget triple' }, [
          metricCard('Loaded', state.moduleLoad?.loaded?.length || 0),
          metricCard('Failed', state.moduleLoad?.failed?.length || 0),
          metricCard('Skipped', state.moduleLoad?.skipped?.length || 0),
        ])
      },
    },
  })

  core.register({
    id: 'core.permissions',
    title: 'Access summary',
    description: 'Effective permissions and discovered modules.',
    category: 'Core',
    defaultSize: { w: 4, h: 2 },
    component: {
      name: 'CoreAccessDashboardWidget',
      setup() {
        return () => h('div', { class: 'dashboard-core-widget' }, [
          metricCard('Permissions', state.context.permissions?.length || 0, state.context.user?.superuser ? 'superuser' : 'effective grants'),
          metricCard('Modules', state.context.modules?.length || 0, 'discovered'),
        ])
      },
    },
  })

  return core
}
