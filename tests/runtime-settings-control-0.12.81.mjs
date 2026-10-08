import assert from 'node:assert/strict'
import fs from 'node:fs'

const storage = new Map([['access_token', 'abc123']])
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null },
  setItem(key, value) { storage.set(key, String(value)) },
  removeItem(key) { storage.delete(key) },
}
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {}, addEventListener() {} }
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const {
  RUNTIME_SETTINGS_PATH,
  canEditRuntimeSettings,
  getRuntimeSettings,
  saveRegisterTimeout,
  validateRegisterTimeout,
} = await import('../src/runtime-settings.js')

// The helper calls the right path, method and body.
{
  const calls = []
  const api = async (path, options) => {
    calls.push({ path, options })
    return { module_register_timeout_seconds: { value: 45, minimum: 5, maximum: 300, default: 30 }, updated_at: '2026-10-08T10:00:00Z', updated_by: 'admin' }
  }
  const settings = await getRuntimeSettings({ api })
  assert.equal(calls[0].path, '/api/tfd/system/runtime-settings/')
  assert.equal(calls[0].options, undefined)
  assert.deepEqual(settings, { value: 45, minimum: 5, maximum: 300, default: 30, updated_by: 'admin', updated_at: '2026-10-08T10:00:00Z' })
  const saved = await saveRegisterTimeout(60, { api })
  assert.equal(calls[1].path, RUNTIME_SETTINGS_PATH)
  assert.equal(calls[1].options.method, 'PATCH')
  assert.deepEqual(JSON.parse(calls[1].options.body), { module_register_timeout_seconds: 60 })
  assert.equal(saved.value, 45)
}

// It goes through apiFetch (token header added by api.js, never by the helper).
{
  let seen = null
  globalThis.fetch = async (url, options) => { seen = { url, options }; return json({ module_register_timeout_seconds: { value: 30, minimum: 5, maximum: 300, default: 30 }, updated_at: null, updated_by: null }) }
  const settings = await getRuntimeSettings()
  assert.equal(seen.url, 'https://rmm.example.test/api/tfd/system/runtime-settings/')
  assert.equal(seen.options.headers.get('Authorization'), 'Token abc123')
  assert.equal(settings.updated_by, null)
}

// Client validation: whole number from 5 to 300 only.
for (const bad of [4, 301, 30.5, '30', '', null, undefined, NaN, true, 0, -5]) {
  assert.equal(validateRegisterTimeout(bad).valid, false, `rejects ${String(bad)}`)
}
for (const good of [5, 30, 300]) assert.equal(validateRegisterTimeout(good).valid, true)
await assert.rejects(() => saveRegisterTimeout(4, { api: async () => { throw new Error('must not call') } }), /from 5 to 300/)

// A 404 (older Core) hides the card: the helper returns null.
assert.equal(await getRuntimeSettings({ api: async () => { throw Object.assign(new Error('Not found'), { status: 404 }) } }), null)
// Other errors surface.
await assert.rejects(() => getRuntimeSettings({ api: async () => { throw Object.assign(new Error('down'), { status: 500 }) } }), /down/)

// The editor is shown for a superuser, core.privileged_operations or core.runtime_settings.manage.
assert.equal(canEditRuntimeSettings({ user: { superuser: true }, permissions: [] }), true)
assert.equal(canEditRuntimeSettings({ user: {}, permissions: ['core.privileged_operations'] }), true)
assert.equal(canEditRuntimeSettings({ user: {}, permissions: ['core.runtime_settings.manage'] }), true)
assert.equal(canEditRuntimeSettings({ user: {}, permissions: ['core.view'] }), false)
assert.equal(canEditRuntimeSettings({ user: {}, permissions: [] }), false)
assert.equal(canEditRuntimeSettings({}), false)
assert.equal(canEditRuntimeSettings(undefined), false)

