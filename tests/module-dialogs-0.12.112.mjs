// 0.12.112: the shell dialog host for modules (context.dialogs). The service rules (one at a time, own id only, refusals, Escape and
// beforeClose, mount cleanup once, mount failure and time limit, late results, sign-out and unload), the loader binding, the
// layer order in styles.css, the App.vue mount, the plain-text rule and the two documents.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { createModuleDialogService, cleanDialogTitle, dialogTimeoutMs } = await import(new URL('../src/module-dialogs.js', import.meta.url).href)

// The loader is loaded as a data: URL with only the vue import replaced, the way the older tests do it.
const loaderSource = read('../src/module-loader.js').replace("import * as Vue from 'vue'", 'const Vue = {}')
const { loadUiModules, unloadUiModule } = await import(`data:text/javascript;base64,${Buffer.from(loaderSource).toString('base64')}`)

const warnings = []
const warn = (...args) => { warnings.push(args.map((a) => String(a?.message || a)).join(' ')) }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const fakeEl = () => {
  const el = { children: [], textContent: '', focus() {} }
  el.replaceChildren = (...nodes) => { el.children = nodes; el.textContent = '' }
  return el
}
const refusedOk = (error) => error && error.status === 0 && error.code === null
const make = (over = {}) => createModuleDialogService({
  isPopup: () => false,
  isSignedOut: () => false,
  isTrustedContext: () => true,
  timeoutSeconds: () => 30,
  warn,
  ...over,
})

// (1) only the calling module's own id: a registered 'other.x' is refused, and a bad id is a TypeError
{
  const svc = make()
  const m = svc.forModule('m')
  assert.throws(() => m.register({ id: 'other.x', mount() {} }), TypeError)
  assert.throws(() => m.register({ id: 'x y', mount() {} }), TypeError)
  assert.throws(() => m.register({ id: 'ok', title: 'T' }), TypeError, 'mount is required')
  m.register({ id: 'x', title: 'X', mount() {} })
  assert.equal(svc.isRegistered('m.x'), true)
  assert.equal(svc.isRegistered('other.x'), false)
  await assert.rejects(m.open('other.x'), refusedOk)
  const other = svc.forModule('other')
  other.register({ id: 'y', mount() {} })
  await assert.rejects(m.open('y'), refusedOk, 'a dialog of another module is not open to this module')
}

// (2) size mapping and title as text
{
  const svc = make()
  const m = svc.forModule('m')
  m.open({ id: 'a', title: 'Hi <b>', size: 'wide', mount() {} }).catch(() => {})
  assert.equal(svc.state.current.size, 'wide')
  assert.equal(svc.state.current.title, 'Hi <b>', 'the title is kept as text, never parsed')
  await svc.requestClose()
  m.open({ id: 'b', title: '', size: 'huge', mount() {} }).catch(() => {})
  assert.equal(svc.state.current.size, 'default', 'anything but wide is default')
  assert.equal(svc.state.current.title, 'Dialog', 'an empty title falls back to a plain name')
  await svc.requestClose()
  assert.equal(cleanDialogTitle('a​\n b\u0007  c'), 'a b c')
  assert.equal(cleanDialogTitle('x'.repeat(250)).length, 200)
}

