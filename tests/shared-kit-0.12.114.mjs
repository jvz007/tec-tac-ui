// 0.12.114: the shared component kit (DataTable P1, EditorWindow P2, FormRow P3, Stepper P5). The pure rules in node, each component
// rendered to a string for roles and aria, and driven through a minimal renderer for the events (sort, select, rowmenu, activate,
// save, close, discard, step select). Cell text is always text. sharedComponents is frozen with six members. The CSS holds every
// kit class and no raw pixel font size. registerPublic gets no components.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRenderer, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const logic = await import(new URL('../src/shared-kit-logic.js', import.meta.url).href)
const kit = await import(new URL('../src/shared-kit.js', import.meta.url).href)
const shared = await import(new URL('../src/shared-components.js', import.meta.url).href)
const {
  KIT_LIMITS, ariaSortFor, canSelectStep, cellText, cleanColumns, cleanSteps, editorKeyAction, keyedRows, nextSort, rowFocusMove,
  saveEnabled, stepState, tabbableIndex,
} = logic
const { DataTable, FormRow, EditorWindow, Stepper } = kit

// ---- the pure rules ----
assert.deepEqual(nextSort(null, null, 'name'), { sortKey: 'name', sortDir: 'ascending' }, 'first click: ascending')
assert.deepEqual(nextSort('name', 'ascending', 'name'), { sortKey: 'name', sortDir: 'descending' }, 'second click: descending')
assert.deepEqual(nextSort('name', 'descending', 'name'), { sortKey: null, sortDir: null }, 'third click: none')
assert.deepEqual(nextSort('name', 'descending', 'size'), { sortKey: 'size', sortDir: 'ascending' }, 'another column starts at ascending')
assert.equal(ariaSortFor('a', 'a', 'asc'), 'ascending')
assert.equal(ariaSortFor('a', 'a', 'descending'), 'descending')
assert.equal(ariaSortFor('a', 'b', 'ascending'), undefined)
assert.equal(ariaSortFor('a', 'a', 'sideways'), undefined)

assert.deepEqual(cleanColumns([{ key: 'a', label: 'A', sortable: true, align: 'right', width: '120px' }, { key: 'a' }, null, { label: 'no key' }, { key: 'b', align: 'weird', width: 'url(x)' }]),
  [{ key: 'a', label: 'A', sortable: true, align: 'right', width: '120px' }, { key: 'b', label: 'b', sortable: false, align: 'left', width: '' }])
assert.deepEqual(cleanColumns('x'), [])
assert.equal(cleanColumns(Array.from({ length: 60 }, (_, i) => ({ key: `c${i}` }))).length, KIT_LIMITS.maxColumns)

let k = keyedRows([{ id: 'x' }, { id: 'y' }, { id: 'x' }, {}], 'id')
assert.deepEqual(k.items.map((i) => i.key), ['x', 'y', 'x#2', '3'], 'duplicate and missing keys still give unique keys')
assert.equal(keyedRows([{ a: 1 }], undefined).items[0].key, '0', 'no rowKey: the position')
k = keyedRows(Array.from({ length: 2500 }, (_, i) => ({ id: i })), 'id')
assert.equal(k.items.length, KIT_LIMITS.maxRows)
assert.equal(k.capped, true)
assert.equal(keyedRows(null).items.length, 0)

assert.equal(cellText('<b>x</b>'), '<b>x</b>', 'markup stays as typed')
assert.equal(cellText(5), '5')
assert.equal(cellText(false), 'false')
assert.equal(cellText(null), '')
assert.equal(cellText({ a: 1 }), '', 'an object never prints')

assert.equal(rowFocusMove(0, 'ArrowDown', 3), 1)
assert.equal(rowFocusMove(2, 'ArrowDown', 3), 2, 'no wrap at the end')
assert.equal(rowFocusMove(0, 'ArrowUp', 3), 0, 'no wrap at the start')
assert.equal(rowFocusMove(1, 'Home', 3), 0)
assert.equal(rowFocusMove(1, 'End', 3), 2)
assert.equal(rowFocusMove(1, 'a', 3), -1)
assert.equal(rowFocusMove(0, 'ArrowDown', 0), -1)
const items = [{ key: 'a' }, { key: 'b' }]
assert.equal(tabbableIndex(items, 'b'), 1)
assert.equal(tabbableIndex(items, 'zzz'), 0)
assert.equal(tabbableIndex(items, null), 0)
assert.equal(tabbableIndex([], 'a'), -1)

