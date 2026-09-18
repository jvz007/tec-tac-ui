import { reactive } from 'vue'
import { createApp } from 'vue'
import App from './App.vue'
import { apiFetch } from './api'
import { router } from './router'
import { state, loadContext } from './state'
import { loadUiModules } from './module-loader'
import './styles.css'

async function bootstrap() {
  const app = createApp(App)
  const navigation = reactive([])

  function addNavigation(item) {
    if (!item?.to || !item?.label) return
    if (navigation.some((existing) => existing.to === item.to)) return
    navigation.push(item)
  }

  app.provide('tecTacState', state)
  app.provide('tecTacNavigation', navigation)
  app.use(router)

  // Mount the shell first so the operator sees an explicit session-verification
  // state instead of a blank page or a dashboard based on stale browser data.
  app.mount('#app')

  await loadContext()

  if (state.status === 'ready') {
    state.moduleLoad = await loadUiModules(
      {
        app,
        router,
        state,
        addNavigation,
        api: apiFetch,
        hasPermission: (code) => (
          state.context.user?.superuser || state.context.permissions.includes(code)
        ),
      },
      state.context.modules || [],
    )
  }
}

bootstrap().catch((error) => {
  console.error('[TEC-TAC-UI] Bootstrap failed.', error)
  state.error = error
  state.authStatus = state.authStatus === 'verified' ? 'verified' : 'error'
  state.status = 'failed'
})
