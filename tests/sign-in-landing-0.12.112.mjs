// 0.12.112: the sign-in landing hook (context.signInLanding). A route result moves through requestLeave and router.replace; a
// { dialog } result opens the module's own registered dialog; nothing runs on a popup, a public or sso page, while signed out,
// outside a backend context, or on a deep link; the first acting check wins; a check that throws, rejects, answers badly or
// runs out of time is ignored with a warning; a route is accepted only when it is one safe route of the module or of Core; the
// unsaved guard keeps the person in place; sign-out aborts the signal; the run is one-shot; an unloaded module is never called.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { createSignInLandingRegistry, createSignInLandingRunner, landingRoutePathProblem, runSignInLanding } = await import(new URL('../src/sign-in-landing.js', import.meta.url).href)
const { createModuleDialogService } = await import(new URL('../src/module-dialogs.js', import.meta.url).href)

// A fake router: a few named Core routes, a module route per owner, a popup and a public route, and the catch-all.
const ROUTES = [
  { path: '/dashboards', name: 'dashboards', meta: { title: 'Dashboards' } },
  { path: '/help', name: 'help', meta: {} },
  { path: '/help/:articleId', name: 'help-article', meta: {} },
  { path: '/administration/welcome', name: undefined, meta: { dynamicModule: 'welcome' } },
  { path: '/other/page', name: undefined, meta: { dynamicModule: 'other' } },
  { path: '/popup/:pathMatch(.*)*', name: 'popup-pending', meta: {} },
  { path: '/public/:pathMatch(.*)*', name: 'public-pending', meta: { public: true } },
  { path: '/sso/callback', name: 'sso-callback', meta: { public: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]
// The catch-all is the last entry. A catch-all prefix ('/popup' for the popup catch-all) matches its own tree only.
function matchRoute(path) {
  for (const r of ROUTES.slice(0, -1)) {
    if (r.path.includes('/:pathMatch')) {
      const prefix = r.path.slice(0, r.path.indexOf('/:pathMatch'))
      if (path === prefix || path.startsWith(`${prefix}/`)) return r
    } else if (r.path.includes(':')) {
      if (new RegExp(`^${r.path.replace(/:[A-Za-z]+/g, '[^/]+')}$`).test(path)) return r
    } else if (r.path === path) {
      return r
    }
  }
  return ROUTES[ROUTES.length - 1]
}
function fakeRouter() {
  const replaced = []
  return {
    replaced,
    resolve(path) {
      return { path, matched: [matchRoute(path)] }
    },
    replace(path) { replaced.push(path); return Promise.resolve() },
  }
}
const warnings = []
const warn = (...args) => { warnings.push(args.map((a) => String(a?.message || a)).join(' ')) }
const leaveDirect = (action) => { action(); return true }
const allow = () => true
const base = (over = {}) => ({
  router: fakeRouter(),
  requestLeave: leaveDirect,
  signedIn: true,
  trusted: true,
  initialTarget: '/dashboards',
  hasPermission: allow,
  warn,
  timeoutMs: 200,
  ...over,
})
const check = (value, log = []) => ({ moduleId: 'welcome', id: 'landing', permission: '', check: (args) => { log.push(args); return value } })

// (1) a route result moves with router.replace through requestLeave
{
  const router = fakeRouter()
  const moves = []
  const result = await runSignInLanding(base({
    router,
    requestLeave: (action) => { moves.push('leave'); action(); return true },
    checks: [check('/administration/welcome')],
  }))
  assert.deepEqual(result, { acted: true, kind: 'route', moduleId: 'welcome', path: '/administration/welcome' })
  assert.deepEqual(router.replaced, ['/administration/welcome'], 'router.replace is used, so Back does not return to the redirect')
  assert.deepEqual(moves, ['leave'], 'the move goes through requestLeave')
}

// (2) a { dialog } result opens the module's own registered dialog
{
  const dialogs = createModuleDialogService({ warn })
  const welcome = dialogs.forModule('welcome')
  welcome.register({ id: 'wizard', title: 'Welcome', mount() {} })
  const result = await runSignInLanding(base({
    dialogs,
    checks: [{ moduleId: 'welcome', id: 'landing', check: () => ({ dialog: 'welcome.wizard' }) }],
  }))
  assert.deepEqual(result, { acted: true, kind: 'dialog', moduleId: 'welcome', dialog: 'welcome.wizard' })
  assert.equal(dialogs.state.current.id, 'welcome.wizard')
  dialogs.closeAll()
}

// (3) another module's dialog id is refused, and the next check still runs
{
  const dialogs = createModuleDialogService({ warn })
  dialogs.forModule('other').register({ id: 'x', mount() {} })
  const before = warnings.length
  const result = await runSignInLanding(base({
    dialogs,
    checks: [
      { moduleId: 'welcome', id: 'landing', check: () => ({ dialog: 'other.x' }) },
      { moduleId: 'later', id: 'landing', check: () => '/dashboards' },
    ],
  }))
  assert.equal(dialogs.isOpen(), false, 'another module dialog is not opened')
  assert.equal(result.kind, 'route', 'the next check ran')
  assert.ok(warnings.slice(before).some((w) => w.includes('welcome')), 'the refusal is logged with the module named')
}

// (4) nothing runs on a popup, a public or sso page, while signed out, outside a backend context, or on a deep link
{
  const cases = [
    [{ popup: true }, 'popup'],
    [{ signedIn: false }, 'signed-out'],
    [{ trusted: false }, 'untrusted'],
    [{ initialTarget: '/public/x/y' }, 'not-default-landing'],
    [{ initialTarget: '/sso/callback' }, 'not-default-landing'],
    [{ initialTarget: '/endpoints' }, 'not-default-landing'],
    [{ initialTarget: '/dashboards/abc' }, 'not-default-landing'],
    [{ initialTarget: '/dashboards?x=1' }, 'not-default-landing'],
  ]
  for (const [over, reason] of cases) {
    const log = []
    const result = await runSignInLanding(base({ ...over, checks: [check('/administration/welcome', log)] }))
    assert.equal(result.acted, false)
    assert.equal(result.reason, reason, `reason for ${JSON.stringify(over)}`)
    assert.equal(log.length, 0, `the check is not called for ${JSON.stringify(over)}`)
  }
  // the default landing: '/' and '/dashboards', and no hash at all (null)
  for (const initialTarget of ['/', '/dashboards', null]) {
    const log = []
    const result = await runSignInLanding(base({ initialTarget, checks: [check(undefined, log)] }))
    assert.equal(result.reason, 'no-check-acted')
    assert.equal(log.length, 1, `the check is called on the default landing ${initialTarget}`)
  }
}

// (5) the first acting check wins; a later check is not called
{
  const later = []
  const result = await runSignInLanding(base({
    checks: [
      { moduleId: 'a', id: 'l', check: () => undefined },
      { moduleId: 'welcome', id: 'l', check: () => '/administration/welcome' },
      { moduleId: 'z', id: 'l', check: () => { later.push('z'); return '/administration/welcome' } },
    ],
    router: fakeRouter(),
  }))
  assert.equal(result.moduleId, 'welcome')
  assert.deepEqual(later, [], 'the later check did not run')
}

// (6) a permission option: the check is not called without it, and called with it
{
  const log = []
  await runSignInLanding(base({
    hasPermission: () => false,
    checks: [{ moduleId: 'welcome', id: 'l', permission: 'welcome.view', check: () => { log.push(1); return '/administration/welcome' } }],
  }))
  assert.equal(log.length, 0, 'not called without the permission')
  const result = await runSignInLanding(base({
    hasPermission: (code) => code === 'welcome.view',
    checks: [{ moduleId: 'welcome', id: 'l', permission: 'welcome.view', check: () => { log.push(2); return '/administration/welcome' } }],
  }))
  assert.equal(result.acted, true)
  assert.deepEqual(log, [2])
}

// (7) throw, reject, an unusable value and a timeout are ignored with one warning, and the next check still runs
{
  const before = warnings.length
  const result = await runSignInLanding(base({
    timeoutMs: 30,
    checks: [
      { moduleId: 'throws', id: 'l', check: () => { throw new Error('boom') } },
      { moduleId: 'rejects', id: 'l', check: () => Promise.reject(new Error('nope')) },
      { moduleId: 'bad', id: 'l', check: () => true },
      { moduleId: 'slow', id: 'l', check: () => new Promise(() => {}) },
      { moduleId: 'welcome', id: 'l', check: () => '/administration/welcome' },
    ],
  }))
  assert.equal(result.moduleId, 'welcome')
  const logged = warnings.slice(before)
  assert.ok(logged.some((w) => w.includes('throws') && w.includes('failed')))
  assert.ok(logged.some((w) => w.includes('rejects') && w.includes('failed')))
  assert.ok(logged.some((w) => w.includes('bad') && w.includes('cannot use')))
  assert.ok(logged.some((w) => w.includes('slow') && w.includes('in time')))
  assert.equal(logged.length, 4, 'one warning per ignored check')
}

// (8) a late answer after the time limit is ignored
{
  const dialogs = createModuleDialogService({ warn })
  let late = null
  const result = await runSignInLanding(base({
    timeoutMs: 20,
    dialogs,
    checks: [
      { moduleId: 'slow', id: 'l', check: () => new Promise((resolve) => { late = resolve }) },
      { moduleId: 'welcome', id: 'l', check: () => '/administration/welcome' },
    ],
  }))
  late('/other/page')
  assert.equal(result.path, '/administration/welcome', 'the late answer did not act')
}

// (9) unsafe route strings and routes of another module are refused, with the next check still running
{
  const unsafe = [
    'https://example.com/x', '//example.com', '/a/../b', '\\x', '/x#y', '/popup/welcome', '/public/x', '/sso/callback',
    'x', ' /dashboards', '/other/page', '/nope/unknown', '/', '/a:b', '/x\u0007', '/help/:articleId', '/ ',
  ]
  for (const path of unsafe) {
    const router = fakeRouter()
    const result = await runSignInLanding(base({ router, checks: [{ moduleId: 'welcome', id: 'l', check: () => path }] }))
    assert.equal(result.acted, false, `refused: ${JSON.stringify(path)}`)
    assert.deepEqual(router.replaced, [], `no move for ${JSON.stringify(path)}`)
  }
  // accepted: the module's own route, and a Core named route
  for (const path of ['/administration/welcome', '/dashboards', '/help']) {
    const result = await runSignInLanding(base({ checks: [{ moduleId: 'welcome', id: 'l', check: () => path }] }))
    assert.equal(result.acted, true, `accepted: ${path}`)
  }
  assert.equal(landingRoutePathProblem('/other/page', 'welcome', fakeRouter()).includes('belongs to other'), true)
  assert.equal(landingRoutePathProblem('/nope/unknown', 'welcome', fakeRouter()), 'it is the catch-all or a redirect, not a page')
  assert.equal(landingRoutePathProblem('/', 'welcome', fakeRouter()), 'it is the catch-all or a redirect, not a page')
}

// (10) a dirty page keeps the person in place: no move, the landing is dropped and not retried
{
  const router = fakeRouter()
  let asked = 0
  const result = await runSignInLanding(base({
    router,
    isDirty: () => true,
    requestLeave: () => { asked += 1; return false },
    checks: [{ moduleId: 'welcome', id: 'l', check: () => '/administration/welcome' }],
  }))
  assert.equal(result.reason, 'unsaved-changes')
  assert.deepEqual(router.replaced, [])
  assert.equal(asked, 0, 'the landing is dropped, not sent to the unsaved prompt')

  // a dialog result over a dirty page is dropped too: the dialog does not open
  const opened = []
  const dialogsStub = { isRegistered: () => true, openRegistered: (id) => { opened.push(id) } }
  const dirtyDialog = await runSignInLanding(base({
    router: fakeRouter(),
    isDirty: () => true,
    dialogs: dialogsStub,
    checks: [{ moduleId: 'welcome', id: 'l', check: () => ({ dialog: 'welcome.wizard' }) }],
  }))
  assert.equal(dirtyDialog.reason, 'unsaved-changes')
  assert.deepEqual(opened, [], 'a dirty page does not get the module dialog')
}

// (11) sign-out aborts the signal the check was given
{
  const controller = new AbortController()
  let seen = null
  const pending = runSignInLanding(base({
    signal: controller.signal,
    checks: [
      { moduleId: 'slow', id: 'l', check: (args) => { seen = args.signal; return new Promise(() => {}) } },
      { moduleId: 'welcome', id: 'l', check: () => '/administration/welcome' },
    ],
    timeoutMs: 5000,
  }))
  await new Promise((resolve) => setTimeout(resolve, 5))
  controller.abort()
  assert.equal(seen.aborted, true, 'the check gets a signal that aborts on sign-out')
  const result = await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve('still waiting'), 50))])
  assert.notEqual(result, 'still waiting', 'sign-out does not hang the landing')
}

