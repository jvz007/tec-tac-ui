// 0.12.107: the top loading bar. The state in src/loading-bar.js: shows only after about 300 ms in flight, stays for a short
// minimum, goes down when the count returns to zero (resolved, rejected or aborted), and two overlapping requests keep it
// shown until both finish. Through src/api.js: every request counts, quiet requests do not, `quiet` never reaches fetch(),
// and api results and error shapes (401, 403, 500, network failure) are unchanged. Timers are faked; no real wait.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mock } from 'node:test'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
mock.timers.enable({ apis: ['setTimeout', 'Date'] })

const { beginLoadingRequest, endLoadingRequest, loadingBarVisible, subscribeLoadingBar, LOADING_BAR_SHOW_AFTER_MS, LOADING_BAR_MIN_VISIBLE_MS } = await import(new URL('../src/loading-bar.js', import.meta.url).href)
assert.equal(LOADING_BAR_SHOW_AFTER_MS, 300)
assert.equal(LOADING_BAR_MIN_VISIBLE_MS, 400)

const events = []
const stop = subscribeLoadingBar((value) => events.push(value))

// (1) A quick request never shows the bar.
beginLoadingRequest()
mock.timers.tick(100)
endLoadingRequest()
mock.timers.tick(LOADING_BAR_SHOW_AFTER_MS * 3)
assert.equal(loadingBarVisible(), false)
assert.deepEqual(events, [], 'no show for a quick request')

// (2) Shows after the delay, not before, and hides only after the minimum on-time.
beginLoadingRequest()
mock.timers.tick(LOADING_BAR_SHOW_AFTER_MS - 1)
assert.equal(loadingBarVisible(), false, 'not yet at 299 ms')
mock.timers.tick(1)
assert.equal(loadingBarVisible(), true, 'shown at 300 ms')
endLoadingRequest()
assert.equal(loadingBarVisible(), true, 'still shown straight after the request ends (minimum on-time)')
mock.timers.tick(LOADING_BAR_MIN_VISIBLE_MS - 1)
assert.equal(loadingBarVisible(), true)
mock.timers.tick(1)
assert.equal(loadingBarVisible(), false, 'hidden once the minimum has passed')
assert.deepEqual(events, [true, false])
events.length = 0

// (3) A long request that ends after the minimum hides at once. The clock is stepped, because a fake timer's callback reads
// Date.now() at the end of the tick, not at its own due time; a real browser has no such gap.
beginLoadingRequest()
mock.timers.tick(LOADING_BAR_SHOW_AFTER_MS)
mock.timers.tick(LOADING_BAR_MIN_VISIBLE_MS * 2)
assert.equal(loadingBarVisible(), true)
endLoadingRequest()
assert.equal(loadingBarVisible(), false, 'hidden at once when the minimum has already passed')
assert.deepEqual(events, [true, false])
events.length = 0

// (4) Two overlapping requests: the bar stays until both have finished.
beginLoadingRequest()
beginLoadingRequest()
mock.timers.tick(LOADING_BAR_SHOW_AFTER_MS)
assert.equal(loadingBarVisible(), true)
endLoadingRequest()
mock.timers.tick(LOADING_BAR_MIN_VISIBLE_MS * 4)
assert.equal(loadingBarVisible(), true, 'still shown while one request is in flight')
endLoadingRequest()
assert.equal(loadingBarVisible(), false)
events.length = 0

// (5) A rejected request still counts down: the caller ends it in a finally block, so the bar never sticks.
beginLoadingRequest()
mock.timers.tick(LOADING_BAR_SHOW_AFTER_MS)
try { throw new Error('network') } catch { endLoadingRequest() }
mock.timers.tick(LOADING_BAR_MIN_VISIBLE_MS)
assert.equal(loadingBarVisible(), false, 'a rejection hides the bar')
events.length = 0

// (6) A request that starts while the bar is still on its minimum keeps it on, with no toggle in between.
beginLoadingRequest()
mock.timers.tick(LOADING_BAR_SHOW_AFTER_MS)
endLoadingRequest()
mock.timers.tick(100)
beginLoadingRequest()
mock.timers.tick(LOADING_BAR_MIN_VISIBLE_MS * 2)
assert.equal(loadingBarVisible(), true)
assert.deepEqual(events, [true], 'shown once and not toggled off in between')
endLoadingRequest()
assert.equal(loadingBarVisible(), false)
events.length = 0

