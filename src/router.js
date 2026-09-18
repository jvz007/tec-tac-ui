import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from './views/DashboardView.vue'
import ModulesView from './views/ModulesView.vue'
import AccessView from './views/AccessView.vue'
import SystemUpdatesView from './views/SystemUpdatesView.vue'
import PublicPendingView from './views/PublicPendingView.vue'
import { requestLeave, unsavedState } from './unsaved'

export const router = createRouter({
  history: createWebHashHistory('/tec-tac/'),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView, meta: { title: 'Overview' } },
    { path: '/modules', name: 'modules', component: ModulesView, meta: { title: 'Modules' } },
    { path: '/access', name: 'access', component: AccessView, meta: { title: 'Access' } },
    { path: '/system/updates', name: 'system-updates', component: SystemUpdatesView, meta: { title: 'System Updates' } },
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
