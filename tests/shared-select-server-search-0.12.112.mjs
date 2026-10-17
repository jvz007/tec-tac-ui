// 0.12.112: SearchSelect server mode (scriptmanager 0.4.4 request, UI Q70). The pure rules (no local filter and no 300 cap in server
// mode, the 1000 loaded-row cap, the label fallback, the once-only 'more'), the component driven through a minimal renderer
// (search and more events, loading, selectedLabel, static lists unchanged), and a render of both components deep-frozen.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRenderer, createSSRApp, h, nextTick, reactive } from 'vue'
import { renderToString } from 'vue/server-renderer'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const logic = await import(new URL('../src/shared-components-logic.js', import.meta.url).href)
const comps = await import(new URL('../src/shared-components.js', import.meta.url).href)
const { visibleOptions, chosenDisplayLabel, wantsMore, deepFreeze, SELECT_LIMITS } = logic
const { SearchSelect, TagEditor, SearchSelectList } = comps

// ---- the pure rules ----
const rows = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ value: from + i, label: `Agent ${from + i}` }))
assert.equal(SELECT_LIMITS.maxRows, 300, 'the static cap is unchanged')
assert.equal(SELECT_LIMITS.maxServerRows, 1000)

// server mode: no local filter. The module searched already, so a query that matches no label still shows every row.
let v = visibleOptions(rows(5), 'zzz', { serverSearch: true })
assert.equal(v.flat.length, 5, 'no local filter in server mode')
v = visibleOptions(rows(5), 'zzz')
assert.equal(v.flat.length, 0, 'the local filter still works for a static list')
// no 300 cap in server mode
v = visibleOptions(rows(450), '', { serverSearch: true })
assert.equal(v.flat.length, 450)
assert.equal(v.capped, false)
v = visibleOptions(rows(450), '')
assert.equal(v.flat.length, 300, 'a static list keeps the 300 cap')
assert.equal(v.capped, true)
// the loaded-row cap in server mode is 1000
v = visibleOptions(rows(1200), '', { serverSearch: true })
assert.equal(v.flat.length, 1000)
assert.equal(v.capped, true)
assert.equal(v.groups.reduce((n, g) => n + g.options.length, 0), 1000)
// favourites still group first
v = visibleOptions([{ label: 'a' }, { label: 'b', favourite: true }], '', { serverSearch: true })
assert.deepEqual(v.flat.map((o) => o.label), ['b', 'a'])
// serverSearch must be exactly true
assert.equal(visibleOptions(rows(5), 'zzz', { serverSearch: 'yes' }).flat.length, 0)

// label fallback
assert.equal(chosenDisplayLabel({ label: 'Disk' }, 1, 'Other'), 'Disk', 'a chosen option wins')
assert.equal(chosenDisplayLabel(null, 7, 'Agent seven'), 'Agent seven', 'a value outside the page shows its label')
assert.equal(chosenDisplayLabel(null, null, 'Agent seven'), '', 'nothing chosen shows nothing')
assert.equal(chosenDisplayLabel(null, undefined, 'x'), '')
assert.equal(chosenDisplayLabel(null, 7, undefined), '')
assert.equal(chosenDisplayLabel(null, 7, 5), '', 'text only')
assert.equal(chosenDisplayLabel({ label: null }, 1), '')

// more fires once
const base = { serverSearch: true, hasMore: true, loading: false, asked: false, count: 10, highlight: 9, atEnd: false }
assert.equal(wantsMore(base), true, 'the highlight is on the last row')
assert.equal(wantsMore({ ...base, highlight: 8 }), false)
assert.equal(wantsMore({ ...base, highlight: 3, atEnd: true }), true, 'scrolled to the end')
assert.equal(wantsMore({ ...base, asked: true }), false, 'not again until the options change')
assert.equal(wantsMore({ ...base, loading: true }), false, 'not while loading')
assert.equal(wantsMore({ ...base, hasMore: false }), false)
assert.equal(wantsMore({ ...base, serverSearch: false }), false, 'static lists never ask')
assert.equal(wantsMore({ ...base, count: 0, highlight: -1 }), false)
assert.equal(wantsMore(), false)

