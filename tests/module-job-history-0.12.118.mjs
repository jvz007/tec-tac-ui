// 0.12.118: the Module Manager History tab and the full log window (Core 1.17.60, docs/module-job-logs.md). The pure rules in node,
// the request shape through the real src/modules.js with a stub fetch, and the wiring read from the component sources (the SFCs are
// not mounted here). The browser checks (headers readable across origins, the real download) are on the dev-server checklist.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { moduleManagerSource } from './helpers/module-manager-source.mjs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'tok-secret-1' : null), setItem() {}, removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const calls = []
globalThis.fetch = async (url, options) => {
  calls.push({ url, options })
  return new Response(JSON.stringify({ jobs: [], page: 1, pages: 0, total: 0 }), { status: 200, headers: { 'content-type': 'application/json' } })
}
const modulesSource = read('../src/modules.js').replace(/from '[.][/]api'/, `from '${new URL('../src/api.js', import.meta.url).href}'`)
const modules = await import(`data:text/javascript;base64,${Buffer.from(modulesSource).toString('base64')}`)
const h = await import(new URL('../src/module-job-history.js', import.meta.url).href)
const { createLatestRequestGate } = await import(new URL('../src/admin-session-state.js', import.meta.url).href)

// ---- the request: filters and clamped paging ----
const query = async (args) => { calls.length = 0; await modules.listModuleJobHistory(args); return new URL(calls[0].url) }
let url = await query({})
assert.equal(url.pathname, '/api/tfd/modules/v2/jobs/history/')
assert.equal(url.searchParams.get('page'), '1')
assert.equal(url.searchParams.get('page_size'), '50', '50 by default')
for (const key of ['module', 'action', 'status', 'kind']) assert.equal(url.searchParams.has(key), false, `${key} is not sent when empty`)
url = await query({ page: 3, pageSize: 500, module: ' agents ', action: 'install', status: 'failed', kind: 'hotfix' })
assert.equal(url.searchParams.get('page'), '3')
assert.equal(url.searchParams.get('page_size'), '100', 'page_size is cut to 100')
assert.equal(url.searchParams.get('module'), 'agents')
assert.equal(url.searchParams.get('action'), 'install')
assert.equal(url.searchParams.get('status'), 'failed')
assert.equal(url.searchParams.get('kind'), 'hotfix')
url = await query({ page: 0, pageSize: -5, kind: 'other' })
assert.equal(url.searchParams.get('page'), '1', 'page is at least 1')
assert.equal(url.searchParams.get('page_size'), '1', 'page_size is at least 1')
assert.equal(url.searchParams.has('kind'), false, 'only module or hotfix is sent as kind')
url = await query({ page: 'abc', pageSize: 'x' })
assert.equal(url.searchParams.get('page'), '1')
assert.equal(url.searchParams.get('page_size'), '50')
assert.equal(typeof modules.listModuleJobs, 'function', 'listModuleJobs stays exported')
calls.length = 0
await modules.listModuleJobs({ page: 2, pageSize: 10, status: 'failed' })
assert.equal(calls[0].url, 'https://rmm.example.test/api/tfd/modules/v2/jobs/?page=2&page_size=10&status=failed', 'listModuleJobs is unchanged')
assert.equal(calls[0].options.headers.get('Authorization'), 'Token tok-secret-1', 'the token travels in the header only')
assert.ok(!calls[0].url.includes('tok-secret'))

// ---- the row model ----
const fixture = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001', kind: 'module', action: 'install', switch: false, renamed_from: null,
  module_ids: ['agents', 'checks'], versions: { agents: '0.9.0', checks: '0.3.1' }, requested_by: 'johan', created_at: '2026-10-20T08:00:00Z',
  started_at: '2026-10-20T08:00:02Z', finished_at: '2026-10-20T08:01:00Z', status: 'failed', stage: 'lifecycle', error: 'Install step failed.',
  has_log: true, log_bytes: 2048, disabled_modules: [], enabled_modules: [], reconciled_modules: [], hand_back_skipped: [],
  // Fields Core never sends. If one ever arrived, it must not reach the page.
  log_tail: ['SECRET LOG LINE'], path: '/var/lib/tec-tac/x.log', package_path: '/tmp/p.zip', package_sha256: 'deadbeef', token: 'tok-secret-1',
}
const row = h.historyRow(fixture)
const serialised = JSON.stringify(row)
for (const bad of ['SECRET LOG LINE', '/var/lib', '/tmp/p.zip', 'deadbeef', 'tok-secret']) assert.ok(!serialised.includes(bad), `the row model carries no ${bad}`)
assert.equal(row.modules, 'agents 0.9.0, checks 0.3.1')
assert.equal(row.action, 'Install')
assert.equal(row.requestedBy, 'johan')
assert.equal(row.statusWord, 'Failed')
assert.equal(row.statusTone, 'danger')
assert.equal(row.stage, 'lifecycle')
assert.equal(row.error, 'Install step failed.')
assert.equal(row.hasLog, true)
assert.equal(h.modulesLabel({ module_ids: ['x'], versions: null }), 'x', 'a job with no versions lists the ids')
assert.equal(h.modulesLabel({}), '—')
assert.equal(h.actionLabel({ action: 'install', renamed_from: 'old-id', module_ids: ['new-id'] }), 'Rename old-id to new-id', 'a rename is shown from renamed_from')
assert.equal(h.actionLabel({ action: 'enable', switch: true }), 'Enable (replacement switch)', 'a switch row says so')
assert.equal(h.actionLabel({ action: 'apply' }), 'Apply')
assert.deepEqual(h.historyRows({ jobs: [fixture, { nope: true }, null] }).map((r) => r.id), [fixture.id], 'rows without an id are dropped')
assert.deepEqual(h.historyMeta({ page: 2, pages: 5, total: 230 }), { page: 2, pages: 5, total: 230 })