const steps = cleanSteps([{ key: 'one', label: 'One', state: 'done' }, { key: 'one' }, { key: 'two', state: 'error' }, { key: 'three', state: 'bogus' }, 7])
assert.deepEqual(steps.map((s) => [s.key, s.state]), [['one', 'done'], ['two', 'error'], ['three', '']])
assert.equal(stepState(steps[0], 0, 0), 'current', 'the current step is current even when done')
assert.equal(stepState(steps[0], 0, 2), 'done')
assert.equal(stepState(steps[1], 1, 2), 'error')
assert.equal(stepState(steps[2], 2, 0), 'todo')
assert.equal(canSelectStep(0, 2), true)
assert.equal(canSelectStep(2, 2), false, 'not the current step')
assert.equal(canSelectStep(3, 2), false, 'not a later step')
assert.equal(canSelectStep(0, -1), false, 'no current step, no choosing')
assert.equal(cleanSteps(Array.from({ length: 20 }, (_, i) => ({ key: `s${i}` }))).length, KIT_LIMITS.maxSteps)

assert.equal(editorKeyAction({ key: 'Escape' }, {}), 'close')
assert.equal(editorKeyAction({ key: 's', ctrlKey: true }, { canSave: true }), 'save')
assert.equal(editorKeyAction({ key: 'S', metaKey: true }, { canSave: true }), 'save')
assert.equal(editorKeyAction({ key: 's', ctrlKey: true }, { canSave: false }), 'blocked', 'handled, but nothing to save')
assert.equal(editorKeyAction({ key: 's', ctrlKey: true }, { canSave: true, saving: true }), 'blocked', 'not while saving')
assert.equal(editorKeyAction({ key: 's' }, { canSave: true }), null)
assert.equal(editorKeyAction({ key: 's', ctrlKey: true, altKey: true }, { canSave: true }), null)
assert.equal(saveEnabled({ canSave: true, saving: false }), true)
assert.equal(saveEnabled({ canSave: true, saving: true }), false)
assert.equal(saveEnabled({}), false)

// ---- markup ----
const ssr = (component, props, slots) => renderToString(createSSRApp({ render: () => h(component, props, slots) }))

