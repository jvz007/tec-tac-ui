// 0.12.120 (Core 1.17.67, Johan Q83): Download is on for the System Updates and server-maintenance job logs, and the UI uses Core's new
// list, log and detail-with-history routes. Routes and headers through a stub fetch, the real components rendered with Vite's SSR
// loader, the rows and sentences as pure rules, and the source rules (text only, no token in a URL, rights).
// The route text of docs/system-update-logs.md (Core 1.17.67) is the fixture note below: the signed contract export row for the three
// new routes arrives with the next export (the newest in docs/contracts is 1.17.65-0.12.118).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createSfcLoader } from './helpers/load-sfc.mjs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const calls = []
let reply = () => new Response('{"detail":"nothing"}', { status: 404, headers: { 'content-type': 'application/json' } })
globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'tok-1' : null), setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {}, location: { origin: 'https://rmm.example.test' } }
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options })
  return reply(String(url))
}
const logs = await import(new URL('../src/system-job-logs.js', import.meta.url).href)
const hist = await import(new URL('../src/module-job-history.js', import.meta.url).href)
const api = await import(new URL('../src/api.js', import.meta.url).href)
const B = 'https://rmm.example.test/api/tfd/system'

// ---- fixture note: the three routes as Core's docs/system-update-logs.md names them ----
const FIXTURE_NOTE = [
  'GET /api/tfd/system/updates/jobs/',
  'GET /api/tfd/system/updates/jobs/<id>/log/',
  'GET /api/tfd/system/maintenance/jobs/<id>/log/',
]
assert.equal(FIXTURE_NOTE.length, 3)

// ---- api.js: routes, encoding, header only ----
calls.length = 0
await api.getSystemUpdateJob('a/../b').catch(() => {})
assert.equal(calls[0].url, `${B}/updates/jobs/a%2F..%2Fb/`, 'the job id is encoded (the held Low)')
await api.getSystemUpdateJob('abc').catch(() => {})
assert.equal(calls[1].url, `${B}/updates/jobs/abc/`)

calls.length = 0
await api.listSystemUpdateJobs({ page: 2, page_size: 100, component: 'ui', status: 'failed' }).catch(() => {})
assert.equal(calls[0].url, `${B}/updates/jobs/?page=2&page_size=100&component=ui&status=failed`)
await api.listSystemUpdateJobs({ page: 1, page_size: 5000 }).catch(() => {})
assert.equal(calls[1].url, `${B}/updates/jobs/?page=1&page_size=100`, 'page_size is clamped to 100, empty filters are left out')
await api.listSystemUpdateJobs({ page_size: 0 }).catch(() => {})
assert.equal(calls[2].url, `${B}/updates/jobs/?page=1&page_size=1`)
await api.listSystemUpdateJobs().catch(() => {})
assert.equal(calls[3].url, `${B}/updates/jobs/?page=1&page_size=50`)

await api.readSystemUpdateLog('j1').catch(() => {})
await api.readSystemUpdateLog('j/1', { download: true }).catch(() => {})
await api.readMaintenanceLog('m1').catch(() => {})
await api.readMaintenanceLog('m1', { download: true }).catch(() => {})
for (const part of ['all', 'log', 'stdout', 'stderr']) await api.readMaintenanceLog('m1', { part }).catch(() => {})
await api.readMaintenanceLog('m/1', { part: 'bogus' }).catch(() => {})
const urls = calls.slice(4).map((c) => c.url)
assert.deepEqual(urls, [
  `${B}/updates/jobs/j1/log/`,
  `${B}/updates/jobs/j%2F1/log/?download=1`,
  `${B}/maintenance/jobs/m1/log/?part=all`,
  `${B}/maintenance/jobs/m1/log/?part=all&download=1`,
  `${B}/maintenance/jobs/m1/log/?part=all`,
  `${B}/maintenance/jobs/m1/log/?part=log`,
  `${B}/maintenance/jobs/m1/log/?part=stdout`,
  `${B}/maintenance/jobs/m1/log/?part=stderr`,
  `${B}/maintenance/jobs/m%2F1/log/?part=all`,
], 'the log routes, encoded ids, a bad part falls back to all')
for (const call of calls) {
  assert.ok(!/token|access_token/i.test(call.url), 'no token in a URL')
  assert.equal(call.options.headers.get('Authorization'), 'Token tok-1', 'the token travels in the header only')
}
for (const call of calls.slice(4)) assert.equal(call.options.headers.get('Accept'), 'text/plain', 'the logs are asked for as plain text')