// ---- the component, through a minimal renderer ----
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
const textOf = (node) => (node.tag === '#text' ? node.text : node.children.map(textOf).join(''))

function mount(extra = {}) {
  const st = reactive({ modelValue: null, options: rows(3), loading: false, hasMore: true, serverSearch: true, selectedLabel: undefined, ...extra })
  const events = { search: [], more: 0, model: [] }
  const root = nodeOps.createElement('root')
  const app = createApp({
    render: () => h(SearchSelect, {
      modelValue: st.modelValue,
      options: st.options,
      loading: st.loading,
      hasMore: st.hasMore,
      serverSearch: st.serverSearch,
      selectedLabel: st.selectedLabel,
      onSearch: (text) => events.search.push(text),
      onMore: () => { events.more += 1 },
      'onUpdate:modelValue': (value) => events.model.push(value),
    }),
  })
  app.mount(root)
  const input = () => find(root, (n) => n.tag === 'input')[0]
  const list = () => find(root, (n) => n.tag === 'ul' && n.props.role === 'listbox' && !n.props.hidden)[0]
  const key = (k) => input().props.onKeydown({ key: k, preventDefault() {}, stopPropagation() {}, isComposing: false })
  return { st, events, root, input, list, key }
}

// server mode: opening reports an empty search; typing reports the text and never changes the value
{
  const t = mount()
  t.input().props.onFocus({ target: { select() {} } })
  await nextTick()
  assert.deepEqual(t.events.search, [''], 'the list opening emits an empty search')
  t.input().props.onInput({ target: { value: 'ab' } })
  await nextTick()
  t.input().props.onInput({ target: { value: 'abc' } })
  await nextTick()
  assert.deepEqual(t.events.search, ['', 'ab', 'abc'], 'every change is emitted, the module debounces')
  assert.deepEqual(t.events.model, [], 'typing never changes modelValue')
  assert.equal(find(t.list(), (n) => n.props.role === 'option').length, 3, 'the rows are shown as given, not filtered by the text')
}

// more fires once when the highlight reaches the last row, again only after the options change
{
  const t = mount()
  t.input().props.onFocus({ target: { select() {} } })
  await nextTick()
  assert.equal(t.events.more, 0)
  t.key('ArrowDown'); await nextTick()
  assert.equal(t.events.more, 0, 'row 2 of 3')
  t.key('ArrowDown'); await nextTick()
  assert.equal(t.events.more, 1, 'the last row asks for more')
  t.key('ArrowDown'); await nextTick()
  t.key('ArrowUp'); await nextTick()
  t.key('ArrowDown'); await nextTick()
  assert.equal(t.events.more, 1, 'not again for the same options')
  t.st.options = [...rows(3), ...rows(3, 3)]
  await nextTick()
  for (let i = 0; i < 3; i += 1) { t.key('ArrowDown'); await nextTick() }
  assert.equal(t.events.more, 2, 'asked again after the options changed')
  // loading ends: asked resets, and the next arrival at the last row asks again
  t.st.loading = true; await nextTick()
  t.key('ArrowUp'); await nextTick()
  t.key('ArrowDown'); await nextTick()
  assert.equal(t.events.more, 2, 'not while loading')
  t.st.loading = false; await nextTick()
  t.key('ArrowUp'); await nextTick()
  t.key('ArrowDown'); await nextTick()
  assert.equal(t.events.more, 3, 'asked again once loading has ended')
  t.st.hasMore = false; await nextTick()
  t.key('ArrowUp'); await nextTick()
  t.key('ArrowDown'); await nextTick()
  assert.equal(t.events.more, 3, 'hasMore false asks for nothing')
}

