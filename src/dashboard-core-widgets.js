import { h } from 'vue'

// 0.12.106: tone colours the figure with a Tactical colour property (info, positive, negative or warning). The CSS falls back
// to the theme token, so nothing changes until the person picks a colour.
function metricCard(label, value, detail, tone) {
  return h('div', { class: tone ? `dashboard-core-metric tone-${tone}` : 'dashboard-core-metric' }, [
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
          metricCard('User', state.context.user?.display_name || state.context.user?.username || '—', state.context.user?.username || '', 'info'),
          metricCard('Role', state.context.user?.role || (state.context.user?.superuser ? 'Superuser' : '—'), undefined, 'info'),
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
          metricCard('Loaded', state.moduleLoad?.loaded?.length || 0, undefined, 'positive'),
          metricCard('Failed', state.moduleLoad?.failed?.length || 0, undefined, 'negative'),
          metricCard('Skipped', state.moduleLoad?.skipped?.length || 0, undefined, 'warning'),
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
          metricCard('Permissions', state.context.permissions?.length || 0, state.context.user?.superuser ? 'superuser' : 'effective grants', 'info'),
          metricCard('Modules', state.context.modules?.length || 0, 'discovered', 'info'),
        ])
      },
    },
  })

  return core
}
