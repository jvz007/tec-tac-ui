import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView from './views/DashboardView.vue'
import ModulesView from './views/ModulesView.vue'
import AccessView from './views/AccessView.vue'

export const router = createRouter({
  history: createWebHashHistory('/tec-tac/'),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView, meta: { title: 'Overview' } },
    { path: '/modules', name: 'modules', component: ModulesView, meta: { title: 'Modules' } },
    { path: '/access', name: 'access', component: AccessView, meta: { title: 'Access' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