// (3) one at a time, and the refusals: popup, signed out, untrusted, unknown id, abandoned, unloaded
{
  const svc = make()
  const m = svc.forModule('m')
  m.register({ id: 'd', mount(el) { el.textContent = 'x' } })
  const first = m.open('d')
  await assert.rejects(m.open('d'), refusedOk, 'a second open while one is open is refused')
  assert.equal(svc.isOpen(), true)
  await svc.requestClose()
  await first
  assert.equal(svc.isOpen(), false)

  let popup = true
  const popupSvc = make({ isPopup: () => popup })
  popupSvc.forModule('m').register({ id: 'd', mount() {} })
  await assert.rejects(popupSvc.forModule('m').open('d'), refusedOk, 'refused in a popup window')
  popup = false

  let signedOut = true
  const outSvc = make({ isSignedOut: () => signedOut })
  outSvc.forModule('m').register({ id: 'd', mount() {} })
  await assert.rejects(outSvc.forModule('m').open('d'), refusedOk, 'refused while signed out')
  signedOut = false

  const untrusted = make({ isTrustedContext: () => false })
  untrusted.forModule('m').register({ id: 'd', mount() {} })
  await assert.rejects(untrusted.forModule('m').open('d'), refusedOk, 'refused outside a backend context')

  await assert.rejects(m.open('nope'), refusedOk, 'an unknown registered id is refused')

  let abandoned = false
  const ab = make()
  const bound = ab.forModule('m', { isAbandoned: () => abandoned })
  bound.register({ id: 'd', mount() {} })
  abandoned = true
  await assert.rejects(bound.open('d'), refusedOk, 'refused after the module was abandoned')
  assert.throws(() => bound.register({ id: 'e', mount() {} }), refusedOk)

  const un = make()
  const unloaded = un.forModule('m')
  unloaded.register({ id: 'd', mount() {} })
  unloaded.clear()
  await assert.rejects(unloaded.open('d'), refusedOk, 'refused after the module was unloaded')
  assert.equal(un.isRegistered('m.d'), false, 'its registrations are gone')
}

// (4) Escape, the close button and a backdrop click ask beforeClose(); a veto or a throw keeps the dialog open
{
  const svc = make()
  const m = svc.forModule('m')
  let asked = 0
  let answer = false
  m.register({ id: 'd', mount() {}, beforeClose() { asked += 1; return answer } })
  const closed = m.open('d')
  assert.equal(await svc.requestClose(), false, 'a veto keeps it open')
  assert.equal(svc.isOpen(), true)
  assert.equal(asked, 1)
  answer = Promise.resolve(false)
  assert.equal(await svc.requestClose(), false, 'a promise of false keeps it open')
  answer = true
  assert.equal(await svc.requestClose(), true, 'a true answer closes')
  await closed
  assert.equal(svc.isOpen(), false)

  const throwing = make()
  const t = throwing.forModule('m')
  const before = warnings.length
  t.register({ id: 'd', mount() {}, beforeClose() { throw new Error('unsaved check broke') } })
  t.open('d')
  assert.equal(await throwing.requestClose(), false, 'a throw keeps it open')
  assert.equal(throwing.isOpen(), true)
  assert.ok(warnings.slice(before).some((w) => w.includes('beforeClose() failed')), 'the throw is logged once with the module named')
  await throwing.requestClose()
  t.clear()

  // a module with no beforeClose closes at once; a failed dialog closes without asking
  const plain = make()
  plain.forModule('m').register({ id: 'd', mount() {} })
  plain.forModule('m').open('d')
  assert.equal(await plain.requestClose(), true)
}

// (5) mount cleanup is called exactly once; a function or { unmount() }; the element is emptied
{
  const svc = make()
  const m = svc.forModule('m')
  let cleaned = 0
  const el = fakeEl()
  m.register({ id: 'd', mount(element) { element.textContent = 'content'; return () => { cleaned += 1 } } })
  const done = m.open('d')
  svc.mountCurrent(el)
  await flush()
  assert.equal(svc.state.current.status, 'open')
  assert.equal(await svc.requestClose(), true)
  await done
  assert.equal(cleaned, 1, 'cleanup called once on close')
  assert.equal(el.textContent, '', 'the element is emptied after close')
  svc.closeAll()
  assert.equal(cleaned, 1, 'a second close does not call it again')

  let unmounted = 0
  const svc2 = make()
  const m2 = svc2.forModule('m')
  m2.register({ id: 'u', mount() { return { unmount() { unmounted += 1 } } } })
  m2.open('u')
  svc2.mountCurrent(fakeEl())
  await flush()
  svc2.closeAll()
  assert.equal(unmounted, 1, 'an object with unmount() is cleaned up once')
}

