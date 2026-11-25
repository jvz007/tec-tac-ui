// 0.13.4 (Core 1.18.45): the result check page. Covers the route (and no navigation entry), the one api.js call, the pure helpers, the
// controller with a stubbed api (closed and open answers, paging, Refresh, 404, a late answer dropped), the view source (no output text,
// no storage, no hand-built header, kit classes and tokens only) and the line endings of the touched files.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const H = await import(new URL('../src/result-check.js', import.meta.url).href)

// ---- (1) the route, and no navigation entry ----
const router = read('../src/router.js')
const route = router.indexOf("path: '/results/:checkId'")
assert.ok(route > 0, 'the route is registered')
const routeLine = router.slice(route, router.indexOf('\n', route))
assert.match(routeLine, /name: 'result-check', component: ResultCheckView, meta: \{ title: 'Results' \}/)
assert.ok(route < router.indexOf("path: '/:pathMatch(.*)*'"), 'registered before the catch-all')
assert.ok(!/public/.test(routeLine), 'not a public route')
assert.match(router, /import ResultCheckView from '\.\/views\/ResultCheckView\.vue'/)
assert.equal(read('../src/core-navigation.js').includes('/results'), false, 'no navigation entry for /results')

// ---- (2) the one api.js call ----
const apiSource = read('../src/api.js')
assert.match(apiSource, /export async function getResultCheck\(checkId, \{ page = 1, pageSize = 50 \} = \{\}\)/)
assert.ok(apiSource.includes('apiFetch(`/api/tfd/ui/result-checks/${encodeURIComponent(checkId)}/?page=${Number(page)}&page_size=${Number(pageSize)}`)'), 'the exact route, id encoded, through apiFetch')
const fnStart = apiSource.indexOf('export async function getResultCheck')
const fnBody = apiSource.slice(fnStart, apiSource.indexOf('\n}\n', fnStart))
assert.equal(/\bfetch\(|Authorization|localStorage|sessionStorage/.test(fnBody), false, 'the call is apiFetch only')
for (const file of ['../src/views/ResultCheckView.vue', '../src/result-check.js']) {
  assert.equal(/localStorage|sessionStorage|Authorization|\bfetch\(/.test(read(file)), false, `${file}: no storage, header or raw fetch`)
}
assert.match(read('../src/views/ResultCheckView.vue'), /getResultCheck/, 'the view reads through getResultCheck')

// ---- (3) pure helpers ----
for (const [state, label, tone] of [['done', 'Done', 'ok'], ['failed', 'Failed', 'danger'], ['offline', 'Offline', 'warn'], ['running', 'Still running', 'warn'], ['no_result', 'No result', 'warn']]) {
  assert.equal(H.stateLabel(state), label)
  assert.equal(H.stateTone(state), tone)
}
assert.equal(H.stateLabel('odd_new_state'), 'odd_new_state')
assert.equal(H.stateTone('odd_new_state'), '')
assert.equal(H.stateLabel(undefined), '')
assert.equal(H.exitCodeText(null), '—')
assert.equal(H.exitCodeText(undefined), '—')
assert.equal(H.exitCodeText(0), '0')
assert.equal(H.exitCodeText(3), '3')
const rows = H.rowsFromItems([{ endpoint_id: 7, hostname: 'PC-7', state: 'done', exit_code: 0 }, { endpoint_id: 8, hostname: '', state: 'offline', exit_code: null }])
assert.equal(rows[0].endpoint, 'PC-7')
assert.equal(rows[0].exitCode, '0')
assert.equal(rows[1].endpoint, '8', 'an empty hostname falls back to the endpoint id')
assert.equal(rows[1].exitCode, '—')
assert.deepEqual(H.rowsFromItems(null), [])
assert.deepEqual(H.countPills({ done: 3, failed: 1, offline: 1, running: 0, no_result: 2 }).map((p) => [p.id, p.value]), [['done', 3], ['failed', 1], ['offline', 1], ['running', 0], ['no_result', 2]])
assert.equal(H.rangeText({ page: 1, pageSize: 50, shown: 50, total: 120 }), '1 to 50 of 120')
assert.equal(H.rangeText({ page: 2, pageSize: 50, shown: 50, total: 120 }), '51 to 100 of 120')
assert.equal(H.rangeText({ page: 3, pageSize: 50, shown: 20, total: 120 }), '101 to 120 of 120')
assert.equal(H.rangeText({ page: 1, pageSize: 50, shown: 0, total: 0 }), '0 endpoints')
assert.equal(H.errorSentence({ status: 404, message: 'Not found.' }), "We can't find these results. They may belong to someone else, or they may be older than 30 days.")
assert.equal(H.errorSentence({ status: 400, message: 'page must be a whole number.' }), 'page must be a whole number.')
assert.equal(H.errorSentence({ status: 400, message: '' }), 'Core could not read these results. Try again.')
assert.equal(H.errorSentence(new TypeError('Failed to fetch')), H.NETWORK_SENTENCE)

// ---- (4) the controller with a stubbed api ----
const answer = (over = {}) => ({
  id: 'c1', label: 'Run script', status: 'closed', page: 1, page_size: 50, count: 120, next_page: 2,
  summary: { total: 120, done: 100, failed: 10, offline: 8, running: 0, no_result: 2 },
  message: 'Run script: 100 done, 10 failed, 8 offline, 2 no result',
  items: [{ endpoint_id: 1, hostname: 'A', state: 'done', exit_code: 0 }],
  ...over,
})
function stub(handler) {
  const calls = []
  const fetchPage = (id, opts) => { calls.push({ id, ...opts }); return handler(id, opts, calls.length) }
  return { calls, fetchPage }
}
{
  const s = stub(async (id, { page }) => answer({ page, next_page: page === 1 ? 2 : null }))
  const c = H.createResultCheckController({ fetchPage: s.fetchPage })
  await c.load('c1', 1)
  assert.deepEqual(s.calls[0], { id: 'c1', page: 1, pageSize: 50 }, 'asks for page 1 at 50 per page')
  assert.equal(c.state.answer.message, 'Run script: 100 done, 10 failed, 8 offline, 2 no result', "Core's message is kept verbatim")
  assert.equal(H.countPills(c.state.answer.summary).length, 5)
  await c.next()
  assert.equal(s.calls[1].page, 2, 'Next asks for the next_page')
  assert.equal(c.state.answer.next_page, null)
  await c.next()
  assert.equal(s.calls.length, 2, 'Next does nothing when next_page is null')
  await c.refresh()
  assert.equal(s.calls[2].page, 2, 'Refresh re-reads the same page')
  await c.previous()
  assert.equal(s.calls[3].page, 1)
  await c.previous()
  assert.equal(s.calls.length, 4, 'Previous does nothing on page 1')
}
{
  const s = stub(async () => answer({ status: 'open', message: 'Still checking: Run script, 3 done, 37 running' }))
  const c = H.createResultCheckController({ fetchPage: s.fetchPage })
  await c.load('c1', 1)
  assert.match(c.state.answer.message, /^Still checking/)
  assert.equal(c.state.answer.status, 'open')
}
{
  const s = stub(async () => { throw Object.assign(new Error('Not found.'), { status: 404 }) })
  const c = H.createResultCheckController({ fetchPage: s.fetchPage })
  await c.load('nope', 1)
  assert.equal(c.state.notFound, true)
  assert.equal(c.state.answer, null, 'no table on a 404')
  assert.equal(c.state.error, H.NOT_FOUND_SENTENCE)
  assert.equal(c.state.loading, false)
}
{
  const s = stub(async () => { throw Object.assign(new Error('page_size must be at most 100.'), { status: 400 }) })
  const c = H.createResultCheckController({ fetchPage: s.fetchPage })
  await c.load('c1', 1)
  assert.equal(c.state.notFound, false)
  assert.equal(c.state.error, 'page_size must be at most 100.')
}
{
  // a late reply from a previous id (and from a previous page) is ignored
  const waits = {}
  const s = stub((id, { page }) => new Promise((resolve) => { waits[`${id}:${page}`] = resolve }))
  const c = H.createResultCheckController({ fetchPage: s.fetchPage })
  const first = c.load('old', 1)
  const second = c.load('new', 1)
  waits['new:1'](answer({ id: 'new', label: 'New' }))
  await second
  waits['old:1'](answer({ id: 'old', label: 'Old' }))
  await first
  assert.equal(c.state.answer.label, 'New', 'the late reply from the earlier id is dropped')
  assert.equal(c.state.loading, false)
  const third = c.load('new', 2)
  const fourth = c.load('new', 3)
  waits['new:3'](answer({ page: 3, label: 'Page 3' }))
  await fourth
  waits['new:2'](answer({ page: 2, label: 'Page 2' }))
  await third
  assert.equal(c.state.answer.label, 'Page 3', 'the late reply from an earlier page is dropped')
}

// ---- (5) the view source ----
const view = read('../src/views/ResultCheckView.vue')
assert.equal(/output|stdout|stderr/i.test(view), false, 'no output text field')
assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(view), false, 'no hex colours')
assert.equal(/v-html/.test(view), false)
const css = view.slice(view.indexOf('<style scoped>'))
assert.ok(css.startsWith('<style scoped>'))
assert.equal(/rgb|hsl|#[0-9a-f]/i.test(css), false, 'no colours in the view style')
const styles = read('../src/styles.css')
assert.equal(/tt-ws/.test(view), false, 'a routed page does not use tt-ws (theme-tokens-0.12.114: it is the module dialog scope)')
for (const cls of ['tt-panel', 'tt-tablewrap', 'tt-table', 'tt-table-foot', 'tt-table-empty', 'tt-error', 'phead', 'eyebrow', 'callout', 'pill', 'btn']) {
  assert.ok(new RegExp(`\\.${cls}\\b`).test(styles), `the kit has .${cls}`)
  assert.ok(view.includes(cls), `the view uses ${cls}`)
}
for (const word of ['Endpoint', 'State', 'Exit code', 'Refresh', 'Retry', 'Previous', 'Next']) assert.ok(view.includes(word), `the view has ${word}`)

// ---- (6) line endings: every touched file keeps LF ----
for (const file of ['../src/api.js', '../src/router.js', '../src/result-check.js', '../src/views/ResultCheckView.vue', '../VERSION', '../package.json', '../tec_tac_package.json', '../docs/releases/RELEASE_NOTES_0.13.4.md', '../docs/releases/RELEASE_NOTES_0.13.3.md', './result-check-0.13.4.mjs', './release-0.13.7.mjs', './run-all.mjs', './api-contract-routes-0.12.58-1.mjs']) {
  assert.equal(read(file).includes('\r'), false, `${file} keeps LF`)
}
console.log('result-check-0.13.4: PASS')