// scrolling the list to its end asks too, once
{
  const t = mount()
  t.input().props.onFocus({ target: { select() {} } })
  await nextTick()
  t.list().props.onScroll({ target: { scrollHeight: 300, scrollTop: 10, clientHeight: 100 } })
  assert.equal(t.events.more, 0, 'not at the end')
  t.list().props.onScroll({ target: { scrollHeight: 300, scrollTop: 199, clientHeight: 100 } })
  t.list().props.onScroll({ target: { scrollHeight: 300, scrollTop: 200, clientHeight: 100 } })
  assert.equal(t.events.more, 1, 'the end asks once')
}

// loading: one quiet line, aria-busy, and no 'No matches' while loading
{
  const t = mount({ options: [], loading: true })
  t.input().props.onFocus({ target: { select() {} } })
  await nextTick()
  assert.equal(t.list().props['aria-busy'], 'true')
  assert.equal(t.input().props['aria-busy'], 'true')
  assert.equal(textOf(t.list()), 'Loading…', 'one Loading line and no empty text')
  t.st.options = rows(2)
  await nextTick()
  assert.equal(textOf(t.list()).endsWith('Loading…'), true, 'the line follows the rows')
  t.st.loading = false
  await nextTick()
  assert.equal(t.list().props['aria-busy'], undefined)
  assert.equal(textOf(t.list()).includes('Loading'), false)
  t.st.options = []
  await nextTick()
  assert.equal(textOf(t.list()), SELECT_LIMITS.emptyText, 'an empty settled list says no matches')
}

// selectedLabel shows for a value that is not in the loaded rows
{
  const t = mount({ modelValue: 99, selectedLabel: 'Agent ninety-nine' })
  assert.equal(t.input().props.value, 'Agent ninety-nine')
  t.st.options = [...rows(2), { value: 99, label: 'Agent 99 (from the list)' }]
  await nextTick()
  assert.equal(t.input().props.value, 'Agent 99 (from the list)', 'a loaded row wins over selectedLabel')
  const none = mount({ modelValue: null, selectedLabel: 'Agent ninety-nine' })
  assert.equal(none.input().props.value, '', 'no value shows nothing')
}

// a static list (serverSearch off) is exactly as before: no search event, no more event, local filter and cap
{
  const t = mount({ serverSearch: false, options: rows(450) })
  t.input().props.onFocus({ target: { select() {} } })
  await nextTick()
  t.input().props.onInput({ target: { value: 'Agent 44' } })
  await nextTick()
  assert.deepEqual(t.events.search, [], 'no search event for a static list')
  assert.equal(find(t.list(), (n) => n.props.role === 'option').length, 11, 'the local filter ran: 44 and 440 to 449')
  t.input().props.onInput({ target: { value: '' } })
  await nextTick()
  assert.equal(find(t.list(), (n) => n.props.role === 'option').length, 300, 'the 300 cap')
  assert.equal(textOf(t.list()).includes('Showing the first 300. Keep typing to narrow it.'), true)
  t.list().props.onScroll({ target: { scrollHeight: 300, scrollTop: 300, clientHeight: 100 } })
  for (let i = 0; i < 5; i += 1) { t.key('ArrowDown'); await nextTick() }
  assert.equal(t.events.more, 0, 'a static list never asks for more')
}

// the 1000-row cap text in server mode
{
  const t = mount({ options: rows(1100), hasMore: false })
  t.input().props.onFocus({ target: { select() {} } })
  await nextTick()
  assert.equal(find(t.list(), (n) => n.props.role === 'option').length, 1000)
  assert.equal(textOf(t.list()).includes('Showing the first 1000 loaded. Keep typing to narrow it.'), true)
}