// ---- status words ----
const words = { queued: 'Waiting to start', dispatched: 'Starting', running: 'Running', succeeded: 'Done', failed: 'Failed', dispatch_failed: 'Could not start' }
for (const [status, word] of Object.entries(words)) assert.equal(h.statusWord(status), word, status)
assert.equal(h.statusWord('paused'), 'paused', 'an unknown word is shown as Core sent it')
assert.equal(h.statusWord(undefined), '—')
assert.equal(h.statusTone('succeeded'), 'ok')
assert.equal(h.statusTone('running'), 'warn')

// ---- no log: no Open, no Download ----
const noLog = h.historyRow({ ...fixture, has_log: false, log_bytes: 0 })
assert.equal(noLog.hasLog, false)
assert.equal(noLog.warning, '')
assert.equal(h.NO_LOG_TEXT, 'No log was kept')
const history = read('../src/components/modules/ModuleJobHistory.vue')
assert.match(history, /if \(!openable\(row\)\) return h\('span', \{ class: 'muted smalltext' \}, NO_LOG_TEXT\)/, 'a row without a log shows the plain words and no button')
assert.match(history, /function openable\(row\) \{ return row\?\.canOpen \?\? row\?\.hasLog \}\nfunction open\(row\) \{ if \(openable\(row\)\) openJob\.value = row \}/, 'Enter and double-click open only a row with a log')
assert.ok(!/Download/.test(history), 'Download lives in the log window only')

// ---- the size warning (above 5 MiB) ----
assert.equal(h.sizeWarning({ has_log: true, log_bytes: 5 * 1024 * 1024 }), '', 'exactly 5 MiB is not above')
assert.equal(h.sizeWarning({ has_log: true, log_bytes: 5 * 1024 * 1024 + 1 }), 'This log is about 5 MB. Core shows the start and the end.')
assert.equal(h.sizeWarning({ has_log: true, log_bytes: 7.4 * 1024 * 1024 }), 'This log is about 7.4 MB. Core shows the start and the end.')
assert.equal(h.sizeWarning({ has_log: false, log_bytes: 9 * 1024 * 1024 }), '', 'no log, no warning')
assert.match(history, /row\.warning \? h\('span', \{ class: 'muted smalltext' \}, row\.warning\)/, 'the warning is a plain line beside Open')
assert.ok(!/askConfirm|useConfirm/.test(history), 'no confirm before opening a large log')

// ---- truncation: the header, then Core's marker line ----
const headers = (map) => ({ get: (name) => (name in map ? map[name] : null) })
assert.deepEqual(h.truncationState(headers({ 'X-Tec-Tac-Log-Truncated': 'true' }), 'plain'), { truncated: true, source: 'header' })
assert.deepEqual(h.truncationState(headers({ 'X-Tec-Tac-Log-Truncated': 'false' }), '[... 12 bytes were left out of the middle of this log ...]'), { truncated: false, source: 'header' }, 'the header wins when it is readable')
const marker = 'start\n[... 2500000 bytes were left out of the middle of this log ...]\nend'
assert.deepEqual(h.truncationState(headers({}), marker), { truncated: true, source: 'marker' }, 'an unreadable header falls back to the marker line')
assert.deepEqual(h.truncationState(headers({}), 'a normal log\nwith lines'), { truncated: false, source: 'marker' })
assert.equal(h.hasTruncationMarker('prefix [... 5 bytes were left out of the middle of this log ...]'), false, 'the marker must be a line of its own')
assert.equal(h.TRUNCATED_LINE, 'This log is long. The start and the end are shown; the middle was left out.')
const windowSource = read('../src/components/modules/ModuleJobLogWindow.vue')
assert.match(windowSource, /\{\{ TRUNCATED_LINE \}\}/, 'the line above the log')
assert.match(windowSource, /markerFallback/, 'the window says when it used the marker')