// (12) one-shot: a second run does nothing, so the check is called once per page load
{
  const runOnce = createSignInLandingRunner()
  const log = []
  const options = base({ checks: [{ moduleId: 'welcome', id: 'l', check: () => { log.push(1); return undefined } }] })
  await runOnce(options)
  const again = await runOnce(options)
  assert.equal(again.reason, 'already-ran')
  assert.equal(log.length, 1)
}

// (13) the registry: one registration per module (a second replaces the first), load order kept, an unloaded module is dropped
{
  const registry = createSignInLandingRegistry()
  const welcome = registry.forModule('welcome')
  const other = registry.forModule('other')
  welcome.register({ id: 'landing', check: () => 'first' })
  other.register({ id: 'landing', check: () => 'other' })
  welcome.register({ id: 'landing', check: () => 'second' })
  assert.deepEqual(registry.list().map((e) => e.moduleId), ['welcome', 'other'], 'load order kept')
  assert.equal(registry.list()[0].check(), 'second', 'a second register replaces the first')
  assert.throws(() => welcome.register({ id: 'Bad Id', check() {} }), TypeError)
  assert.throws(() => welcome.register({ id: 'landing' }), TypeError, 'check is required')
  assert.throws(() => welcome.register({ id: 'landing', check() {}, permission: 3 }), TypeError)
  registry.removeProvider('welcome')
  assert.deepEqual(registry.list().map((e) => e.moduleId), ['other'], 'an unloaded module is never called')
  welcome.clear()
  assert.throws(() => welcome.register({ id: 'landing', check() {} }), (error) => error.status === 0, 'a cleared registration is refused')
  assert.throws(() => registry.forModule(''), Error)
}

