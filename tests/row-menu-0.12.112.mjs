// 0.12.112: the shell row menu for module tables (context.rowMenu, UI Q71). The item rules and limits, plain text, the per-module
// binding and unload, one menu at a time, the refusals, run() containment, the keyboard anchor, the layer order, the Vue pieces
// and the documents. registerPublic gets no rowMenu.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { createRowMenuService, normalizeRowMenuItems, cleanMenuText, ROW_MENU_LIMITS } = await import(new URL('../src/row-menu.js', import.meta.url).href)
const { menuAnchor } = await import(new URL('../src/resource-context-menu.js', import.meta.url).href)

const loaderSource = read('../src/module-loader.js').replace("import * as Vue from 'vue'", 'const Vue = {}')
const { loadUiModules, loadPublicUiModules, unloadUiModule } = await import(`data:text/javascript;base64,${Buffer.from(loaderSource).toString('base64')}`)

const warnings = []
const warn = (...args) => { warnings.push(args.map((a) => String(a?.message || a)).join(' ')) }
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const make = (over = {}) => createRowMenuService({ isPopup: () => false, isSignedOut: () => false, isTrustedContext: () => true, warn, ...over })
const refusedOk = (error) => error && error.status === 0 && error.code === null
const item = (id, extra = {}) => ({ id, label: id.toUpperCase(), run() {}, ...extra })

// (1) item limits and clean text
{
  assert.equal(ROW_MENU_LIMITS.maxItems, 40)
  const forty = Array.from({ length: 40 }, (_, i) => item(`i${i}`))
  assert.equal(normalizeRowMenuItems(forty).length, 40, 'forty items are fine')
  assert.throws(() => normalizeRowMenuItems([...forty, item('i40')]), TypeError, 'forty-one are refused')
  assert.throws(() => normalizeRowMenuItems([]), TypeError)
  assert.throws(() => normalizeRowMenuItems(undefined), TypeError)
  assert.throws(() => normalizeRowMenuItems(['x']), TypeError, 'an item must be an object')
  assert.throws(() => normalizeRowMenuItems([item('a'), item('a')]), TypeError, 'a repeated id')
  assert.throws(() => normalizeRowMenuItems([{ label: 'x', run() {} }]), TypeError, 'an id is required')
  assert.throws(() => normalizeRowMenuItems([{ id: 'a b', label: 'x', run() {} }]), TypeError, 'a bad id')
  assert.throws(() => normalizeRowMenuItems([{ id: 'a', run() {} }]), TypeError, 'a label is required')
  assert.throws(() => normalizeRowMenuItems([{ id: 'a', label: '   ', run() {} }]), TypeError, 'a blank label')
  assert.throws(() => normalizeRowMenuItems([{ id: 'a', label: 'x' }]), TypeError, 'an enabled item needs run')
  const [off] = normalizeRowMenuItems([{ id: 'a', label: 'x', disabled: true }])
  assert.equal(off.disabled, true)
  assert.equal(off.reason, 'Unavailable for this selection.', 'a disabled item gets a default reason')
  assert.equal(off.run, null)
  const [withReason] = normalizeRowMenuItems([{ id: 'a', label: 'x', disabled: true, reason: 'The agent is offline.' }])
  assert.equal(withReason.reason, 'The agent is offline.')
  const [on] = normalizeRowMenuItems([{ id: 'a', label: 'x', reason: 'ignored while enabled', danger: true, hint: 'Del', run() {} }])
  assert.equal(on.reason, '', 'a reason shows only on a disabled item')
  assert.equal(on.danger, true)
  assert.equal(on.hint, 'Del')
  // text is plain: markup is kept as typed, junk characters become a space, long text is cut
  assert.equal(cleanMenuText('Hi <b>there</b>', 80), 'Hi <b>there</b>')
  assert.equal(cleanMenuText('a​\nb\u0007  c', 80), 'a b c')
  assert.equal(cleanMenuText(5, 80), '')
  assert.equal(cleanMenuText('x'.repeat(200), 80).length, 80)
  assert.equal(normalizeRowMenuItems([{ id: 'a', label: 'x'.repeat(200), hint: 'h'.repeat(300), run() {} }])[0].hint.length, 120)
}

