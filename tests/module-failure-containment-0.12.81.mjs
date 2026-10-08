import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRenderer, defineComponent, h, nextTick, onMounted, ref } from 'vue'
import ModuleErrorBoundary from '../src/components/module-error-boundary.js'

// node_modules has no DOM, so the boundary runs on Vue's custom renderer with
// an in-memory node tree.
function makeNode(type) { return { type, children: [], parent: null, props: {}, text: '' } }
const { render, createApp } = createRenderer({
  patchProp(el, key, _prev, next) { el.props[key] = next },
  insert(child, parent, anchor) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index >= 0) parent.children.splice(index, 0, child)
    else parent.children.push(child)
  },
  remove(child) { if (child.parent) { child.parent.children.splice(child.parent.children.indexOf(child), 1); child.parent = null } },
  createElement: (type) => makeNode(type),
  createText: (text) => Object.assign(makeNode('#text'), { text }),
  createComment: (text) => Object.assign(makeNode('#comment'), { text }),
  setText(node, text) { node.text = text },
  setElementText(el, text) { el.children = [Object.assign(makeNode('#text'), { text, parent: el })] },
  parentNode: (node) => node.parent,
  nextSibling: (node) => (node.parent ? node.parent.children[node.parent.children.indexOf(node) + 1] || null : null),
})

function textOf(node) {
  if (node.type === '#text') return node.text
  return node.children.map(textOf).join('')
}
function find(node, predicate) {
  if (predicate(node)) return node
  for (const child of node.children) { const hit = find(child, predicate); if (hit) return hit }
  return null
}

const originalWarn = console.warn
console.warn = () => {}

function mount(root) {
  const container = makeNode('root')
  const app = createApp(root)
  app.mount(container)
  return { app, container }
}

const healthy = defineComponent({ setup: () => () => h('p', { class: 'healthy' }, 'sibling ok') })
const throwing = defineComponent({ setup() { throw new Error('setup exploded') } })
const renderThrow = defineComponent({ setup: () => () => { throw new Error('render exploded') } })
const hookThrow = defineComponent({ setup() { onMounted(() => { throw new Error('mounted exploded') }); return () => h('i', 'child') } })

// 1. A throwing child next to a healthy sibling: sibling stays, fallback shows,
// and the failure is recorded with the provider id.
{
  const records = []
  const recorder = (entry) => records.push(entry)
  const { container } = mount({
    render: () => h('div', { class: 'shell' }, [
      h(ModuleErrorBoundary, { provider: 'alerts', label: 'Alerts page', recorder }, { default: () => h(throwing) }),
      h(healthy),
    ]),
  })
  await nextTick()
  assert.ok(find(container, (n) => n.props.class === 'healthy'), 'healthy sibling stays rendered')
  const text = textOf(container)
  assert.match(text, /alerts: Alerts page could not load this page/)
  assert.match(text, /setup exploded/)
  assert.match(text, /Retry/)
  assert.equal(records.length, 1)
  assert.equal(records[0].provider, 'alerts')
  assert.equal(records[0].message, 'setup exploded')
}

// 2. Render and lifecycle-hook errors are captured too.
for (const [child, message] of [[renderThrow, 'render exploded'], [hookThrow, 'mounted exploded']]) {
  const records = []
  const { container } = mount({
    render: () => h('div', [
      h(ModuleErrorBoundary, { provider: 'checks', recorder: (entry) => records.push(entry) }, { default: () => h(child) }),
      h(healthy),
    ]),
  })
  await nextTick()
  assert.equal(records.length, 1, message)
  assert.match(textOf(container), new RegExp(message))
  assert.ok(find(container, (n) => n.props.class === 'healthy'))
}

// 3. Retry re-renders the content.
{
  let fail = true
  const flaky = defineComponent({ setup() { if (fail) throw new Error('first try'); return () => h('b', { class: 'recovered' }, 'recovered') } })
  const { container } = mount({ render: () => h(ModuleErrorBoundary, { provider: 'ai' }, { default: () => h(flaky) }) })
  await nextTick()
  assert.match(textOf(container), /first try/)
  fail = false
  const retry = find(container, (n) => n.type === 'button')
  assert.ok(retry, 'retry button rendered')
  retry.props.onClick()
  await nextTick()
  assert.ok(find(container, (n) => n.props.class === 'recovered'), 'content re-rendered after Retry')
  assert.ok(!/could not load/.test(textOf(container)))
}