// ---- the log is text: textContent, never HTML ----
assert.match(windowSource, /logEl\.value\.textContent = text/)
assert.ok(!/v-html|innerHTML|insertAdjacentHTML/.test(windowSource), 'no HTML sink in the log window')
assert.ok(!/v-html|innerHTML/.test(history), 'no HTML sink in the history list')
const element = { textContent: '' }
const evil = '<img src=x onerror=alert(1)>\n<script>boom()</script>'
element.textContent = evil
assert.equal(element.textContent, evil, 'the line stays text')
assert.match(windowSource, /<pre v-show="!loading" ref="logEl" class="mm-log"/, 'the pre is empty in the template: the text is not interpolated')

// ---- reading the log and the download go through apiRaw, the token never in a URL ----
const seen = []
const apiRaw = async (path, options) => { seen.push({ path, options }); return { headers: headers({}), text: async () => 'x', blob: async () => new Blob(['x']) } }
await h.readJobLog('a b/c', { apiRaw })
await h.readJobLog('0123', { apiRaw, download: true })
assert.equal(seen[0].path, '/api/tfd/modules/v2/jobs/a%20b%2Fc/log/', 'the id is encoded; no query for a window read')
assert.equal(seen[1].path, '/api/tfd/modules/v2/jobs/0123/log/?download=1')
for (const item of seen) assert.ok(!/token|authorization|tok-secret/i.test(item.path), 'no token in the URL')
assert.match(windowSource, /import \{ apiRaw \} from '\.\.\/\.\.\/api'/, 'the window uses the api transport')
assert.match(windowSource, /download: true/)
assert.match(windowSource, /URL\.createObjectURL\(blob\)/)
assert.match(windowSource, /URL\.revokeObjectURL\(url\)/, 'the object URL is revoked')
assert.ok(!/href=["'`]?\s*\$\{|:href=/.test(windowSource), 'no link is built with a route and a token')
assert.equal(h.dispositionFileName(headers({ 'Content-Disposition': 'attachment; filename="module-job-agents-install-2026-10-20.log"' })), 'module-job-agents-install-2026-10-20.log')
assert.equal(h.dispositionFileName(headers({})), '', 'an unreadable header gives no name')
assert.equal(h.dispositionFileName(headers({ 'Content-Disposition': 'attachment; filename="../../etc/passwd"' })), '', 'a name that is not a .log file is not used')
assert.equal(h.downloadFileName({ moduleIds: ['Agent_Management!'], actionKey: 'Install' }, new Date('2026-10-20T10:00:00Z')), 'module-job-agentmanagement-install-2026-10-20.log', 'a-z, 0-9 and - only')
assert.equal(h.downloadFileName({}, new Date('2026-10-20T10:00:00Z')), 'module-job-module-job-2026-10-20.log')

// ---- 403, 404 and 503 ----
assert.equal(h.logErrorSentence({ status: 403 }), 'You need module management rights to see this')
assert.equal(h.logErrorSentence({ status: 404, payload: { detail: 'No log was kept for this job.' } }), 'No log was kept for this job.', "Core's own sentence")
assert.equal(h.logErrorSentence({ status: 404 }), 'No log was kept for this job.')
assert.equal(h.logErrorSentence({ status: 503 }), 'Core could not record this read, so the log was not shown.')
assert.equal(h.logErrorSentence({ status: 500, message: 'Boom' }), 'Boom')
assert.equal(h.historyErrorSentence({ status: 403 }), 'You need module management rights to see this')

// ---- a stale answer is dropped (the latest-request gate) ----
const gate = createLatestRequestGate()
const first = gate.begin()
const second = gate.begin()
assert.equal(gate.isCurrent(first), false, 'the first request is stale once a second starts')
assert.equal(gate.isCurrent(second), true)
assert.match(windowSource, /createLatestRequestGate/)
assert.match(windowSource, /if \(!gate\.isCurrent\(request\) \|\| props\.job\.id !== id\) return/, 'a job switched while loading drops the answer')
assert.match(history, /if \(!gate\.isCurrent\(request\)\) return/, 'a slower list answer is dropped')

// ---- the tab is hidden without module management rights ----
const view = moduleManagerSource()
assert.match(view, /<button v-if="canManage" :class="\{active:activeTab==='history'\}"/, 'the History tab button needs canManage')
assert.match(view, /<template v-else-if="activeTab==='history' && canManage">/, 'and so does its content')
assert.match(history, /if \(!props\.canManage\) return/, 'the component loads nothing without it')
assert.match(view, /<ModuleJobHistory ref="historyRef" :can-manage="canManage" \/>/)

// ---- the log opens in the shared kit's floating, read-only window ----
assert.match(windowSource, /<EditorWindow[^>]*\bfloating read-only\b/)
assert.match(windowSource, /import \{ EditorWindow, FormRow \} from '\.\.\/\.\.\/shared-kit\.js'/)

// ---- no path, token or package hash is rendered ----
for (const source of [history, windowSource, read('../src/module-job-history.js')]) {
  assert.ok(!/package_path|package_sha256|\.path\b|row\.token|job\.token/.test(source), 'no path, token or hash field is read')
}
console.log('module-job-history-0.12.118: ok')