// (2) open, entries without run, choose runs once and closes first, a disabled item and a stale token do nothing
{
  const svc = make()
  const m = svc.forModule('m')
  const calls = []
  assert.equal(m.open({ event: { clientX: 40, clientY: 50 }, label: 'Row <i>', items: [item('a', { run: () => calls.push(svc.isOpen()) }), item('b', { disabled: true, reason: 'No.' })] }), true)
  const cur = svc.state.current
  assert.equal(cur.moduleId, 'm')
  assert.deepEqual([cur.x, cur.y], [40, 50])
  assert.equal(cur.label, 'Row <i>', 'the label is text')
  assert.deepEqual(cur.entries.map((e) => e.id), ['a', 'b'])
  assert.ok(cur.entries.every((e) => !('run' in e)), 'run() never reaches the host')
  assert.equal(svc.choose(cur.token + 99, 'a'), false, 'a stale token does nothing')
  assert.equal(svc.choose(cur.token, 'b'), false, 'a disabled item does nothing')
  assert.equal(svc.isOpen(), true)
  assert.equal(svc.choose(cur.token, 'zzz'), false)
  assert.equal(svc.choose(cur.token, 'a'), true)
  assert.deepEqual(calls, [false], 'the menu is closed before run() is called')
  assert.equal(svc.state.current, null)
  assert.equal(svc.choose(cur.token, 'a'), false, 'a second choice does nothing')
  assert.deepEqual(calls, [false], 'run() is called once')
  m.open({ event: {}, items: [item('a')] })
  assert.equal(svc.state.current.label, 'Actions', 'the default label')
}

// (3) one menu at a time: a second open replaces the first, and close(token) ignores a stale token
{
  const svc = make()
  const m = svc.forModule('m')
  m.open({ event: { clientX: 1, clientY: 1 }, items: [item('a')] })
  const first = svc.state.current.token
  m.open({ event: { clientX: 2, clientY: 2 }, items: [item('b')] })
  assert.notEqual(svc.state.current.token, first)
  assert.deepEqual(svc.state.current.entries.map((e) => e.id), ['b'])
  svc.close(first)
  assert.equal(svc.isOpen(), true, 'a stale close does nothing')
  svc.close(svc.state.current.token)
  assert.equal(svc.isOpen(), false)
}

// (4) run() errors are contained and warned; a rejected promise too
{
  warnings.length = 0
  const svc = make()
  const m = svc.forModule('m')
  m.open({ event: {}, items: [item('boom', { run: () => { throw new Error('bang') } })] })
  assert.doesNotThrow(() => svc.choose(svc.state.current.token, 'boom'))
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /module m row menu item boom failed/)
  m.open({ event: {}, items: [item('late', { run: () => Promise.reject(new Error('later')) })] })
  svc.choose(svc.state.current.token, 'late')
  await flush()
  assert.equal(warnings.length, 2)
}

// (5) refusals: popup, signed out, untrusted, abandoned, bad arguments
{
  const args = { event: {}, items: [item('a')] }
  assert.throws(() => make({ isPopup: () => true }).forModule('m').open(args), refusedOk)
  assert.throws(() => make({ isSignedOut: () => true }).forModule('m').open(args), refusedOk)
  assert.throws(() => make({ isTrustedContext: () => false }).forModule('m').open(args), refusedOk)
  let abandoned = false
  const svc = make()
  const m = svc.forModule('m', { isAbandoned: () => abandoned })
  assert.equal(m.open(args), true)
  abandoned = true
  assert.throws(() => m.open(args), refusedOk, 'refused after the module is abandoned')
  assert.throws(() => svc.forModule('m').open(), TypeError)
  assert.throws(() => svc.forModule('m').open({ event: {} }), TypeError)
  assert.throws(() => svc.forModule('bad id'), Error)
  assert.equal(svc.isOpen(), true, 'a refused open leaves the open menu alone')
  svc.closeAll()
  assert.equal(svc.isOpen(), false, 'sign-out closes it')
}

// (6) clear() and removeProvider close only the module's own menu; no item runs after unload
{
  const svc = make()
  const a = svc.forModule('a')
  const b = svc.forModule('b')
  let ran = 0
  a.open({ event: {}, items: [item('x', { run: () => { ran += 1 } })] })
  const token = svc.state.current.token
  b.clear()
  assert.equal(svc.isOpen(), true, 'another module unloading does not close this menu')
  a.clear()
  assert.equal(svc.isOpen(), false)
  assert.equal(svc.choose(token, 'x'), false)
  assert.equal(ran, 0, 'no item runs after the module is unloaded')
  assert.throws(() => a.open({ event: {}, items: [item('x')] }), refusedOk)
}

