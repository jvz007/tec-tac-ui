// 0.12.116: FilterEditor is published on ui.authenticated.components, bound per module (like modulePreferences). Two modules get two
// different components, each reading only its own id; no module id prop exists; frozen all the way down; the six existing members are
// the same objects as before; signed out, abandoned and unloaded modules are refused with no request; registerPublic gets no
// components; the path guard does not refuse the filter routes.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { FIELDS, button, click, fakeApi, find, flush, mountComponent, textOf } from './fixtures/filter-editor-harness.mjs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const sc = await import(new URL('../src/shared-components.js', import.meta.url).href)
const { createFilterEditorService } = await import(new URL('../src/filter-editor.js', import.meta.url).href)

assert.deepEqual(Object.keys(sc.sharedComponents), ['SearchSelect', 'TagEditor', 'DataTable', 'FormRow', 'EditorWindow', 'Stepper'], 'sharedComponents stays six members')

const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const loaderSource = read('../src/module-loader.js').replace("import * as Vue from 'vue'", 'const Vue = {}')
const loader = await import(`data:text/javascript;base64,${Buffer.from(loaderSource).toString('base64')}`)

const api = fakeApi({ fields: FIELDS, sets: (c) => (c.options.method === 'POST' ? { id: '11111111-2222-4333-8444-555555555555', name: 'N', definition: JSON.parse(c.options.body).definition, shared: false, mine: true, can_edit: true, owner: { id: 9, username: 'me' } } : { filter_sets: [] }), values: { values: [], has_more: false } })
const asked = []
let signedOut = false
const runtime = {
  app: {},
  router: { currentRoute: { value: { path: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} },
  state: { context: { permissions: [], user: { superuser: true, id: 9 } }, contextSource: 'backend' },
  addNavigation() {},
  removeNavigation() {},
  api,
  confirm: (options, by) => { asked.push({ options, by }); return Promise.resolve(true) },
  isSignedOut: () => signedOut,
  components: sc.sharedComponents,
  filterEditor: createFilterEditorService(),
  publicApi: async () => ({}),
}
const grab = (id) => entry(`export default { register(ctx) { (globalThis.__fe ||= {})['${id}'] = ctx } }`)
const loaded = await loader.loadUiModules(runtime, [
  { id: 'alpha', entry: grab('alpha'), permissions: [], allowed: true },
  { id: 'beta', entry: grab('beta'), permissions: [], allowed: true },
], { timeoutMs: 500 })
assert.deepEqual(loaded.loaded, ['alpha', 'beta'])
const A = globalThis.__fe.alpha
const B = globalThis.__fe.beta

// each module gets its own FilterEditor, the six others unchanged
assert.equal(typeof A.components.FilterEditor, 'object')
assert.notEqual(A.components.FilterEditor, B.components.FilterEditor, 'two modules, two components')
assert.notEqual(A.components, B.components)
for (const name of Object.keys(sc.sharedComponents)) {
  assert.equal(A.components[name], sc.sharedComponents[name], `${name} is the same object as before`)
  assert.equal(B.components[name], sc.sharedComponents[name])
}
assert.deepEqual(Object.keys(A.components), [...Object.keys(sc.sharedComponents), 'FilterEditor'])
assert.equal('filterEditor' in A, false, 'the factory itself is not handed to a module')

// frozen all the way down
assert.equal(Object.isFrozen(A.components), true)
assert.equal(Object.isFrozen(A.components.FilterEditor), true)
assert.equal(Object.isFrozen(A.components.FilterEditor.props), true)
assert.equal(Object.isFrozen(A.components.FilterEditor.props.viewKey), true)
assert.throws(() => { A.components.FilterEditor = null }, TypeError)
assert.throws(() => { A.components.FilterEditor.name = 'x' }, TypeError)
assert.throws(() => { A.components.FilterEditor.props.moduleId = { type: String } }, TypeError)
assert.deepEqual(Object.keys(A.components.FilterEditor.props), ['viewKey', 'modelValue', 'disabled'], 'no module id prop')

// each calls only its own id, even when a module id prop is passed
const mountedA = await mountComponent(A.components.FilterEditor, { viewKey: 'agents', moduleId: 'beta', module: 'beta', module_id: 'beta' })
const mountedB = await mountComponent(B.components.FilterEditor, { viewKey: 'agents' })
const urls = api.calls.map((c) => c.path)
assert.deepEqual(urls, [
  '/api/tfd/filter-sets/fields/?module=alpha',
  '/api/tfd/filter-sets/?module=alpha&view_key=agents',
  '/api/tfd/filter-sets/fields/?module=beta',
  '/api/tfd/filter-sets/?module=beta&view_key=agents',
])
assert.equal(urls.some((u) => u.includes('module=beta') && urls.indexOf(u) < 2), false, 'alpha never named beta')

// the person's own user id comes from the runtime context; confirm is the module-bound one
{
  const model = { version: 1, match: 'all', rules: [{ kind: 'rule', field: 'hostname', operator: 'contains', value: 'SRV' }] }
  const m = await mountComponent(A.components.FilterEditor, { viewKey: 'agents', modelValue: model })
  click(button(m.root, 'Save as new set'))
  await flush()
  find(m.root, (n) => n.tag === 'input' && String(n.props.id || '').endsWith('-name'))[0].props.onInput({ target: { value: 'N' } })
  await flush()
  find(m.root, (n) => n.tag === 'form')[0].props.onSubmit({ preventDefault() {} })
  await flush()
  const post = api.calls.find((c) => c.options.method === 'POST')
  assert.deepEqual(JSON.parse(post.options.body).readers, [9], 'Only me is the signed-in id from the context')
  assert.equal(JSON.parse(post.options.body).module_id, 'alpha', 'the module id is the loader\'s')
  click(button(m.root, 'Delete'))
  await flush()
  assert.equal(asked.length, 1)
  assert.equal(asked[0].by, 'alpha', 'the shell\'s Asked-by line names the module')
  m.unmount()
}
mountedA.unmount()
mountedB.unmount()

// signed out: 401 signed_out, no request
{
  signedOut = true
  const before = api.calls.length
  const m = await mountComponent(A.components.FilterEditor, { viewKey: 'agents' })
  assert.equal(api.calls.length, before, 'no request while signed out')
  assert.match(textOf(m.root), /signed out/i)
  m.unmount()
  signedOut = false
}

// unloaded: later calls are refused, and a pending request is aborted
{
  const pending = []
  const slow = fakeApi({ fields: () => new Promise((resolve) => { pending.push(resolve) }) })
  const rt = { ...runtime, api: slow, filterEditor: createFilterEditorService() }
  const r = await loader.loadUiModules(rt, [{ id: 'gamma', entry: grab('gamma'), permissions: [], allowed: true }], { timeoutMs: 500 })
  assert.deepEqual(r.loaded, ['gamma'])
  const G = globalThis.__fe.gamma
  const m = await mountComponent(G.components.FilterEditor, { viewKey: 'agents' })
  assert.equal(slow.calls.length, 1)
  assert.equal(slow.calls[0].options.signal.aborted, false)
  loader.unloadUiModule(rt, 'gamma')
  assert.equal(slow.calls[0].options.signal.aborted, true, 'the request in flight is aborted on unload')
  m.unmount()
  const after = await mountComponent(G.components.FilterEditor, { viewKey: 'agents' })
  assert.equal(slow.calls.length, 1, 'no request after unload')
  assert.match(textOf(after.root), /unloaded/)
  after.unmount()
}

// abandoned (register ran past its budget): refused
{
  const quiet = fakeApi({ fields: FIELDS, sets: { filter_sets: [] } })
  const rt = { ...runtime, api: quiet, filterEditor: createFilterEditorService() }
  const slowEntry = entry('export default { register(ctx) { (globalThis.__fe ||= {}).slow = ctx; return new Promise(() => {}) } }')
  const r = await loader.loadUiModules(rt, [{ id: 'slow', entry: slowEntry, permissions: [], allowed: true }], { timeoutMs: 50 })
  assert.equal(r.failed.length, 1, 'register timed out')
  const m = await mountComponent(globalThis.__fe.slow.components.FilterEditor, { viewKey: 'agents' })
  assert.equal(quiet.calls.length, 0, 'an abandoned module makes no request')
  assert.match(textOf(m.root), /abandoned|unloaded/)
  m.unmount()
}

// the factory needs the module's api, and the id is never an argument of the editor
assert.throws(() => createFilterEditorService().forModule('x', {}), /api helper/)

// registerPublic gets no components
const publicEntry = entry('export default { registerPublic(ctx) { globalThis.__pub = Object.keys(ctx) } }')
const publicLoaded = await loader.loadPublicUiModules(runtime, [{ id: 'pubmod', public: { entry: publicEntry, base_path: '/public/pubmod' } }])
assert.deepEqual(publicLoaded.loaded, ['pubmod'])
assert.equal(globalThis.__pub.includes('components'), false, 'registerPublic still gets no components')
assert.equal(globalThis.__pub.includes('filterEditor'), false)

// the path guard does not refuse the filter routes (Core checks module access)
for (const path of [
  '/api/tfd/filter-sets/fields/?module=alpha',
  '/api/tfd/filter-sets/?module=alpha&view_key=agents',
  '/api/tfd/filter-sets/11111111-2222-4333-8444-555555555555/',
  '/api/tfd/filter-values/?module=alpha&field=hostname&search=a&page=2',
]) assert.doesNotThrow(() => loader.guardTacticalOperationPath(path, 'alpha', ''), path)
const guarded = read('../src/module-loader.js')
assert.doesNotMatch(guarded.slice(guarded.indexOf('export function guardTacticalOperationPath'), guarded.indexOf('function runtimeSignedOut')), /filter-sets|filter-values/, 'the guard does not name the filter routes')

console.log('filter-editor-binding-0.12.116: PASS')