// 4. An error thrown in an event handler is captured.
{
  const records = []
  const emitter = defineComponent({
    emits: ['ping'],
    setup(_props, { emit }) { onMounted(() => emit('ping')); return () => h('span', 'emitter') },
  })
  const { container } = mount({
    render: () => h(ModuleErrorBoundary, { provider: 'huntress', recorder: (entry) => records.push(entry) }, {
      default: () => h(emitter, { onPing: () => { throw new Error('handler exploded') } }),
    }),
  })
  await nextTick()
  assert.equal(records.length, 1)
  assert.equal(records[0].message, 'handler exploded')
  assert.match(textOf(container), /handler exploded/)
}

// 5. A keyed route change (resetKey) clears the failed state.
{
  const fullPath = ref('/one')
  let fail = true
  const page = defineComponent({ setup() { if (fail) throw new Error('page broke'); return () => h('main', { class: 'page-ok' }, 'ok') } })
  const { container } = mount({
    render: () => h(ModuleErrorBoundary, { provider: 'licensing', resetKey: fullPath.value }, { default: () => h(page) }),
  })
  await nextTick()
  assert.match(textOf(container), /page broke/)
  fail = false
  fullPath.value = '/two'
  await nextTick()
  await nextTick()
  assert.ok(find(container, (n) => n.props.class === 'page-ok'), 'failed state cleared on route change')
}

// 6. Variants: header shows a marker only, widget shows an inline block.
{
  const { container } = mount({
    render: () => h('div', [
      h(ModuleErrorBoundary, { provider: 'alerts', variant: 'header', label: 'Bell' }, { default: () => h(throwing) }),
      h(ModuleErrorBoundary, { provider: 'reportmanager', variant: 'widget', label: 'Recent reports' }, { default: () => h(throwing) }),
    ]),
  })
  await nextTick()
  const marker = find(container, (n) => String(n.props.class || '').includes('module-boundary-marker'))
  assert.ok(marker)
  assert.match(marker.props.title, /alerts: Bell could not load/)
  assert.match(textOf(container), /reportmanager: Recent reports could not load/)
}

// 7. A recorder that throws never escapes the boundary.
{
  const { container } = mount({
    render: () => h(ModuleErrorBoundary, { provider: 'x', recorder: () => { throw new Error('recorder broke') } }, { default: () => h(throwing) }),
  })
  await nextTick()
  assert.match(textOf(container), /setup exploded/)
}

console.warn = originalWarn

// Source assertions: wiring in the shell.
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const app = read('../src/App.vue')
assert.equal((app.match(/<router-view/g) || []).length, 2)
for (const match of app.matchAll(/<ModuleErrorBoundary[^>]*><router-view \/><\/ModuleErrorBoundary>/g)) assert.ok(match[0])
assert.equal((app.match(/<ModuleErrorBoundary[^>]*><router-view \/><\/ModuleErrorBoundary>/g) || []).length, 2, 'both router-views are wrapped')
assert.match(app, /<ModuleErrorBoundary v-for="item in headerItems"[\s\S]*?variant="header"[\s\S]*?<component :is="item.component"/)
assert.match(app, /route\.meta\?\.dynamicModule \|\| route\.meta\?\.publicModule \|\| 'Core'/)
assert.match(app, /:reset-key="route.fullPath"/)
const dashboard = read('../src/views/DashboardView.vue')
assert.match(dashboard, /<ModuleErrorBoundary[^>]*variant="widget"[\s\S]*?<component :is="widgetDefinition\(instance\).component"/)
const main = read('../src/main.js')
assert.match(main, /app\.config\.errorHandler = /)
assert.match(main, /\[TEC-TAC-UI\] Unhandled component error\./)
const stateSource = read('../src/state.js')
assert.match(stateSource, /MODULE_RUNTIME_ERROR_LIMIT = 50/)
assert.match(stateSource, /moduleRuntimeErrors: \[\]/)
const modules = read('../src/views/ModulesView.vue')
assert.match(modules, /label: 'runtime error'/)

console.log('[TEST] module failure containment OK')