// A Core 400 message is surfaced as returned.
globalThis.fetch = async () => json({ detail: 'module_register_timeout_seconds must be between 5 and 300.' }, 400)
await assert.rejects(() => saveRegisterTimeout(60), (error) => error.message === 'module_register_timeout_seconds must be between 5 and 300.' && error.status === 400)
globalThis.fetch = async () => json({ detail: 'Tec-Tac core.privileged_operations permission is required to change runtime settings.' }, 403)
await assert.rejects(() => saveRegisterTimeout(60), (error) => error.status === 403 && /privileged_operations/.test(error.message))
globalThis.fetch = async () => json({ detail: 'Request was throttled.' }, 429)
await assert.rejects(() => saveRegisterTimeout(60), (error) => error.status === 429 && error.message === 'Request was throttled.')

// Source checks.
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
assert.doesNotMatch(read('../src/views/ModulesView.vue'), /RuntimeSettingsCard/, 'the card moved to System Configuration in 0.12.83')
assert.match(read('../src/views/SystemSettingsView.vue'), /<RuntimeSettingsCard v-if="allowed" \/>/)
const card = read('../src/components/RuntimeSettingsCard.vue')
assert.match(card, /<form v-if="canEdit"/)
assert.match(card, /core.privileged_operations or core.runtime_settings.manage/)
assert.match(card, /applies the next time the page is loaded/)
assert.match(JSON.parse(read('../tec_tac_package.json')).requires['tec-tac-framework'], /^>=1\.17\.\d+,<2\.0\.0$/)

// --- server_url ------------------------------------------------------------
const { emptyRuntimeContext, normalizeBackendRuntimeContext } = await import('../src/runtime-context.js')
assert.equal(emptyRuntimeContext().server_url, '')
assert.equal(normalizeBackendRuntimeContext({}).server_url, '')

const { tacticalServerUrl } = await import('../src/api.js')
window._env_ = { PROD_URL: ' https://rmm.example.test/ ' }
assert.equal(tacticalServerUrl(), 'https://rmm.example.test')
window._env_ = { PROD_URL: 'https://rmm.example.test:8443///' }
assert.equal(tacticalServerUrl(), 'https://rmm.example.test:8443')
for (const bad of ['javascript:alert(1)', '/relative', 'rmm.example.test', 'ftp://x.test', '', undefined]) {
  window._env_ = { PROD_URL: bad }
  assert.equal(tacticalServerUrl(), '', `rejects ${String(bad)}`)
}

// state.js sets it after normalizing.
function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const { state, loadContext, recordModuleRuntimeError, MODULE_RUNTIME_ERROR_LIMIT } = await dataModule('../src/state.js', [
  ["import { reactive } from 'vue'", 'const reactive = (value) => value'],
  ["from './api'", `from '${new URL('../src/api.js', import.meta.url).href}'`],
  ["from './runtime-context'", `from '${new URL('../src/runtime-context.js', import.meta.url).href}'`],
])
window._env_ = { PROD_URL: 'https://rmm.example.test/' }
globalThis.fetch = async (url) => {
  if (String(url).endsWith('/accounts/users/')) return json([])
  if (String(url).endsWith('/api/tfd/ui/context/')) return json({ user: { username: 'alice' }, permissions: [], module_register_timeout_seconds: 90 })
  throw new Error(`unexpected ${url}`)
}
await loadContext([])
assert.equal(state.status, 'ready')
assert.equal(state.context.server_url, 'https://rmm.example.test')
assert.equal(state.context.module_register_timeout_seconds, 90)
window._env_ = { PROD_URL: 'javascript:void(0)' }
await loadContext([])
assert.equal(state.context.server_url, '')

// The runtime error list is capped at 50.
assert.equal(MODULE_RUNTIME_ERROR_LIMIT, 50)
state.moduleRuntimeErrors.length = 0
for (let i = 0; i < 60; i += 1) recordModuleRuntimeError({ provider: `m${i}`, error: new Error(`e${i}`) })
assert.equal(state.moduleRuntimeErrors.length, 50)
assert.equal(state.moduleRuntimeErrors[0].provider, 'm10')
assert.equal(state.moduleRuntimeErrors[49].message, 'e59')
assert.doesNotThrow(() => recordModuleRuntimeError())

console.log('[TEST] runtime settings control and server_url OK')