// (14) the shell wiring: the public loader never gets the registry; main.js runs the landing after the replay, once, not in a popup
{
  const loader = read('../src/module-loader.js')
  const publicStart = loader.indexOf('export async function loadPublicUiModules')
  const publicEnd = loader.indexOf('export async function loadUiModules')
  const publicPart = loader.slice(publicStart, publicEnd)
  assert.ok(!publicPart.includes('signInLanding') && !publicPart.includes('dialogs'), 'registerPublic gets no landing check and no dialogs')
  assert.ok(loader.includes("'dialogs', 'signInLanding'"), 'unload drops both registrations')
  const main = read('../src/main.js')
  const runAt = main.indexOf('await runSignInLandingOnce({')
  const replayAt = main.indexOf('await router.replace(initialHashTarget)\n    }')
  assert.ok(runAt > replayAt && replayAt > 0, 'the landing runs after the entry route is replayed')
  assert.ok(main.includes('if (!popupMode) {') && main.slice(runAt - 200, runAt).includes('if (!popupMode)'), 'a popup never runs it')
  assert.ok(main.includes('landingController.abort()'), 'sign-out aborts the check')
  assert.ok(!/loadPublicUiModules\(\s*\{[^}]*signInLanding/.test(main), 'the public loader is not given the landing registry')
}

// (15) the docs name the row and the rules
{
  const doc = read('../docs/module-sign-in-landing.md')
  assert.ok(doc.startsWith('# Sign-in landing'))
  for (const needle of ['ui.authenticated.signInLanding', 'requestLeave', 'router.replace', 'one-shot', 'AbortSignal', 'not yet in the export', 'context.module_register_timeout_seconds', 'UI Q66', 'UI Q67']) {
    assert.ok(doc.includes(needle), `the landing doc names ${needle}`)
  }
  const api = read('../docs/module-runtime-api.md')
  const notes = api.split('\n').filter((line) => line.startsWith('**Contract row (UI 0.12.112, not yet in the export).** Browser contract row `ui.authenticated.signInLanding`'))
  assert.equal(notes.length, 1, 'one signInLanding contract-row note in the runtime page')
  assert.ok(notes[0].includes('does not claim the export lists it'))
  assert.ok(notes[0].includes('Core writes the export row'))
  assert.ok(api.includes('## Sign-in landing (signInLanding)'))
}

console.log('sign-in-landing-0.12.112: PASS')