// (7) the keyboard opens under the focused row; a mouse opens at the pointer; the key gives no pointer position
{
  const svc = make()
  const m = svc.forModule('m')
  const row = { focus() {}, getBoundingClientRect: () => ({ left: 100, bottom: 240 }) }
  m.open({ event: { key: 'ContextMenu', clientX: 0, clientY: 0 }, element: row, items: [item('a')] })
  assert.deepEqual([svc.state.current.x, svc.state.current.y], [116, 240], 'under the row')
  assert.deepEqual(menuAnchor({ clientX: 12, clientY: 34 }, row), { x: 12, y: 34 })
  assert.equal(svc.state.current.opener, row, 'focus returns to the row')
}

// (8) shouldHandle leaves a text field to the browser
{
  const m = make().forModule('m')
  const field = (match) => ({ target: { closest: (selector) => (match ? { selector } : null) } })
  assert.equal(m.shouldHandle(field(true)), false, 'a text field keeps the browser menu')
  assert.equal(m.shouldHandle(field(false)), true)
  assert.equal(m.shouldHandle({}), true)
  assert.equal(m.shouldHandle(undefined), true)
}

// (9) the loader binds per module, closes on unload, and registerPublic gets no rowMenu
{
  const svc = make()
  const runtime = {
    state: { context: { permissions: [], module_register_timeout_seconds: 5 }, contextSource: 'backend' },
    router: { addRoute() {}, getRoutes: () => [], currentRoute: { value: { path: '/' } } },
    addNavigation() {},
    removeNavigation() {},
    rowMenu: svc,
  }
  const entry = `data:text/javascript;base64,${Buffer.from(`
    export default { register(context) { globalThis.__rowMenuCtx = context } }
  `).toString('base64')}`
  const result = await loadUiModules(runtime, [{ id: 'm', entry, permissions: [] }])
  assert.deepEqual(result.failed, [])
  const seen = globalThis.__rowMenuCtx
  assert.equal(typeof seen.rowMenu.open, 'function')
  assert.equal(typeof seen.rowMenu.shouldHandle, 'function')
  assert.equal(seen.rowMenu.forModule, undefined, 'the shared service is not handed to the module')
  assert.equal(seen.rowMenu.choose, undefined)
  assert.equal(seen.rowMenu.state, undefined)
  seen.rowMenu.open({ event: {}, items: [item('a')] })
  assert.equal(svc.state.current.moduleId, 'm')
  assert.equal(unloadUiModule(runtime, 'm'), true)
  assert.equal(svc.isOpen(), false, 'unloading closes the menu')
  assert.throws(() => seen.rowMenu.open({ event: {}, items: [item('a')] }), refusedOk)

  // a module that failed to register: everything it was given is refused
  const failing = `data:text/javascript;base64,${Buffer.from(`
    export default { register(context) { globalThis.__failCtx = context; throw new Error('nope') } }
  `).toString('base64')}`
  const failed = await loadUiModules(runtime, [{ id: 'f', entry: failing, permissions: [] }])
  assert.equal(failed.failed.length, 1)
  assert.throws(() => globalThis.__failCtx.rowMenu.open({ event: {}, items: [item('a')] }), refusedOk)

  const publicEntry = `data:text/javascript;base64,${Buffer.from(`
    export default { registerPublic(context) { globalThis.__publicKeys = Object.keys(context) } }
  `).toString('base64')}`
  const publicRuntime = { router: { addRoute() {}, getRoutes: () => [], currentRoute: { value: { path: '/' } } }, rowMenu: svc, dialogs: svc, app: {}, publicApi: {}, ssoProviders: { forModule: () => ({ clear() {} }) } }
  await loadPublicUiModules(publicRuntime, [{ id: 'p', public: { entry: publicEntry, base_path: '/public/p' } }])
  assert.ok(Array.isArray(globalThis.__publicKeys), 'the public module registered')
  assert.ok(!globalThis.__publicKeys.includes('rowMenu'), 'registerPublic gets no rowMenu')
}