// (6) mount that throws or rejects shows a plain error line, never a blank panel; an element is cleared
{
  const svc = make()
  const m = svc.forModule('m')
  m.register({ id: 'd', mount() { throw new Error('secret detail') } })
  const p = m.open('d')
  const el = fakeEl()
  el.textContent = 'partial'
  svc.mountCurrent(el)
  await flush()
  assert.equal(svc.state.current.status, 'failed')
  assert.equal(svc.state.current.error, 'This dialog could not be shown.', 'the error line is plain and does not repeat the module error')
  assert.equal(el.textContent, '', 'the element is cleared')
  assert.equal(await svc.requestClose(), true, 'a failed dialog closes at once')
  await p
  assert.ok(warnings.some((w) => w.includes('failed to open') && w.includes('secret detail')), 'the cause goes to the console, not the panel')

  const rej = make()
  rej.forModule('m').register({ id: 'r', mount: async () => { throw new Error('rejected') } })
  rej.forModule('m').open('r')
  rej.mountCurrent(fakeEl())
  await flush()
  assert.equal(rej.state.current.status, 'failed')
}

// (7) time limit: a mount that has not finished within the limit shows the error line; a late result is cleaned up at once
{
  const realSet = globalThis.setTimeout
  const realClear = globalThis.clearTimeout
  const pending = []
  globalThis.setTimeout = (fn, ms) => { pending.push({ fn, ms }); return pending.length }
  globalThis.clearTimeout = () => {}
  try {
    const svc = make({ timeoutSeconds: () => 5 })
    const m = svc.forModule('m')
    let cleaned = 0
    let release
    m.register({ id: 'slow', mount() { return new Promise((resolve) => { release = resolve }) } })
    m.open('slow')
    const el = fakeEl()
    svc.mountCurrent(el)
    const timer = pending.find((t) => t.ms === 5000)
    assert.ok(timer, 'the limit is the register() limit in seconds (5)')
    timer.fn()
    assert.equal(svc.state.current.status, 'failed')
    assert.equal(svc.state.current.error, 'This dialog did not open within 5 seconds.')
    release(() => { cleaned += 1 })
    for (let i = 0; i < 5; i += 1) await Promise.resolve()
    assert.equal(cleaned, 1, 'a late result is cleaned up at once')
    assert.equal(svc.state.current.status, 'failed', 'a late result does not revive the dialog')
    await svc.requestClose()

    // the default limit is 30 seconds when the context sends none
    const def = make({ timeoutSeconds: () => undefined })
    def.forModule('m').register({ id: 'd', mount() { return new Promise(() => {}) } })
    def.forModule('m').open('d')
    pending.length = 0
    def.mountCurrent(fakeEl())
    assert.ok(pending.some((t) => t.ms === 30000), 'the default limit is 30 seconds')
    assert.equal(dialogTimeoutMs(4), 30000)
    assert.equal(dialogTimeoutMs(301), 30000)
    assert.equal(dialogTimeoutMs(60), 60000)
  } finally {
    globalThis.setTimeout = realSet
    globalThis.clearTimeout = realClear
  }
}

// (8) a late result after close is cleaned up at once
{
  const svc = make()
  const m = svc.forModule('m')
  let cleaned = 0
  let release
  m.register({ id: 'd', mount() { return new Promise((resolve) => { release = resolve }) } })
  const p = m.open('d')
  svc.mountCurrent(fakeEl())
  await svc.requestClose()
  await p
  release(() => { cleaned += 1 })
  await flush()
  assert.equal(cleaned, 1)
}

// (9) sign-out, an invalid session and leaving the page close at once, without beforeClose()
{
  const svc = make()
  const m = svc.forModule('m')
  let asked = 0
  m.register({ id: 'd', mount() {}, beforeClose() { asked += 1; return false } })
  const p = m.open('d')
  svc.closeAll()
  await p
  assert.equal(svc.isOpen(), false)
  assert.equal(asked, 0, 'beforeClose is not asked at sign-out')
}