// ---- a log answer: text, the cut flag and the file name from the headers ----
reply = () => new Response('line 1\n<b>bold</b>', { status: 200, headers: { 'content-type': 'text/plain', 'X-Tec-Tac-Log-Truncated': 'true', 'Content-Disposition': 'attachment; filename="system-update-framework-2026-10-20.log"' } })
const ok = await api.readSystemUpdateLog('j1', { download: true })
const state = await hist.logFromResponse(ok.clone())
assert.equal(state.text, 'line 1\n<b>bold</b>')
assert.equal(state.truncated, true)
assert.equal(hist.dispositionFileName(ok.headers), 'system-update-framework-2026-10-20.log', 'the name Core sends is used when it ends in .log')
assert.equal((await ok.blob()).size, 18)
assert.equal(hist.dispositionFileName(new Headers({ 'Content-Disposition': 'attachment; filename="evil.exe"' })), '', 'not a .log name: fallback')
assert.equal(hist.dispositionFileName(new Headers()), '', 'no header: fallback')

// ---- fallback file names ----
const now = new Date('2026-10-20T10:00:00Z')
assert.equal(logs.otherDownloadFileName('system-update', { modules: 'framework', moduleIds: ['framework'] }, now), 'system-update-framework-2026-10-20.log')
assert.equal(logs.otherDownloadFileName('system-update', {}, now), 'system-update-system-2026-10-20.log')
assert.equal(logs.otherDownloadFileName('maintenance', { actionKey: 'restart-services' }, now), 'server-maintenance-restart-services-2026-10-20.log')
assert.equal(logs.otherDownloadFileName('maintenance', { actionKey: '../../x y' }, now), 'server-maintenance-xy-2026-10-20.log', 'unsafe characters are dropped')

// ---- error mapping: 403 rights, 404 Core's own sentence, 503 not recorded ----
for (const [status, payload, expected] of [
  [403, { detail: 'no' }, 'You need module management rights to see this'],
  [404, { detail: 'This job has no log.', code: 'no_log' }, 'This job has no log.'],
  [404, { detail: 'Server-maintenance job a was not found.', code: 'job_not_found' }, 'Server-maintenance job a was not found.'],
  [503, { detail: 'audit' }, 'Core could not record this read, so the log was not shown.'],
]) {
  reply = () => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
  for (const read of [() => api.readSystemUpdateLog('j1'), () => api.readMaintenanceLog('m1')]) {
    const error = await read().then(() => null, (e) => e)
    assert.equal(error?.status, status)
    assert.equal(logs.systemLogErrorSentence(error, 'system-update'), expected)
    assert.equal(logs.systemLogErrorSentence(error, 'maintenance'), expected)
    assert.equal(hist.logErrorSentence(error), expected, 'a failed download says the same')
  }
}
const noDetail = Object.assign(new Error('x'), { status: 404, payload: null })
assert.equal(logs.systemLogErrorSentence(noDetail, 'system-update'), logs.GONE_LOG_TEXT, 'a 404 with no sentence still reads plainly')

// ---- rows ----
const rows = logs.systemUpdateRows({ jobs: [
  { id: 'j1', component: 'framework', installed_version: '1.17.66', version: '1.17.67', status: 'succeeded', has_log: true, log_bytes: 120 },
  { id: 'j2', component: 'ui', status: 'failed', has_log: false, log_bytes: null },
  { id: 'j3', component: 'ui', status: 'failed' },
  { id: '', has_log: true },
], total: 4 })
assert.equal(rows.length, 3, 'a row with no id is dropped')
assert.equal(rows[0].hasLog, true)
assert.equal(rows[0].logBytes, 120)
assert.equal(rows[1].hasLog, false)
assert.equal(rows[2].hasLog, false, 'has_log counts only when the key is true')
assert.ok(rows.every((r) => r.canOpen === true), 'Open stays on for any row with an id')
assert.equal(logs.systemUpdateRows({ history: [{ id: 'h1', has_log: true }] }).length, 1, 'the older status answer still reads')
assert.equal(logs.systemUpdateRows(null).length, 0)
const mrows = logs.maintenanceRows({ jobs: [{ id: 'm1', action: 'restart-services', status: 'failed', context: { requested_by: 'johan' } }] })
assert.equal(mrows[0].hasLog, true, 'the maintenance list has no has_log: Download is on')
assert.equal(mrows[0].canOpen, true)
for (const gone of ['DOWNLOAD_UNAVAILABLE_TEXT', 'LAST_LINES_TEXT', 'CUT_LOG_TEXT', 'systemUpdateLog', 'maintenanceLog']) assert.equal(gone in logs, false, `${gone} is gone`)