// (7) Stray ends never drive the count below zero, so the next request still shows the bar.
endLoadingRequest()
endLoadingRequest()
beginLoadingRequest()
mock.timers.tick(LOADING_BAR_SHOW_AFTER_MS)
assert.equal(loadingBarVisible(), true, 'a request after stray ends still shows the bar')
endLoadingRequest()
mock.timers.tick(LOADING_BAR_MIN_VISIBLE_MS)
assert.equal(loadingBarVisible(), false)
stop()

// Through the real transport. Each fetch() the test makes is queued, and the test settles it when it chooses.
const storage = new Map([['access_token', 'abc123']])
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null },
  setItem(key, value) { storage.set(key, String(value)) },
  removeItem(key) { storage.delete(key) },
}
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const { apiFetch, apiRaw, apiBlob, apiText, publicApiFetch } = await import(new URL('../src/api.js', import.meta.url).href)
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const seen = []
const waiting = []
globalThis.fetch = (url, init) => {
  seen.push({ url, init })
  return new Promise((resolve, reject) => { waiting.push({ resolve, reject }) })
}

// A signed-in call shows the bar once it is slow, returns its result unchanged, and the bar clears after the minimum.
{
  const pending = apiFetch('/x/')
  mock.timers.tick(LOADING_BAR_SHOW_AFTER_MS)
  assert.equal(loadingBarVisible(), true, 'an api() call shows the bar once it is slow')
  waiting[0].resolve(json({ ok: true }))
  assert.deepEqual(await pending, { ok: true }, 'the result is unchanged')
  mock.timers.tick(LOADING_BAR_MIN_VISIBLE_MS)
  assert.equal(loadingBarVisible(), false, 'the bar clears after the answer')
}

// A quiet call never shows the bar, and `quiet` is not sent to fetch().
{
  const pending = apiFetch('/api/tfd/session/activity/', { method: 'POST', quiet: true })
  mock.timers.tick(LOADING_BAR_SHOW_AFTER_MS * 4)
  assert.equal(loadingBarVisible(), false, 'a quiet request never shows the bar')
  waiting[1].resolve(json({ ok: true }))
  await pending
  assert.equal('quiet' in seen[1].init, false, 'quiet is stripped before fetch()')
  assert.equal(seen[1].init.method, 'POST')
}

// A quiet answer does not hide a bar that a normal request is holding up.
{
  const normal = apiFetch('/x/')
  mock.timers.tick(LOADING_BAR_SHOW_AFTER_MS)
  assert.equal(loadingBarVisible(), true)
  const quiet = apiFetch('/api/tfd/ui/notices/?state=unread&limit=100', { quiet: true })
  waiting[3].resolve(json({ notices: [] }))
  await quiet
  assert.equal(loadingBarVisible(), true, 'a quiet answer does not hide the bar')
  waiting[2].resolve(json({ ok: true }))
  await normal
  mock.timers.tick(LOADING_BAR_MIN_VISIBLE_MS)
  assert.equal(loadingBarVisible(), false)
}

// The result and error shapes are unchanged for 401, 403, 500 and a network failure, and the count is released each time.
async function failsWith(run, settle, check) {
  // A 401 clears the stored token (api.js invalidates the session), so each case starts with a token again.
  storage.set('access_token', 'abc123')
  const pending = run()
  mock.timers.tick(LOADING_BAR_SHOW_AFTER_MS)
  settle(waiting.at(-1))
  await assert.rejects(pending, check)
  mock.timers.tick(LOADING_BAR_MIN_VISIBLE_MS)
  assert.equal(loadingBarVisible(), false, 'released after the failure')
}
for (const [status, body, expectedCode] of [
  [401, { detail: 'Session expired.', code: 'session_idle_timeout' }, 'session_idle_timeout'],
  [403, { detail: 'Not allowed.' }, null],
  [500, { detail: 'boom', code: 'server_broke' }, 'server_broke'],
]) {
  await failsWith(() => apiFetch('/x/'), (call) => call.resolve(json(body, status)), (error) => {
    assert.equal(error.status, status)
    assert.deepEqual(error.payload, body)
    assert.equal(error.code, expectedCode)
    assert.equal(error.message, body.detail)
    return true
  })
}
await failsWith(() => apiFetch('/x/'), (call) => call.reject(new TypeError('Failed to fetch')), (error) => {
  assert.equal(error.name, 'TypeError')
  assert.equal(error.message, 'Failed to fetch')
  assert.equal(error.status, 0)
  assert.equal(error.payload, null)
  assert.equal(error.code, null)
  return true
})