// (10) unloading the module closes its dialog and drops its registrations; the loader binds per module and does not leak the service
{
  const svc = make()
  const runtime = {
    state: { context: { permissions: [], module_register_timeout_seconds: 5 }, contextSource: 'backend' },
    router: { addRoute() {}, getRoutes: () => [], currentRoute: { value: { path: '/' } } },
    addNavigation() {},
    removeNavigation() {},
    dialogs: svc,
  }
  const entry = `data:text/javascript;base64,${Buffer.from(`
    export default {
      register(context) {
        globalThis.__dialogCtx = context
        context.dialogs.register({ id: 'd', title: 'Dialog', mount(el) { el.textContent = 'hi'; return () => {} } })
      },
    }
  `).toString('base64')}`
  const result = await loadUiModules(runtime, [{ id: 'm', entry, permissions: [] }])
  assert.deepEqual(result.failed, [], 'the module registers')
  const seen = globalThis.__dialogCtx
  assert.equal(typeof seen.dialogs.open, 'function')
  assert.equal(seen.dialogs.forModule, undefined, 'the shared service is not handed to the module')
  assert.equal(svc.isRegistered('m.d'), true)
  assert.equal(svc.state.current, null, 'the module has opened nothing yet')
  const opened = seen.dialogs.open('d')
  assert.equal(svc.state.current.id, 'm.d')
  assert.equal(unloadUiModule(runtime, 'm'), true, 'unloading a loaded module reports it')
  assert.equal(svc.isOpen(), false, 'unloading closes the open dialog')
  assert.equal(svc.isRegistered('m.d'), false)
  await opened
  await assert.rejects(seen.dialogs.open('d'), refusedOk, 'the unloaded module cannot open again')
}

// (11) the layer order in styles.css: host 1100, unsaved above the host (1300), the confirm 1400 above both, toasts 1200
{
  const css = read('../src/styles.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const zFor = (selector) => {
    const blocks = [...css.matchAll(new RegExp(`([^{}]*)\\{([^{}]*)\\}`, 'g'))]
    const matched = blocks.filter(([, sel]) => sel.split(',').map((s) => s.trim()).includes(selector))
    const values = matched.flatMap(([, , body]) => [...body.matchAll(/(?:^|;)z-index:(-?\d+)/g)].map((m) => Number(m[1])))
    return values.at(-1)
  }
  assert.equal(zFor('.modal-backdrop.module-dialog-backdrop'), 1100)
  assert.equal(zFor('.modal-backdrop.unsaved-backdrop'), 1300)
  assert.equal(zFor('.confirm-backdrop'), 1400)
  assert.equal(zFor('.toast-stack'), 1200)
  assert.equal(zFor('.quick-actions-backdrop'), 1100, 'the host is in Quick Actions layer')
  assert.ok(zFor('.modal-backdrop.unsaved-backdrop') > zFor('.modal-backdrop.module-dialog-backdrop'))
  assert.ok(zFor('.confirm-backdrop') > zFor('.modal-backdrop.unsaved-backdrop'))
  assert.ok(zFor('.toast-stack') > zFor('.modal-backdrop.module-dialog-backdrop'))
  assert.ok(zFor('.module-dialog-panel') === undefined, 'no z-index on the panel itself')
  // no new palette: the host uses existing tokens and no hex colour
  const hostRules = css.slice(css.indexOf('.modal-backdrop.module-dialog-backdrop'))
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(hostRules), 'no hex colour in the 0.12.112 block')
  assert.ok(!/font[^;}]*\d+px/.test(hostRules), 'no raw px font size in the 0.12.112 block')
}

