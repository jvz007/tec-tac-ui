// 0.12.119 (Q83): a way to open the System Updates and server-maintenance job logs, with the three logs kept apart. The History tab
// has a Log source select; System Updates has Open log on its history rows. Pure rules, the two api.js routes through a stub fetch,
// the real components rendered with Vite's SSR loader, and the source rules (text only, no token in a URL, rights).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createSfcLoader } from './helpers/load-sfc.mjs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const calls = []
globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'tok-1' : null), setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {}, location: { origin: 'https://rmm.example.test' } }
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options })
  return new Response('{"detail":"nothing"}', { status: 404, headers: { 'content-type': 'application/json' } })
}
const logs = await import(new URL('../src/system-job-logs.js', import.meta.url).href)
const api = await import(new URL('../src/api.js', import.meta.url).href)

// ---- the two api.js reads: routes and the Authorization header only ----
calls.length = 0
await api.listMaintenanceJobs({ limit: 100 }).catch(() => {})
assert.equal(calls[0].url, 'https://rmm.example.test/api/tfd/system/maintenance/jobs/?limit=100')
await api.listMaintenanceJobs({ limit: 5000 }).catch(() => {})
assert.equal(calls[1].url.endsWith('?limit=100'), true, 'the limit stays 1 to 100')
await api.getMaintenanceJob('0b8e0d3a-0000-4000-8000-000000000001').catch(() => {})
assert.equal(calls[2].url, 'https://rmm.example.test/api/tfd/system/maintenance/jobs/0b8e0d3a-0000-4000-8000-000000000001/')
await api.getSystemUpdateJob('abc').catch(() => {})
assert.equal(calls[3].url, 'https://rmm.example.test/api/tfd/system/updates/jobs/abc/', 'a plain id stays as it was (0.12.120 encodes it)')
for (const call of calls) {
  assert.ok(!/token|access_token/i.test(call.url), 'no token in a URL')
  assert.equal(call.options.headers.get('Authorization'), 'Token tok-1', 'the token travels in the header')
}

// 0.12.120: the log builders, the 80-line view and the disabled Download moved on; tests/system-update-log-download-0.12.120.mjs covers them.
// ---- the lists ----
assert.deepEqual(logs.LOG_SOURCES.map((s) => s.key), ['module', 'system-update', 'maintenance'])
assert.deepEqual(logs.LOG_SOURCES.map((s) => s.label), ['Module and hotfix jobs', 'System updates', 'Server maintenance'])
const rows = logs.systemUpdateRows({ history: [
  { id: 'j1', component: 'framework', installed_version: '1.17.16', version: '1.17.17', status: 'succeeded', requested_by: 'johan', finished_at: '2026-10-20T08:00:00Z' },
  { id: '', component: 'ui' },
  { id: 'j2', component: '<img src=x onerror=alert(1)>', status: 'failed' },
] })
assert.equal(rows.length, 2, 'a row with no id is dropped')
assert.equal(rows[0].action, 'Update 1.17.16 → 1.17.17')
assert.equal(rows[0].statusWord, 'Done')
assert.equal(rows[0].canOpen, true, 'Open stays on for a row with an id (0.12.120: Download needs has_log)')
assert.equal(logs.systemUpdateRows({}).length, 0)
assert.equal(logs.systemUpdateRows(null).length, 0)
const mrows = logs.maintenanceRows({ jobs: [{ id: 'm1', action: 'restart-services', status: 'failed', stage: 'restart', created_at: 'a', finished_at: 'b', context: { requested_by: 'johan' }, failure: { message: 'It stopped.' }, stdout: { text: 'must not be read from a list row' } }] })
assert.equal(mrows[0].modules, 'restart-services')
assert.equal(mrows[0].requestedBy, 'johan')
assert.equal(mrows[0].error, 'It stopped.')
assert.equal(mrows[0].statusTone, 'danger')
assert.ok(!('stdout' in mrows[0]) && !('logs' in mrows[0]), 'a row holds no log text')