const columns = [{ key: 'name', label: 'Name', sortable: true }, { key: 'size', label: 'Size', sortable: true, align: 'right' }, { key: 'note', label: 'Note' }]
const rows = [{ id: 1, name: 'Disk cleanup', size: 3, note: '<img src=x onerror=alert(1)>' }, { id: 2, name: 'Backup', size: 9, note: null }]
let html = await ssr(DataTable, { columns, rows, rowKey: 'id', selectedKey: 2, sortKey: 'name', sortDir: 'ascending', footer: '2 of 2' })
assert.ok(html.includes('class="tt-panel tt-ws"') && html.includes('class="tt-table"'))
assert.ok(html.includes('role="grid"'))
assert.equal((html.match(/aria-sort="/g) || []).length, 1, 'aria-sort on the sorted column only')
assert.ok(html.includes('aria-sort="ascending"'))
assert.ok(html.includes('scope="col"'))
assert.ok(/<tr[^>]*aria-selected="true"[^>]*>(?:(?!<\/tr>).)*Backup/.test(html), 'the selected row is marked')
assert.equal((html.match(/aria-selected="false"/g) || []).length, 1)
assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'markup in a value stays visible as typed')
assert.ok(!html.includes('<img'), 'no markup element from a value')
assert.ok(html.includes('tt-table-foot') && html.includes('2 of 2'))
assert.equal((html.match(/tabindex="0"/g) || []).length, 3, 'two sortable headers and one tabbable row')
assert.ok(html.includes('class="num"'), 'right-aligned cells')

html = await ssr(DataTable, { columns, rows: [], emptyTitle: 'No tasks', emptyText: 'Add one to start.' })
assert.ok(html.includes('tt-table-empty') && html.includes('No tasks') && html.includes('Add one to start.'))
html = await ssr(DataTable, { columns, rows, loading: true })
assert.ok(html.includes('aria-busy="true"') && html.includes('tt-skel') && !html.includes('Disk cleanup'), 'skeleton rows while loading')
assert.ok(!html.includes('tt-table-empty'), 'no empty text while loading')
html = await ssr(DataTable, { columns, rows, cell: (row, column) => (column.key === 'name' ? h('b', row.name) : `${row[column.key] ?? ''}`) })
assert.ok(html.includes('<b>Disk cleanup</b>'), 'a cell function may return vnodes')
html = await ssr(DataTable, { columns, rows, cell: () => { throw new Error('boom') } })
assert.ok(html.includes('class="tt-table"'), 'a throwing cell function does not break the table')
html = await ssr(DataTable, { columns, rows: Array.from({ length: 2100 }, (_, i) => ({ id: i, name: 'n' })) })
assert.ok(html.includes(KIT_LIMITS.cappedText))

html = await ssr(FormRow, { label: 'Timeout', hint: 'Minutes', help: 'Five or more.', error: 'Too low.', forId: 'to' }, { default: () => h('input', { id: 'to' }) })
assert.ok(html.includes('class="tt-frow"') && html.includes('<label for="to">Timeout<small>Minutes</small></label>'))
assert.ok(html.includes('class="tt-ctl"') && html.includes('<input id="to">'))
assert.ok(html.includes('id="to-hint"') && html.includes('Five or more.'))
assert.ok(html.includes('id="to-error"') && html.includes('role="alert"') && html.includes('Too low.'))
html = await ssr(FormRow, { label: '<i>x</i>' })
assert.ok(html.includes('&lt;i&gt;x&lt;/i&gt;'), 'the label is text')
assert.ok(!html.includes('tt-error'), 'no error line without an error')

html = await ssr(EditorWindow, { title: 'Editing Disk cleanup', dirty: true, canSave: true, status: 'Ready' }, {
  actions: () => h('button', { class: 'btn' }, 'Snippets'),
  properties: () => h('p', 'Props'),
  content: () => h('p', 'Body'),
  footer: () => h('button', { class: 'btn' }, 'Test run'),
})
assert.ok(html.includes('class="tt-win tt-ws"') && html.includes('role="group"') && html.includes('aria-labelledby="tt-win-title-'))
assert.ok(html.includes('Editing Disk cleanup') && html.includes('Unsaved changes'))
assert.ok(html.includes('Snippets') && html.includes('Props') && html.includes('Body') && html.includes('Test run'))
assert.ok(html.includes('aria-label="Close editor"'))
assert.ok(!/class="btn primary"[^>]*disabled/.test(html), 'Save is enabled when canSave')
html = await ssr(EditorWindow, { title: 'T' }, { content: () => h('p', 'Body') })
assert.ok(/class="btn primary"[^>]*disabled/.test(html), 'Save is disabled by default')
assert.ok(html.includes('no-props'), 'no properties area, no empty column')
assert.ok(!html.includes('Unsaved changes'))
html = await ssr(EditorWindow, { title: 'T', dirty: true, canSave: true, saving: true })
assert.ok(html.includes('Saving') && /class="btn primary"[^>]*disabled/.test(html), 'Save is disabled while saving')

html = await ssr(Stepper, { steps: [{ key: 'a', label: 'Task', state: 'done' }, { key: 'b', label: 'Actions', state: 'error' }, { key: 'c', label: 'Schedule' }, { key: 'd', label: 'Review' }], current: 'c' })
assert.ok(html.includes('<ol class="tt-steps tt-ws"'))
assert.equal((html.match(/aria-current="step"/g) || []).length, 1)
assert.ok(/aria-current="step"[^>]*>(?:(?!<\/li>).)*Schedule/.test(html), 'the current step carries aria-current')
assert.equal((html.match(/<button/g) || []).length, 2, 'only the two earlier steps are buttons')
assert.ok(html.includes('class="done"') && html.includes('class="err"'))
assert.ok(html.includes('(done)') && html.includes('(has an error)'), 'state is spoken, not only coloured')
html = await ssr(Stepper, { steps: [{ key: 'a', label: 'One' }], current: 'nope' })
assert.ok(!html.includes('aria-current') && !html.includes('<button'), 'an unknown current step gives no choosing')

// ---- events, through a minimal renderer ----
const nodeOps = {
  createElement: (tag) => ({ tag, props: {}, children: [], parent: null }),
  createText: (text) => ({ tag: '#text', text, children: [], props: {} }),
  createComment: () => ({ tag: '#comment', children: [], props: {} }),
  setText: (node, text) => { node.text = text },
  setElementText: (el, text) => { el.children = [{ tag: '#text', text, children: [], props: {} }] },
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter((c) => c !== child)
    child.parent = parent
    const at = anchor ? parent.children.indexOf(anchor) : -1
    if (at >= 0) parent.children.splice(at, 0, child)
    else parent.children.push(child)
  },
  remove: (child) => { if (child.parent) child.parent.children = child.parent.children.filter((c) => c !== child); child.parent = null },
  parentNode: (node) => node.parent,
  nextSibling: (node) => { const list = node.parent?.children || []; return list[list.indexOf(node) + 1] || null },
  patchProp: (el, key, prev, next) => { el.props[key] = next },
}
const { createApp } = createRenderer(nodeOps)
const find = (node, pred, out = []) => { if (pred(node)) out.push(node); for (const c of node.children) find(c, pred, out); return out }
const mount = (component, props, slots) => {
  const root = nodeOps.createElement('root')
  createApp({ render: () => h(component, props, slots) }).mount(root)
  return root
}
const ev = (extra = {}) => ({ preventDefault() { this.prevented = true }, stopPropagation() { this.stopped = true }, ...extra })

{
  const got = { sort: [], select: [], rowmenu: [], activate: [] }
  const root = mount(DataTable, {
    columns, rows, rowKey: 'id', sortKey: 'name', sortDir: 'ascending',
    onSort: (key, dir) => got.sort.push([key, dir]),
    onSelect: (row) => got.select.push(row.id),
    onRowmenu: (row, event) => got.rowmenu.push([row.id, event.type]),
    onActivate: (row) => got.activate.push(row.id),
  })
  const th = find(root, (n) => n.tag === 'th')
  th[0].props.onClick()
  th[1].props.onClick()
  assert.equal(th[2].props.onClick, undefined, 'a column that is not sortable has no click')
  const spaceKey = ev({ key: ' ' })
  th[1].props.onKeydown(spaceKey)
  assert.deepEqual(got.sort, [['name', 'descending'], ['size', 'ascending'], ['size', 'ascending']], 'the click asks for the next direction')
  assert.equal(spaceKey.prevented, true)
  const trs = find(root, (n) => n.tag === 'tr' && n.props['data-row'] !== undefined)
  trs[1].props.onClick()
  trs[0].props.onDblclick()
  const menu = ev({ type: 'contextmenu' })
  trs[0].props.onContextmenu(menu)
  assert.equal(menu.prevented, true, 'the browser menu is replaced')
  const enter = ev({ key: 'Enter' })
  trs[1].props.onKeydown({ ...enter, target: trs[1], currentTarget: trs[1], preventDefault: enter.preventDefault.bind(enter) })
  trs[0].props.onKeydown({ key: ' ', target: trs[0], currentTarget: trs[0], preventDefault() {} })
  trs[0].props.onKeydown({ key: 'Enter', target: { other: true }, currentTarget: trs[0], preventDefault() {} })
  assert.deepEqual(got.select, [2, 1])
  assert.deepEqual(got.activate, [1, 2], 'double click and Enter activate; a key from a control inside the row does not')
  assert.deepEqual(got.rowmenu, [[1, 'contextmenu']])
}

{
  const got = []
  const root = mount(EditorWindow, { title: 'T', dirty: true, canSave: true, onSave: () => got.push('save'), onDiscard: () => got.push('discard'), onClose: () => got.push('close') })
  const section = find(root, (n) => n.tag === 'section')[0]
  const saveKey = ev({ key: 's', ctrlKey: true })
  section.props.onKeydown(saveKey)
  assert.equal(saveKey.prevented, true, 'Ctrl+S does not open the browser save dialog')
  const escKey = ev({ key: 'Escape' })
  section.props.onKeydown(escKey)
  assert.equal(escKey.stopped, true, 'Escape stops here, so a dialog host below does not also close')
  section.props.onKeydown(ev({ key: 'a' }))
  const buttons = find(root, (n) => n.tag === 'button')
  const byLabel = (text) => buttons.find((b) => JSON.stringify(b.children).includes(text) || b.props['aria-label'] === text)
  byLabel('Close editor').props.onClick()
  byLabel('Discard changes').props.onClick()
  byLabel('Save').props.onClick()
  assert.deepEqual(got, ['save', 'close', 'close', 'discard', 'save'])
}
{
  const got = []
  const root = mount(EditorWindow, { title: 'T', dirty: true, canSave: false, onSave: () => got.push('save') })
  const section = find(root, (n) => n.tag === 'section')[0]
  const blocked = ev({ key: 's', ctrlKey: true })
  section.props.onKeydown(blocked)
  assert.deepEqual(got, [], 'Ctrl+S without canSave saves nothing')
  assert.equal(blocked.prevented, true)
}

{
  const got = []
  const root = mount(Stepper, { steps: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }], current: 'c', onSelect: (key) => got.push(key) })
  const buttons = find(root, (n) => n.tag === 'button')
  assert.equal(buttons.length, 2)
  buttons[0].props.onClick()
  buttons[1].props.onClick()
  assert.deepEqual(got, ['a', 'b'], 'Back emits select for an earlier step')
}