// (12) App.vue: the host is mounted only outside the popup layout, and Escape does not close the shell layers under a module dialog
{
  const app = read('../src/App.vue')
  assert.ok(app.includes('<ModuleDialogHost v-if="!popupLayout" />'))
  assert.ok(app.includes("inject('tecTacModuleDialogs', null)"))
  assert.ok(/function handleGlobalKey\(event\)\s*\{[\s\S]*?if \(moduleDialogs\?\.isOpen\?\.\(\)\) return[\s\S]*?quickActionsOpen\.value = false/.test(app), 'the Escape handler returns before closing Quick Actions while a module dialog is open')
  const host = read('../src/components/ModuleDialogHost.vue')
  assert.ok(!host.includes('v-html'), 'the host never uses v-html')
  assert.ok(host.includes('stopImmediatePropagation'), 'the host stops Escape before the shell')
  assert.ok(host.includes('shellLayerAbove'), 'the host yields to the confirm and the unsaved prompt')
  assert.ok(host.includes('{{ current.title }}') && host.includes('{{ current.error }}') && host.includes('{{ current.moduleId }}'))
  const unsaved = read('../src/components/UnsavedChangesDialog.vue')
  assert.ok(unsaved.includes('modal-backdrop unsaved-backdrop'))
}

// (13) the documents name the row and the limits; the runtime page carries one note for the row
{
  const doc = read('../docs/module-dialogs.md')
  assert.ok(doc.startsWith('# Module dialogs'))
  for (const needle of ['ui.authenticated.dialogs', 'context.dialogs.open', 'context.dialogs.register', 'beforeClose', 'one dialog at a time', 'modal-wide', '1100', 'popup', 'context.module_register_timeout_seconds', '1.17.50-0.12.115']) {
    assert.ok(doc.includes(needle), `the dialog doc names ${needle}`)
  }
  const api = read('../docs/module-runtime-api.md')
  const notes = api.split('\n').filter((line) => line.startsWith('**Contract row (UI 0.12.112, listed in the public contract export from 1.17.50-0.12.115).** Browser contract row `ui.authenticated.dialogs`'))
  assert.equal(notes.length, 1, 'one dialogs contract-row note in the runtime page')
  assert.ok(notes[0].includes('Core lists it in the public contract export from 1.17.50-0.12.115'))
  assert.ok(!notes[0].includes('does not claim the export lists it'))
  assert.ok(api.includes('## Module dialogs (dialogs)'), 'the runtime page has a section for the dialogs')
}

// (14) open({ id, title, size, mount }) with a descriptor opens it without a prior register, bound to the caller; a row menu sits above the dialog;
// and no module in modules/ is given a key it did not ask for (no module reads context.dialogs or context.signInLanding today)
{
  const svc = make()
  const m = svc.forModule('m')
  const opened = m.open({ id: 'inline', title: 'Inline', size: 'wide', mount() {} })
  assert.equal(svc.state.current.id, 'm.inline')
  assert.equal(svc.isRegistered('m.inline'), false, 'an inline descriptor is not kept as a registration')
  await svc.requestClose()
  await opened
  const css = read('../src/styles.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const z = (selector) => [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter(([, sel]) => sel.split(',').map((x) => x.trim()).includes(selector)).flatMap(([, , body]) => [...body.matchAll(/(?:^|;)z-index:(-?\d+)/g)].map((x) => Number(x[1]))).at(-1)
  assert.ok(z('.resource-menu.row-menu-layer') > z('.modal-backdrop.module-dialog-backdrop'), 'the row menu is above the module dialog')
  assert.equal(z('.resource-menu'), 1000, 'the existing resource menu keeps its layer')

  const modulesRoot = new URL('../../../modules/', import.meta.url)
  if (fs.existsSync(modulesRoot)) {
    const offenders = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
        if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full) }
        else if (/\.m?js$/.test(entry.name) && dir.pathname.includes('/ui/')) {
          const text = fs.readFileSync(full, 'utf8')
          if (/(?:ctx|context)\??\.(?:dialogs|signInLanding|rowMenu)/.test(text)) offenders.push(full.pathname)
        }
      }
    }
    walk(modulesRoot)
    assert.deepEqual(offenders, [], 'no module reads context.dialogs, context.signInLanding or context.rowMenu yet')
  }
}

console.log('module-dialogs-0.12.112: PASS')