// ---- sentences ----
const failure = (status, detail) => Object.assign(new Error('x'), { status, payload: detail ? { detail } : null })
assert.equal(logs.systemLogErrorSentence(failure(404), 'system-update'), 'Core no longer holds this log', 'a 404 with no sentence of its own')
assert.equal(logs.systemLogErrorSentence(failure(404, 'Server-maintenance job a was not found.'), 'maintenance'), 'Server-maintenance job a was not found.')
assert.equal(logs.systemLogErrorSentence(failure(403), 'maintenance'), 'You need module management rights to see this')

// ---- the real components ----
const loader = await createSfcLoader()
try {
  const render = (component, props) => renderToString(createSSRApp({ render: () => h(component, props) }))
  const history = (await loader.load('src/components/modules/ModuleJobHistory.vue')).default
  const html = await render(history, { canManage: true })
  assert.match(html, /<select aria-label="Log source">/)
  assert.match(html, /<option value="module" selected>Module and hotfix jobs<\/option><option value="system-update">System updates<\/option><option value="maintenance">Server maintenance<\/option>/)
  assert.match(html, /Module id…/, 'the module filters show for the module source')

  const win = (await loader.load('src/components/modules/ModuleJobLogWindow.vue')).default
  const base = { id: 'j2', modules: '<img src=x onerror=alert(1)>', action: 'Update 1 → 2', statusWord: 'Failed', stage: '—', requestedBy: 'johan', createdAt: '', startedAt: '', finishedAt: '', error: '', switchSource: {} }
  const su1 = await render(win, { job: { ...rows[1], ...base }, source: 'system-update' })
  assert.ok(!su1.includes('<img'), 'markup in a name is escaped')
  const mt = await render(win, { job: { ...mrows[0] }, source: 'maintenance' })
  assert.match(mt, /restart-services/, 'the maintenance details show')
  const mod = await render(win, { job: { ...base, id: 'k1', modules: 'agents', hasLog: true } })
  assert.match(mod, /<button class="btn sm" type="button">Download<\/button>/, 'Download still works for module jobs (enabled, no title)')
} finally {
  await loader.close()
}

// ---- source rules ----
const historySrc = read('../src/components/modules/ModuleJobHistory.vue')
const windowSrc = read('../src/components/modules/ModuleJobLogWindow.vue')
const updatesSrc = read('../src/views/SystemUpdatesView.vue')
const modulesSrc = read('../src/views/ModulesView.vue')
assert.match(historySrc, /listSystemUpdateJobs\(/, 'System updates reads the job list (0.12.120)')
assert.match(historySrc, /listMaintenanceJobs\(\{ limit: 100 \}\)/)
assert.match(windowSrc, /getSystemUpdateJob\(id\)/)
assert.match(windowSrc, /readMaintenanceLog\(id, \{ part: 'all' \}\)/)
assert.match(windowSrc, /logEl\.value\.textContent = text/, 'every log is put in the page as text')
for (const [name, text] of [['history', historySrc], ['window', windowSrc], ['logs', read('../src/system-job-logs.js')]]) {
  assert.ok(!/v-html|innerHTML|insertAdjacentHTML/.test(text), `${name}: no HTML from Core`)
  assert.ok(!/localStorage|sessionStorage/.test(text), `${name}: no browser storage`)
  assert.ok(!/[?&]token=|access_token/.test(text), `${name}: no token in a URL`)
}
assert.match(updatesSrc, /<th>Log<\/th>/)
assert.match(updatesSrc, /@click="openLog = systemUpdateRow\(item\)">Open log<\/button>/)
assert.match(updatesSrc, /<ModuleJobLogWindow v-if="openLog" :job="openLog" source="system-update" @close="openLog = null" \/>/)
assert.match(windowSrc, /if \(downloading\.value \|\| downloadOff\.value\) return/, 'no download call while it is off')
// a person without module management rights sees no History tab and the component loads nothing
assert.match(modulesSrc, /<button v-if="canManage" :class="\{active:activeTab==='history'\}"/)
assert.match(modulesSrc, /v-else-if="activeTab==='history' && canManage"/)
assert.match(historySrc, /if \(!props\.canManage \|\| current === 'module'\) return/)
console.log('job-log-access-0.12.119: ok')
