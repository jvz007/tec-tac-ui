// 0.12.124 (Core 1.17.98, docs/core-github-rate-limit-optimization.txt sections 8, 10, 11, 13, 19 and 20): System Updates
// asks with refresh=none|branch|release, never force; one online request per component at a time; "Checked N ago" from the
// answer; the GitHub API line without the token; a calm rate-limit warning that keeps the saved answer marked stale and does
// not retry; the stage pinned to the commit shown, and a 409 stale_candidate that offers a refresh and stages nothing.
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
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const g = await import('../src/system-update-github.js')
const { checkOnlineSystemUpdate, stageOnlineSystemUpdate } = await import('../src/api.js')

const fmt = (date) => `T${date.toISOString().slice(11, 16)}`
const NOW = Date.parse('2026-11-02T07:00:00Z')
const iso = (offsetSeconds) => new Date(NOW + offsetSeconds * 1000).toISOString()
const SHA = 'A0cc8f51322b'.padEnd(40, '0')

// ---- (a) "Checked N ago" ----
assert.equal(g.checkedAgo(iso(-8), NOW), 'Checked 8 seconds ago')
assert.equal(g.checkedAgo(iso(-1), NOW), 'Checked 1 second ago')
assert.equal(g.checkedAgo(iso(0), NOW), 'Checked just now')
assert.equal(g.checkedAgo(iso(30), NOW), 'Checked just now', 'clock drift never reads as the future')
assert.equal(g.checkedAgo(iso(-180), NOW), 'Checked 3 minutes ago')
assert.equal(g.checkedAgo(iso(-60), NOW), 'Checked 1 minute ago')
assert.equal(g.checkedAgo(iso(-7200), NOW), 'Checked 2 hours ago')
assert.equal(g.checkedAgo(iso(-3 * 86400), NOW, { format: fmt }), 'Checked T07:00')
assert.equal(g.checkedAgo(null, NOW), '')
assert.equal(g.checkedAgo('not a date', NOW), '')

// release: from checked_at; branch: from the local time of a real check, else Core's saved check, honestly worded
assert.equal(g.checkedText({ kind: 'release', result: { checked_at: iso(-42) }, now: NOW }), 'Checked 42 seconds ago')
assert.equal(g.checkedText({ kind: 'release', result: { checked_at: null }, now: NOW }), 'Never')
assert.equal(g.checkedText({ kind: 'none', result: null, now: NOW }), 'Never')
const branchResult = (reason) => ({ branch: { head_commit: SHA }, refresh: { network_request: false, reason, requested: 'none' } })
assert.equal(g.checkedText({ kind: 'branch', result: branchResult('cache_fresh'), localAt: iso(-5), now: NOW }), 'Checked 5 seconds ago')
assert.equal(g.checkedText({ kind: 'branch', result: branchResult('cache_fresh'), now: NOW }), 'Saved check, less than 5 minutes old')
assert.equal(g.checkedText({ kind: 'branch', result: branchResult('recently_refreshed'), now: NOW }), 'Checked less than 20 seconds ago')
assert.equal(g.checkedText({ kind: 'branch', result: branchResult('rate_limited'), now: NOW }), 'Saved check')
assert.equal(g.checkedText({ kind: 'branch', result: { branch: { head_commit: null } }, now: NOW }), 'Never')

// a new check: network_request true or another request's fresh answer; an older Core (no refresh object) counts
assert.equal(g.isNewCheck({ refresh: { network_request: true, reason: 'refreshed' } }), true)
assert.equal(g.isNewCheck({ refresh: { network_request: false, reason: 'refreshed_by_another_request' } }), true)
assert.equal(g.isNewCheck({ refresh: { network_request: false, reason: 'recently_refreshed' } }), false)
assert.equal(g.isNewCheck({ refresh: { network_request: false, reason: 'cache_fresh' } }), false)
assert.equal(g.isNewCheck({ checked_at: iso(0) }), true)