// ---- the real components ----
const loader = await createSfcLoader()
try {
  reply = () => new Response('{"detail":"nothing"}', { status: 404, headers: { 'content-type': 'application/json' } })
  const render = (component, props) => renderToString(createSSRApp({ render: () => h(component, props) }))
  const win = (await loader.load('src/components/modules/ModuleJobLogWindow.vue')).default
  const base = { modules: 'framework', action: 'Update 1 → 2', statusWord: 'Done', stage: '—', requestedBy: 'johan', createdAt: '', startedAt: '', finishedAt: '', error: '', switchSource: {} }
  const yes = await render(win, { job: { ...rows[0], ...base }, source: 'system-update' })
  assert.match(yes, /<button class="btn sm" type="button">Download<\/button>/, 'Download is on for a System Updates job with has_log true')
  assert.ok(!yes.includes('does not offer a download'))
  const no = await render(win, { job: { ...rows[1], ...base }, source: 'system-update' })
  assert.match(no, /<button class="btn sm" type="button" disabled title="Core kept no log text for this job\.">Download<\/button>/, 'Download is off for has_log false, with the plain reason')
  const mt = await render(win, { job: { ...mrows[0] }, source: 'maintenance' })
  assert.match(mt, /<button class="btn sm" type="button">Download<\/button>/, 'Download is on for a maintenance job')
  assert.ok(!mt.includes('does not offer a download'))
  assert.match(mt, /restart-services/)
  const mod = await render(win, { job: { ...base, id: 'k1', hasLog: true } })
  assert.match(mod, /<button class="btn sm" type="button">Download<\/button>/, 'module jobs are as before')
} finally {
  await loader.close()
}

// ---- source rules ----
const historySrc = read('../src/components/modules/ModuleJobHistory.vue')
const windowSrc = read('../src/components/modules/ModuleJobLogWindow.vue')
const updatesSrc = read('../src/views/SystemUpdatesView.vue')
const modulesSrc = read('../src/views/ModulesView.vue')
assert.match(historySrc, /listSystemUpdateJobs\(\{ page: 1, page_size: 100 \}\)/, 'System updates reads the new list')
assert.ok(!/getSystemUpdateStatus/.test(historySrc), 'and no longer the status history')
assert.match(historySrc, /listMaintenanceJobs\(\{ limit: 100 \}\)/)
assert.match(historySrc, /\$\{n\} of \$\{otherTotal\.value\} finished update jobs/, 'the footer says N of TOTAL when there are more')
assert.match(updatesSrc, /getSystemUpdateStatus/, 'the System Updates page keeps its own Update history table')
assert.match(windowSrc, /getSystemUpdateJob\(id\)/, 'the detail is read first for has_log')
assert.match(windowSrc, /readSystemUpdateLog\(id\)/)
assert.match(windowSrc, /readMaintenanceLog\(id, \{ part: 'all' \}\)/)
assert.match(windowSrc, /readSystemUpdateLog\(props\.job\.id, \{ download: true \}\)/)
assert.match(windowSrc, /readMaintenanceLog\(props\.job\.id, \{ part: 'all', download: true \}\)/)
assert.match(windowSrc, /urlKeeper\.keep\(url\)/, 'every download goes through the 30-second keeper')
assert.match(windowSrc, /if \(url\) URL\.revokeObjectURL\(url\)/)
assert.match(windowSrc, /dispositionFileName\(response\.headers\) \|\| /)
assert.ok(!/downloading\.value \|\| otherSource/.test(windowSrc), 'no guard that blocks the download for the two sources')
assert.match(windowSrc, /logEl\.value\.textContent = text/, 'every log is put in the page as text')
for (const [name, text] of [['history', historySrc], ['window', windowSrc], ['logs', read('../src/system-job-logs.js')]]) {
  assert.ok(!/v-html|innerHTML|insertAdjacentHTML/.test(text), `${name}: no HTML from Core`)
  assert.ok(!/localStorage|sessionStorage/.test(text), `${name}: no browser storage`)
  assert.ok(!/[?&]token=|access_token/.test(text), `${name}: no token in a URL`)
}
assert.ok(!/DOWNLOAD_UNAVAILABLE_TEXT|LAST_LINES_TEXT|Last 80 lines/.test(windowSrc + historySrc), 'the 80-line view and the disabled-download text are gone')
assert.match(updatesSrc, /:disabled="!item\.id" @click="openLog = systemUpdateRow\(item\)">Open log<\/button>/, 'Open log stays on for any row with an id')
// rights: the History tab is for people who can manage modules
assert.match(modulesSrc, /<button v-if="canManage" :class="\{active:activeTab==='history'\}"/)
assert.match(modulesSrc, /v-else-if="activeTab==='history' && canManage"/)
assert.match(historySrc, /if \(!props\.canManage \|\| current === 'module'\) return/)
console.log('system-update-log-download-0.12.120: ok')