// ---- deep freeze: the definitions are frozen all the way down and still render ----
{
  const free = { a: { b: [1, { c: 2 }] }, fn() {}, ctor: Array }
  deepFreeze(free)
  assert.equal(Object.isFrozen(free.a.b[1]), true)
  assert.equal(Object.isFrozen(Array), false, 'a built-in constructor named in props is never frozen')
  assert.equal(Object.isFrozen(String), false)
  assert.equal(Object.isFrozen(Object.prototype), false)

  const { sharedComponents } = comps
  for (const name of ['SearchSelect', 'TagEditor']) {
    const def = sharedComponents[name]
    assert.equal(Object.isFrozen(def), true, `${name} options are frozen`)
    assert.equal(Object.isFrozen(def.props), true, `${name} props are frozen`)
    for (const spec of Object.values(def.props)) assert.equal(Object.isFrozen(spec), true, `${name} prop spec frozen`)
    assert.equal(Object.isFrozen(def.emits), true, `${name} emits are frozen`)
    assert.throws(() => { 'use strict'; def.props.extra = {} }, TypeError)
    assert.throws(() => { 'use strict'; def.name = 'x' }, TypeError)
  }
  assert.equal(Object.isFrozen(Array) || Object.isFrozen(Boolean) || Object.isFrozen(Function), false, 'globals untouched')
  assert.equal(SearchSelect, sharedComponents.SearchSelect)

  const render = (component, props) => renderToString(createSSRApp({ render: () => h(component, props) }))
  let html = await render(SearchSelect, { options: [{ value: 1, label: 'One' }], modelValue: 1 })
  assert.match(html, /value="One"/)
  html = await render(SearchSelect, { serverSearch: true, options: [], modelValue: 5, selectedLabel: 'Five', loading: true, hasMore: true })
  assert.match(html, /value="Five"/)
  html = await render(TagEditor, { modelValue: ['a', 'b'] })
  assert.match(html, /class="tt-tag"/)
  html = await render(SearchSelectList, { listId: 'x', groups: [], flat: [], loading: true })
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /Loading…/)
  assert.doesNotMatch(html, /No matches/)
}

// ---- the source and docs ----
{
  const src = read('../src/shared-components.js')
  const code = src.split('\n').filter((line) => !line.trim().startsWith('//')).join(' ')
  assert.equal(/v-html|innerHTML|insertAdjacentHTML|template:/.test(code), false)
  assert.equal(/localStorage|sessionStorage|fetch\(|XMLHttpRequest/.test(code), false)
  // 0.12.114 grew the object to six members (shared-kit-0.12.114.mjs pins them); the first two are unchanged
  assert.ok(/sharedComponents = Object\.freeze\(\{\s+SearchSelect: deepFreeze\(SearchSelect\),\s+TagEditor: deepFreeze\(TagEditor\),/.test(src))
  const doc = read('../docs/module-components.md')
  for (const name of ['serverSearch', 'loading', 'hasMore', 'selectedLabel', '`search`', '`more`', 'Server search and paging', 'SELECT_LIMITS.maxServerRows']) assert.ok(doc.includes(name), `the doc names ${name}`)
  const api = read('../docs/module-runtime-api.md')
  assert.ok(api.includes('Contract row addition (UI 0.12.112, listed in the public contract export from 1.17.50-0.12.115)'))
  // nothing in modules/ passes the new names today, so nothing changes for them
  const modulesRoot = new URL('../../../modules/', import.meta.url)
  if (fs.existsSync(modulesRoot)) {
    const offenders = []
    const usesPicker = (text) => text.includes('SearchSelect') && /(?:serverSearch|selectedLabel|hasMore)/.test(text)
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
        if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full) }
        else if (/\.m?js$/.test(entry.name) && dir.pathname.includes('/ui/') && usesPicker(fs.readFileSync(full, 'utf8'))) offenders.push(full.pathname)
      }
    }
    walk(modulesRoot)
    assert.deepEqual(offenders, [], 'no module that uses SearchSelect passes serverSearch, selectedLabel or hasMore yet (a private hasMore elsewhere is unrelated)')
  }
}

console.log('shared-select-server-search-0.12.112: PASS')