// recently_refreshed is said, never claimed as a new check
assert.match(g.refreshNotice({ refresh: { network_request: false, reason: 'recently_refreshed', requested: 'branch' } }), /GitHub was not asked again/)
assert.match(g.refreshNotice({ refresh: { network_request: false, reason: 'refreshed_by_another_request', requested: 'release' } }), /Another check finished/)
assert.equal(g.refreshNotice({ refresh: { network_request: true, reason: 'refreshed', requested: 'branch' } }), null)
assert.equal(g.refreshNotice({ refresh: { network_request: false, reason: 'cache_fresh', requested: 'none' } }), null, 'a page load says nothing')
assert.equal(g.refreshNotice({}), null)

// ---- (b) the GitHub API line: the fields named, never anything else ----
const telemetry = { limit: 60, remaining: 43, used: 17, reset: 1, reset_at: '2026-11-02T07:29:07+00:00', resource: 'core', authenticated: false, observed_at: iso(-10), limited: false, token: 'ghp_SECRET' }
const view = g.rateLimitView(telemetry, { format: fmt })
assert.deepEqual(view, { remaining: '43', limit: '60', countText: '43 / 60 remaining', resetText: 'Resets T07:29', authenticated: false, authLabel: 'Unauthenticated', limited: false })
assert.ok(!JSON.stringify(view).includes('SECRET'), 'no token, whatever Core sends')
assert.equal(g.rateLimitView({ limit: 5000, remaining: 4982, authenticated: true }).countText, '4,982 / 5,000 remaining')
assert.equal(g.rateLimitView({ limit: 5000, remaining: 4982, authenticated: true }).authLabel, 'Authenticated')
assert.equal(g.rateLimitView({ limit: 60, remaining: 0, authenticated: false }).limited, true)
assert.equal(g.rateLimitView({}).countText, 'Remaining requests not reported')
assert.equal(g.rateLimitView(null), null)
assert.equal(g.latestTelemetry(null, { observed_at: iso(-60), remaining: 1 }, { observed_at: iso(-5), remaining: 2 }, undefined).remaining, 2)
assert.equal(g.latestTelemetry(null, undefined), null)

// ---- (c) rate limit: 200 with saved data, or 429 with nothing saved ----
const limitedResult = { latest_release: { tag: '1.17.98' }, github_rate_limit_error: { code: 'github_rate_limit_exceeded', detail: 'GitHub API rate limit exhausted.', reset_at: iso(1740), cached_data_available: true } }
const info = g.rateLimitFromResult(limitedResult)
assert.deepEqual(info, { code: 'github_rate_limit_exceeded', reset_at: iso(1740), cached_data_available: true })
assert.equal(g.rateLimitFromResult({ latest_release: {} }), null)
assert.equal(g.rateLimitFromResult({ github_rate_limit_error: { code: 'other' } }), null)
const err429 = Object.assign(new Error('GitHub API rate limit exhausted.'), { status: 429, payload: { code: 'github_rate_limit_exceeded', detail: 'GitHub API rate limit exhausted.', reset_at: iso(600), cached_data_available: false } })
assert.equal(g.rateLimitFromError(err429).cached_data_available, false)
assert.equal(g.rateLimitFromError(Object.assign(new Error('x'), { status: 429, payload: { detail: 'write rate limit' } })), null, 'a plain 429 is not GitHub')
assert.equal(g.rateLimitFromError(Object.assign(new Error('x'), { status: 400 })), null)
assert.equal(g.rateLimitActive(info, NOW), true)
assert.equal(g.rateLimitActive(info, NOW + 1800 * 1000), false)
assert.equal(g.rateLimitActive({ reset_at: null }, NOW), false)
const warn = g.rateLimitWarning(info, NOW, { format: fmt })
assert.match(warn, /used up until T07:29/)
assert.match(warn, /last saved result is shown and marked stale/)
assert.match(warn, /will not ask GitHub again before then/)
assert.doesNotMatch(warn, /!|urgent|error|failed/i, 'calm wording')
assert.match(g.rateLimitWarning(g.rateLimitFromError(err429), NOW, { format: fmt }), /no saved result to show yet/)
assert.match(g.rateLimitWarning(info, NOW + 1800 * 1000, { format: fmt }), /reset at T07:29\..*Use Refresh to check again/)
assert.match(g.rateLimitWarning({ reset_at: null, cached_data_available: true }, NOW), /did not say when it resets/)
assert.equal(g.rateLimitWarning(null, NOW), '')

