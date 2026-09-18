import { reactive } from 'vue'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { state, loadContext } from './state'
import { loadUiModules } from './module-loader'
import { apiFetch } from './api'
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

  await loadContext()

  if (state.status === 'ready' && state.authStatus === 'verified') {
    state.moduleLoad = await loadUiModules(
      {
        app,
        router,
        state,
        addNavigation,
        api: (path, options) => apiFetch(path, options),
        hasPermission: (code) => (
          state.context.user?.superuser || state.context.permissions.includes(code)
        ),
      },
      state.context.modules || [],
    )
  }

  app.mount('#app')
}

bootstrap().catch((error) => {
  console.error('[TEC-TAC-UI] Bootstrap failed.', error)

  const root = document.querySelector('#app')
  if (root) {
    root.innerHTML = `
      <main style="font-family:system-ui,sans-serif;padding:24px">
        <h1>Tec-Tac failed to start</h1>
        <p>Open the browser developer console for details.</p>
      </main>
    `
  }
})