// (10) the layer order: 1150 above the module dialog (1100), under toasts (1200), unsaved (1300) and the confirm (1400); .resource-menu stays 1000
{
  const css = read('../src/styles.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const z = (selector) => [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
    .filter(([, sel]) => sel.split(',').map((x) => x.trim()).includes(selector))
    .flatMap(([, , body]) => [...body.matchAll(/(?:^|;)z-index:(-?\d+)/g)].map((x) => Number(x[1]))).at(-1)
  assert.equal(z('.resource-menu.row-menu-layer'), 1150)
  assert.equal(z('.resource-menu'), 1000, 'the existing menu is unchanged')
  assert.ok(z('.resource-menu.row-menu-layer') > z('.modal-backdrop.module-dialog-backdrop'), 'above a module dialog')
  assert.ok(z('.resource-menu.row-menu-layer') < z('.toast-stack'), 'under toasts')
  assert.ok(z('.resource-menu.row-menu-layer') < z('.modal-backdrop.unsaved-backdrop'), 'under the unsaved prompt')
  assert.ok(z('.resource-menu.row-menu-layer') < z('.confirm-backdrop'), 'under the confirm')
  const block = css.slice(css.indexOf('.resource-menu.row-menu-layer'))
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(block.split('\n')[0]), 'no hex colour in the new rule')
}

// (11) the Vue pieces: the host wraps the shell menu, text only, mounted outside the popup layout; hint is additive
{
  const host = read('../src/components/RowMenuHost.vue')
  assert.ok(host.includes('<ResourceContextMenu') && host.includes('layer="module"'))
  assert.ok(!host.includes('v-html'))
  assert.ok(host.includes("inject('tecTacRowMenu', null)"))
  const menu = read('../src/components/ResourceContextMenu.vue')
  assert.ok(!menu.includes('v-html'))
  assert.ok(menu.includes('{{ entry.hint }}'), 'the hint is a text node')
  assert.ok(menu.includes("layer: { type: String, default: '' }"), 'the layer prop is optional')
  const app = read('../src/App.vue')
  assert.ok(app.includes('<RowMenuHost v-if="!popupLayout" />'))
  const main = read('../src/main.js')
  assert.ok(main.includes("app.provide('tecTacRowMenu', rowMenu)"))
  assert.ok(/watch\(\(\) => state\.status[\s\S]*?rowMenu\.closeAll\(\)/.test(main), 'sign-out closes the menu')
  assert.ok(main.includes("window.addEventListener('pagehide', () => rowMenu.closeAll())"))
  const publicStart = loaderSource.indexOf('export async function loadPublicUiModules')
  const publicEnd = loaderSource.indexOf('export async function loadUiModules')
  assert.ok(!loaderSource.slice(publicStart, publicEnd).includes('rowMenu'), 'the public loader never mentions rowMenu')
  const clients = read('../src/views/ResourcesView.vue')
  assert.ok(!clients.includes('layer="module"'), 'the Clients and Sites menu keeps its own layer')
}

// (12) nothing in modules/ changes: no module reads context.rowMenu yet, and Checks keeps its private menu
{
  const modulesRoot = new URL('../../../modules/', import.meta.url)
  if (fs.existsSync(modulesRoot)) {
    const offenders = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
        if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full) }
        else if (/\.m?js$/.test(entry.name) && dir.pathname.includes('/ui/') && /\b(?:ctx|context)\??\.rowMenu\b/.test(fs.readFileSync(full, 'utf8'))) offenders.push(full.pathname)
      }
    }
    walk(modulesRoot)
    assert.deepEqual(offenders, [])
  }
}

// (13) the documents
{
  const doc = read('../docs/module-row-menu.md')
  assert.ok(doc.startsWith('# Module row menu'))
  for (const needle of ['ui.authenticated.rowMenu', 'rowMenu.open', 'shouldHandle', 'not yet in the export', '1150', '40', 'registerPublic', 'hint', 'reason', 'Shift+F10', 'plain text', 'AD-12']) {
    assert.ok(doc.includes(needle), `the row menu doc names ${needle}`)
  }
  const api = read('../docs/module-runtime-api.md')
  assert.ok(api.includes('## Row menu (rowMenu)'))
  const notes = api.split('\n').filter((line) => line.startsWith('**Contract row (UI 0.12.112, not yet in the export).** Browser contract row `ui.authenticated.rowMenu`'))
  assert.equal(notes.length, 1)
  assert.ok(notes[0].includes('does not claim the export lists it'))
}

console.log('row-menu-0.12.112: PASS')