// ---- (d) the stage pin and 409 ----
assert.equal(g.pinnedCommit(SHA), SHA.toLowerCase())
assert.equal(g.pinnedCommit(` ${SHA} `), SHA.toLowerCase())
for (const bad of ['a0cc8f5', 'z'.repeat(40), '', null, undefined, 42, SHA + '0']) assert.equal(g.pinnedCommit(bad), null, String(bad))
assert.equal(g.isStaleCandidate(Object.assign(new Error('x'), { status: 409, code: 'stale_candidate' })), true)
assert.equal(g.isStaleCandidate(Object.assign(new Error('x'), { status: 409, payload: { code: 'stale_candidate' } })), true)
assert.equal(g.isStaleCandidate(Object.assign(new Error('x'), { status: 409, payload: { code: 'other' } })), false)
assert.equal(g.isStaleCandidate(Object.assign(new Error('x'), { status: 400, code: 'stale_candidate' })), false)
assert.match(g.staleCandidateMessage('branch'), /^The branch moved after your last check, so nothing was downloaded\. Refresh the check/)
assert.match(g.staleCandidateMessage('release'), /stable release changed/)

// ---- (e) wire level ----
{
  const seen = []
  globalThis.fetch = async (url, options) => { seen.push({ url, options }); return json({ component: 'ui', refresh: { network_request: false, reason: 'cache_fresh', requested: 'none' } }) }
  await checkOnlineSystemUpdate('ui')
  await checkOnlineSystemUpdate('framework', { refresh: 'branch' })
  await checkOnlineSystemUpdate('framework', { refresh: 'release' })
  await checkOnlineSystemUpdate('ui', { refresh: null })
  assert.deepEqual(seen.map((s) => s.url.replace('https://rmm.example.test', '')), [
    '/api/tfd/system/updates/online/?component=ui&refresh=none',
    '/api/tfd/system/updates/online/?component=framework&refresh=branch',
    '/api/tfd/system/updates/online/?component=framework&refresh=release',
    '/api/tfd/system/updates/online/?component=ui&refresh=none',
  ])
  assert.ok(seen.every((s) => !/force/.test(s.url)), 'force is never sent')
  await assert.rejects(() => checkOnlineSystemUpdate('ui', { refresh: 'everything' }), /none, branch, release or all/)
  await assert.rejects(() => checkOnlineSystemUpdate('ui', { force: true, refresh: 'force' }), /none, branch, release or all/)
  assert.equal(seen.length, 4, 'an invalid scope sends nothing')

  // 429: the error keeps the body for the page
  globalThis.fetch = async () => json(err429.payload, 429)
  await assert.rejects(() => checkOnlineSystemUpdate('ui', { refresh: 'branch' }), (error) => g.rateLimitFromError(error)?.reset_at === iso(600))

  // stage: the commit shown, lower case; a bad value is left out; no commit keeps the old body
  let body = null
  globalThis.fetch = async (url, init) => { body = JSON.parse(init.body); return json({ upload_id: 'u1' }, 201) }
  await stageOnlineSystemUpdate('ui', 'branch', 'dev', SHA)
  assert.deepEqual(body, { component: 'ui', source_type: 'branch', ref: 'dev', commit: SHA.toLowerCase() })
  await stageOnlineSystemUpdate('framework', 'release', null, 'abc')
  assert.deepEqual(body, { component: 'framework', source_type: 'release', ref: null })
  await stageOnlineSystemUpdate('ui')
  assert.deepEqual(body, { component: 'ui' })
  // 409 stale_candidate reaches the page with its code
  globalThis.fetch = async () => json({ code: 'stale_candidate', detail: 'The update you checked is no longer the one on record. Refresh the check and try again.' }, 409)
  await assert.rejects(() => stageOnlineSystemUpdate('ui', 'branch', 'dev', SHA), (error) => g.isStaleCandidate(error))
}