// Every transport counts: apiRaw, apiBlob, apiText and publicApiFetch.
for (const run of [() => apiRaw('/x/'), () => apiBlob('/x/'), () => apiText('/x/'), () => publicApiFetch('/x/')]) {
  const pending = run()
  mock.timers.tick(LOADING_BAR_SHOW_AFTER_MS)
  assert.equal(loadingBarVisible(), true, 'the transport shows the bar while slow')
  waiting.at(-1).resolve(new Response('ok', { status: 200 }))
  await pending
  mock.timers.tick(LOADING_BAR_MIN_VISIBLE_MS)
  assert.equal(loadingBarVisible(), false)
}
mock.timers.reset()

// Source checks: the bar is mounted once, its colour and reduced-motion rules exist, Core's polls are quiet, and no storage.
const app = read('../src/App.vue')
assert.match(app, /import LoadingBar from '\.\/components\/LoadingBar\.vue'/)
assert.equal((app.match(/<LoadingBar \/>/g) || []).length, 1, 'the bar is mounted once, in the App.vue root')
const component = read('../src/components/LoadingBar.vue')
assert.match(component, /role="progressbar"/)
assert.match(component, /aria-label="Loading"/)
assert.match(component, /aria-busy="true"/)
assert.match(component, /class="sr-only"/, 'the screen-reader text uses the existing visually-quiet class')
assert.match(component, /subscribeLoadingBar\(/)
const styles = read('../src/styles.css')
assert.match(styles, /\.app-loading-bar-host\{position:fixed;top:0;left:0;right:0;height:4px;z-index:1500;pointer-events:none/, 'a fixed strip above the top bar and the 1400 dialogs that takes no pointer')
assert.match(styles, /\.app-loading-bar\{[^}]*background:var\(--tactical-loading-bar-color,var\(--accent\)\)/)
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\{\.app-loading-bar\{left:0;width:100%;animation:none\}\}/, 'reduced motion gives a static bar')
const apiSource = read('../src/api.js')
assert.match(apiSource, /const \{ quiet = false, \.\.\.options \} = rawOptions/, 'quiet is stripped in authenticatedRawRequest')
assert.match(apiSource, /async function fetchOrFail\(url, init, \{ quiet = false \} = \{\}\) \{\s*if \(!quiet\) beginLoadingRequest\(\)\s*try \{\s*return await fetch\(url, init\)\s*\} catch \(error\) \{\s*throw decorateFailure\(error, 0, null\)\s*\} finally \{\s*if \(!quiet\) endLoadingRequest\(\)/)
assert.match(read('../src/session-security.js'), /apiFetch\('\/api\/tfd\/session\/activity\/', \{ method: 'POST', quiet: true \}\)/)
assert.match(read('../src/session-security.js'), /apiFetch\('\/api\/tfd\/session\/current\/', \{ quiet: true \}\)/)
assert.match(read('../src/notifications.js'), /api\('\/api\/tfd\/ui\/notices\/\?state=unread&limit=100', \{ quiet: true \}\)/)
for (const file of ['../src/loading-bar.js', '../src/components/LoadingBar.vue']) {
  assert.doesNotMatch(read(file), /localStorage|sessionStorage/, `${file} uses no browser storage`)
  assert.doesNotMatch(read(file), /Authorization|headers\s*:/, `${file} builds no auth header`)
}

console.log('loading-bar-0.12.107: PASS')
