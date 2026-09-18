import { reactive } from 'vue'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { state, loadContext } from './state'
import { loadUiModules } from './module-loader'
import './styles.css'

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

if (state.status === 'ready') {
  state.moduleLoad = await loadUiModules(
    {
      app,
      router,
      state,
      addNavigation,
      api: async (path, options) => {
        const { apiFetch } = await import('./api')
        return apiFetch(path, options)
      },
      hasPermission: (code) => (
        state.context.user?.superuser || state.context.permissions.includes(code)
      ),
    },
    state.context.modules || [],
  )
}

app.mount('#app')