// ---- (f) the page: run the real checkOnline, runOnlineCheck and refreshOnline with stubs ----
const sfc = read('../src/views/SystemUpdatesView.vue')
const script = sfc.slice(0, sfc.indexOf('</script>'))
const template = sfc.slice(sfc.indexOf('<template>'))
{
  const a = script.indexOf('// 0.12.124 (Core 1.17.98): refresh is none')
  const b = script.indexOf('function formatCheckedAt')
  assert.ok(a > 0 && b > a)
  const body = script.slice(a, b)
  const make = new Function('deps', `const { onlineRequestGate, onlineScope, onlineInFlight, onlineBusy, error, checkOnlineSystemUpdate, online, rateLimit, rateLimitFromResult, rateLimitFromError, refreshNote, refreshNotice, staleCandidate, isNewCheck, checkedAtLocal, rateLimitActive } = deps\n${body}\nreturn { checkOnline, refreshOnline }`)
  const gate = () => {
    const ids = { framework: 0, ui: 0 }
    return { begin: (k) => ++ids[k], isCurrent: (k, id) => ids[k] === id, invalidate: (k) => { ids[k] += 1 } }
  }
  const setup = (answer) => {
    const calls = []
    const pending = []
    const deps = {
      onlineRequestGate: gate(),
      onlineScope: { value: { framework: null, ui: null } },
      onlineInFlight: { framework: null, ui: null },
      onlineBusy: { value: { framework: false, ui: false } },
      error: { value: '' },
      online: { value: { framework: { kept: true }, ui: { kept: true } } },
      rateLimit: { value: { framework: null, ui: null } },
      refreshNote: { value: { framework: '', ui: '' } },
      staleCandidate: { value: { framework: 'old', ui: '' } },
      checkedAtLocal: { value: { framework: null, ui: null } },
      checkOnlineSystemUpdate: (component, options) => {
        calls.push([component, options.refresh])
        return new Promise((resolve, reject) => pending.push(() => answer(component, options, resolve, reject)))
      },
      rateLimitFromResult: g.rateLimitFromResult,
      rateLimitFromError: g.rateLimitFromError,
      refreshNotice: g.refreshNotice,
      isNewCheck: g.isNewCheck,
      rateLimitActive: g.rateLimitActive,
    }
    const flush = async () => { while (pending.length) { pending.shift()(); await new Promise((r) => setTimeout(r, 0)) } }
    return { deps, calls, flush, page: make(deps) }
  }
  const tick = () => new Promise((r) => setTimeout(r, 0))

  // ten rapid presses: one request, and the button state is set while it runs
  {
    const t = setup((c, o, resolve) => resolve({ component: c, refresh: { network_request: true, reason: 'refreshed', requested: o.refresh } }))
    const presses = Array.from({ length: 10 }, () => t.page.checkOnline('framework', { refresh: 'branch' }))
    assert.equal(t.calls.length, 1, 'one request for ten presses')
    assert.equal(t.deps.onlineScope.value.framework, 'branch', 'its button shows Checking and both are off')
    await t.flush(); await Promise.all(presses)
    assert.equal(t.deps.onlineScope.value.framework, null)
    assert.equal(t.deps.staleCandidate.value.framework, '', 'a refresh clears the stale-candidate note')
    assert.ok(t.deps.checkedAtLocal.value.framework, 'a real check sets the local time')
    // Framework and UI refresh independently
    const both = [t.page.checkOnline('framework', { refresh: 'branch' }), t.page.checkOnline('ui', { refresh: 'release' })]
    assert.deepEqual(t.calls.slice(1), [['framework', 'branch'], ['ui', 'release']])
    await t.flush(); await Promise.all(both)
  }
  // a saved source change waits for the running one and then asks once (refresh=none)
  {
    const t = setup((c, o, resolve) => resolve({ refresh: { network_request: false, reason: 'cache_fresh', requested: o.refresh } }))
    const first = t.page.checkOnline('ui', { background: true })
    const after = t.page.checkOnline('ui', { waitForCurrent: true })
    assert.equal(t.calls.length, 1)
    await t.flush(); await first
    await tick(); await t.flush(); await after
    assert.deepEqual(t.calls, [['ui', 'none'], ['ui', 'none']])
    assert.equal(t.deps.checkedAtLocal.value.ui, null, 'a cache_fresh answer is not a new check')
  }
  // recently_refreshed: the note, no new check time
  {
    const t = setup((c, o, resolve) => resolve({ branch: { head_commit: SHA }, refresh: { network_request: false, reason: 'recently_refreshed', requested: 'branch' } }))
    const p = t.page.checkOnline('ui', { refresh: 'branch' }); await t.flush(); await p
    assert.match(t.deps.refreshNote.value.ui, /GitHub was not asked again/)
    assert.equal(t.deps.checkedAtLocal.value.ui, null)
  }
  // 200 with github_rate_limit_error: the saved answer is shown and the warning set
  {
    const t = setup((c, o, resolve) => resolve(limitedResult))
    const p = t.page.checkOnline('framework', { refresh: 'release' }); await t.flush(); await p
    assert.equal(t.deps.online.value.framework, limitedResult)
    assert.equal(t.deps.rateLimit.value.framework.cached_data_available, true)
    assert.equal(t.deps.error.value, '', 'no red error for a used-up limit')
    // the hourly look does not ask while the reset time is ahead
    const realNow = Date.now
    Date.now = () => NOW
    let hourly
    try { hourly = t.page.refreshOnline() } finally { Date.now = realNow }
    assert.deepEqual(t.calls.map((c) => c[0]), ['framework', 'ui'], 'framework skipped, ui asked with refresh=none')
    assert.equal(t.calls[1][1], 'none')
    await t.flush(); await hourly
  }
  // 429: whatever the card showed stays, marked stale; no red error, no retry
  {
    const t = setup((c, o, resolve, reject) => reject(err429))
    const p = t.page.checkOnline('ui', { refresh: 'branch' }); await t.flush(); await p
    assert.deepEqual(t.deps.online.value.ui, { kept: true })
    assert.equal(t.deps.rateLimit.value.ui.cached_data_available, false)
    assert.equal(t.deps.error.value, '')
    assert.equal(t.calls.length, 1)
  }
  // another failure still shows its message for a press, and nothing for a background load
  {
    const t = setup((c, o, resolve, reject) => reject(Object.assign(new Error('GitHub request failed (500)'), { status: 400 })))
    let p = t.page.checkOnline('ui', { refresh: 'branch' }); await t.flush(); await p
    assert.equal(t.deps.error.value, 'GitHub request failed (500)')
    t.deps.error.value = ''
    p = t.page.checkOnline('ui', { background: true }); await t.flush(); await p
    assert.equal(t.deps.error.value, '')
  }
}

