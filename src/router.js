import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from './views/DashboardView.vue'
import ModulesView from './views/ModulesView.vue'
import AccessView from './views/AccessView.vue'
import SystemUpdatesView from './views/SystemUpdatesView.vue'
import StorageView from './views/StorageView.vue'
import DiagnosticsView from './views/DiagnosticsView.vue'
import SchedulesView from './views/SchedulesView.vue'
import SchedulerSettingsView from './views/SchedulerSettingsView.vue'
import ContractsView from './views/ContractsView.vue'
import PublicPendingView from './views/PublicPendingView.vue'
import PreferencesView from './views/PreferencesView.vue'
import MenuLayoutView from './views/MenuLayoutView.vue'
import HelpView from './views/HelpView.vue'
import { requestLeave, unsavedState } from './unsaved'

export const router = createRouter({
  history: createWebHashHistory('/tec-tac/'),
  routes: [
    { path: '/', redirect: '/dashboards' },
    { path: '/dashboards', name: 'dashboards', component: DashboardView, meta: { title: 'Dashboards' } },
    { path: '/dashboards/:dashboardId', name: 'dashboard-detail', component: DashboardView, meta: { title: 'Dashboard' } },
    { path: '/modules', name: 'modules', component: ModulesView, meta: { title: 'Modules' } },
    { path: '/schedules', name: 'schedules', component: SchedulesView, meta: { title: 'Schedules' } },
    { path: '/system/scheduler', name: 'scheduler-settings', component: SchedulerSettingsView, meta: { title: 'Scheduler Configuration' } },
    { path: '/access', name: 'access', component: AccessView, meta: { title: 'Access' } },
    { path: '/system/updates', name: 'system-updates', component: SystemUpdatesView, meta: { title: 'System Updates' } },
    { path: '/system/storage', name: 'system-storage', component: StorageView, meta: { title: 'Storage & Housekeeping' } },
    { path: '/system/diagnostics', name: 'system-diagnostics', component: DiagnosticsView, meta: { title: 'Troubleshooting & Diagnostics' } },
    { path: '/contracts', name: 'contracts', component: ContractsView, meta: { title: 'Public Contracts' } },
    { path: '/preferences', name: 'preferences', component: PreferencesView, meta: { title: 'Preferences' } },
    { path: '/preferences/menu-layout', name: 'menu-layout', component: MenuLayoutView, meta: { title: 'Menu Layout' } },
    { path: '/help', name: 'help', component: HelpView, meta: { title: 'Help' } },
    { path: '/help/:articleId', name: 'help-article', component: HelpView, meta: { title: 'Help' } },
    { path: '/public/:pathMatch(.*)*', name: 'public-pending', component: PublicPendingView, meta: { title: 'Public', public: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  if (to.meta?.public) return true
  if (!unsavedState.dirty) return true
  requestLeave(() => router.push(to.fullPath))
  return false
})