// ---- the registry and the source ----
const sc = shared.sharedComponents
assert.ok(Object.isFrozen(sc))
assert.deepEqual(Object.keys(sc).sort(), ['DataTable', 'EditorWindow', 'FormRow', 'SearchSelect', 'Stepper', 'TagEditor'], 'exactly six members')
for (const [name, component] of Object.entries(sc)) {
  assert.ok(Object.isFrozen(component), `${name} is frozen`)
  assert.ok(Object.isFrozen(component.props), `${name} props are frozen`)
  for (const [prop, def] of Object.entries(component.props)) assert.ok(Object.isFrozen(def), `${name}.${prop} is frozen`)
}
assert.throws(() => { 'use strict'; sc.DataTable.props.rows = {} }, TypeError)

const kitSrc = read('../src/shared-kit.js').replace(/\/\/.*$/gm, '')
assert.ok(!kitSrc.includes('innerHTML') && !kitSrc.includes('v-html') && !kitSrc.includes('domProps'), 'the kit never writes markup from a value')
assert.ok(!/localStorage|sessionStorage/.test(kitSrc), 'the kit stores nothing')
assert.ok(!/confirm\(|context\.confirm/.test(kitSrc), 'no component confirms or discards by itself')

const css = read('../src/styles.css')
const kitBlock = css.slice(css.indexOf('/* ==== Component kit'), css.indexOf('/* ==== end of the component kit ==== */'))
assert.ok(kitBlock.length > 500, 'the kit block exists')
for (const cls of ['tt-panel', 'tt-tablewrap', 'tt-table', 'tt-table-empty', 'tt-table-foot', 'tt-frow', 'tt-ctl', 'tt-win', 'tt-win-head', 'tt-win-title', 'tt-win-body', 'tt-win-foot', 'tt-win-actions', 'tt-props', 'tt-pane', 'tt-dirty', 'tt-status', 'tt-steps', 'tt-step', 'tt-sr', 'tt-iconbtn', 'tt-skel']) {
  assert.ok(new RegExp(`\\.${cls}(?![\\w-])`).test(kitBlock), `the CSS has .${cls}`)
}
assert.ok(!/font(?:-size)?:\s*[\d.]+px/.test(kitBlock), 'no raw px font size in the kit block')

// authenticated modules receive the four new components; registerPublic still gets none
const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
let loaderSource = read('../src/module-loader.js').replace("import * as Vue from 'vue'", 'const Vue = {}')
const loader = await import(`data:text/javascript;base64,${Buffer.from(loaderSource).toString('base64')}`)
const runtime = {
  app: {},
  router: { currentRoute: { value: { path: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} },
  state: { context: { permissions: [], user: { superuser: true, id: 9 } }, contextSource: 'backend' },
  addNavigation() {},
  removeNavigation() {},
  components: sc,
  publicApi: async () => ({}),
}
const ok = entry('export default { register(ctx) { globalThis.__kit = ctx.components } }')
const loaded = await loader.loadUiModules(runtime, [{ id: 'kituser', entry: ok, permissions: [], allowed: true }], { timeoutMs: 500 })
assert.deepEqual(loaded.loaded, ['kituser'])
for (const name of ['DataTable', 'FormRow', 'EditorWindow', 'Stepper']) assert.equal(globalThis.__kit[name], sc[name], `a module receives ${name}`)
assert.throws(() => { globalThis.__kit.DataTable = null }, TypeError)
const publicEntry = entry('export default { registerPublic(ctx) { globalThis.__pub = Object.keys(ctx) } }')
const publicLoaded = await loader.loadPublicUiModules(runtime, [{ id: 'pubmod', public: { entry: publicEntry, base_path: '/public/pubmod' } }])
assert.deepEqual(publicLoaded.loaded, ['pubmod'])
assert.equal(globalThis.__pub.includes('components'), false, 'registerPublic still gets no components')

console.log('shared-kit-0.12.114: PASS')