// ---- (g) source checks on the page ----
assert.doesNotMatch(script, /force: true|force = |force\b.*checkOnlineSystemUpdate/, 'the page never sends force')
assert.match(script, /checkOnlineSystemUpdate\(component, \{ refresh \}\)/)
// page load and the hourly look: refreshOnline, background, refresh=none
const mounted = script.slice(script.indexOf('onMounted(async'), script.indexOf('onBeforeUnmount('))
assert.match(mounted, /refreshOnline\(\)/)
assert.doesNotMatch(mounted, /refresh: '(branch|release|all)'/)
// job polling never checks GitHub
const refreshJob = script.slice(script.indexOf('async function refreshJob'), script.indexOf('function reloadUi'))
assert.doesNotMatch(refreshJob, /checkOnline|refreshOnline|refreshComponent/)
const polling = script.slice(script.indexOf('function startPolling'), script.indexOf('function scheduleReload'))
assert.doesNotMatch(polling, /checkOnline|refreshOnline/)
// the Refresh buttons
assert.match(template, /@click="refreshComponent\(component\.id, primaryScope\(component\.id\)\)"/)
assert.match(template, /@click="refreshComponent\(component\.id, 'release'\)"/)
assert.match(script, /return savedIsBranch\(component\) \? 'branch' : 'release'/)
assert.match(script, /return Boolean\(onlineScope\.value\[component\]\) \|\| stageBusy\.value \|\| limitActive\(component\)/)
assert.match(template, /data-test="refresh-primary" :disabled="refreshBlocked\(component\.id\) \|\| sourceBlocked\(component\.id\)"/)
assert.match(template, /data-test="refresh-stable-release" :disabled="refreshBlocked\(component\.id\)"/)
// status display
assert.match(template, /data-test="github-api-state"/)
assert.match(template, /githubApi\.countText/)
assert.match(template, /githubApi\.resetText/)
assert.match(template, /githubApi\.authLabel/)
assert.doesNotMatch(sfc, /token/i, 'the page names no token')
assert.match(template, /data-test="github-rate-limit-warning"/)
assert.match(template, /\|\| shownStale\(component\.id\)" class="pill warn ml">STALE</)
assert.match(template, /data-test="refresh-note"/)
// the stage pin and 409
const stageFn = script.slice(script.indexOf('async function stageOnline'), script.indexOf('function pickOfflinePackage'))
assert.match(stageFn, /const commit = oneOff \? null : shownCommit\(component, type\)/)
assert.match(stageFn, /isStaleCandidate\(err\)[\s\S]*staleCandidate\.value\[component\] = staleCandidateText\(err, type\)\s*return/)
assert.doesNotMatch(stageFn.slice(stageFn.indexOf('isStaleCandidate(err)')), /stageOnlineSystemUpdate/, 'a 409 never stages again by itself')
assert.match(script, /if \(type === 'branch'\) return pinnedCommit\(branchCheck\(component\)\?\.branch\?\.head_commit\)/)
assert.match(script, /return pinnedCommit\(online\.value\[component\]\?\.latest_release\?\.commit\)/)
assert.match(template, /data-test="stale-candidate"/)
assert.match(template, /Refresh the check/)
assert.match(template, /:disabled="stageBusy \|\| Boolean\(onlineScope\[component\.id\]\)/, 'no stage while a check runs')
assert.doesNotMatch(sfc, /v-html|localStorage|sessionStorage|Authorization/)
for (const file of ['../src/system-update-github.js']) assert.doesNotMatch(read(file), /fetch\(|Authorization|localStorage|sessionStorage|import /)

// The component compiles.
try {
  const { parse, compileScript, compileTemplate } = await import('@vue/compiler-sfc')
  const { descriptor, errors } = parse(sfc, { filename: 'SystemUpdatesView.vue' })
  assert.equal(errors.length, 0)
  compileScript(descriptor, { id: 'x' })
  const compiled = compileTemplate({ source: descriptor.template.content, filename: 'SystemUpdatesView.vue', id: 'x' })
  assert.equal(compiled.errors.length, 0, JSON.stringify(compiled.errors))
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
}
console.log('github-rate-limit-0.12.124: PASS')
