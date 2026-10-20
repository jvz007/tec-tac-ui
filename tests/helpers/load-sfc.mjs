// 0.12.119: loads .vue files and their imports for a node test with Vite's own SSR loader (the same plugin the build uses), so a
// component can be rendered with vue/server-renderer. One server per test file; call close() at the end.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export async function createSfcLoader() {
  // The shell modules read these when they load; a test that needs different ones sets them first.
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} }
  globalThis.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} }
  globalThis.window ??= { _env_: {}, dispatchEvent() {}, addEventListener() {}, removeEventListener() {}, location: { origin: 'https://rmm.example.test' } }
  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    plugins: [vue()],
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    define: { __TEC_TAC_UI_VERSION__: JSON.stringify('test') },
    ssr: { noExternal: [] },
  })
  return {
    load: (file) => server.ssrLoadModule(`/${file.replace(/^\/+/, '')}`),
    close: () => server.close(),
  }
}
