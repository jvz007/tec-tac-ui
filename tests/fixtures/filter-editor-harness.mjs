// Shared by the 0.12.116 FilterEditor tests: a minimal renderer (no DOM), a fake api that records every call and answers by URL,
// and small finders. Real timers are used for the 250 ms debounce, so a test waits with sleep().
import { createRenderer, h, nextTick, reactive } from 'vue'

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

export { nextTick, reactive, h }
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const flush = async () => { for (let i = 0; i < 6; i += 1) { await nextTick(); await sleep(0) } }
export const find = (node, pred, out = []) => { if (pred(node)) out.push(node); for (const c of node.children) find(c, pred, out); return out }
export const textOf = (node) => (node.tag === '#text' ? node.text : node.children.map(textOf).join(''))
export const byLabel = (root, label) => find(root, (n) => n.props['aria-label'] === label)
export const button = (root, text) => find(root, (n) => n.tag === 'button' && textOf(n) === text)[0]
export const click = (el) => el.props.onClick({ preventDefault() {} })

export const FIELDS = {
  module: 'agents',
  available: true,
  fields: [
    { id: 'hostname', label: 'Hostname', kind: 'text', operators: [{ id: 'equals', label: 'Equals' }, { id: 'not_equals', label: 'Does not equal' }, { id: 'contains', label: 'Contains' }], values: { source: 'distinct' } },
    { id: 'client', label: 'Client', kind: 'id', operators: [{ id: 'equals', label: 'Equals' }, { id: 'not_equals', label: 'Does not equal' }, { id: 'contains', label: 'Contains' }], values: { source: 'distinct' } },
    { id: 'monitoring', label: 'Monitoring type', kind: 'text', operators: [{ id: 'equals', label: 'Equals' }], values: { source: 'static', options: [{ value: 'server', label: 'Server' }, { value: 'workstation', label: 'Workstation' }] } },
    { id: 'offline', label: 'Offline', kind: 'bool', operators: [{ id: 'equals', label: 'Equals' }], values: { source: 'none' } },
  ],
  operators: [],
  limits: { rules: 50, groups: 20, depth: 3, value_length: 200 },
}

export const failure = (status, code, detail) => Object.assign(new Error(detail || `failed ${status}`), { status, code, payload: detail ? { detail, code } : null })

// answers: { fields, sets, values } each a function (call) => answer | Promise | throws. Calls: [{ path, options }].
export function fakeApi(answers = {}) {
  const calls = []
  const api = (path, options = {}) => {
    const call = { path, options }
    calls.push(call)
    let kind = 'other'
    if (path.startsWith('/api/tfd/filter-sets/fields/')) kind = 'fields'
    else if (path.startsWith('/api/tfd/filter-values/')) kind = 'values'
    else if (path.startsWith('/api/tfd/filter-sets/')) kind = 'sets'
    call.kind = kind
    const fn = answers[kind]
    try { return Promise.resolve(typeof fn === 'function' ? fn(call) : fn) } catch (error) { return Promise.reject(error) }
  }
  api.calls = calls
  api.of = (kind) => calls.filter((c) => c.kind === kind)
  return api
}

// Mounts one module's FilterEditor. Returns the root, the reactive props, the events and the service.
export async function mountEditor(service, { moduleId = 'agents', api, confirm, userId = 7, signedOut = false, abandoned = false, props = {} } = {}) {
  const state = { signedOut, abandoned, userId }
  const bound = service.forModule(moduleId, {
    api,
    confirm,
    getUserId: () => state.userId,
    isSignedOut: () => state.signedOut,
    isAbandoned: () => state.abandoned,
  })
  const st = reactive({ viewKey: 'agents', modelValue: null, disabled: false, ...props })
  const events = { update: [], apply: [] }
  const root = nodeOps.createElement('root')
  const app = createApp({
    render: () => h(bound.component, {
      viewKey: st.viewKey,
      modelValue: st.modelValue,
      disabled: st.disabled,
      'onUpdate:modelValue': (value) => events.update.push(value),
      onApply: (payload) => events.apply.push(payload),
    }),
  })
  app.mount(root)
  await flush()
  return { root, st, events, bound, state, unmount: () => app.unmount() }
}

// Opens the SearchSelect with this aria-label and chooses the row at index.
export async function choose(root, label, index) {
  const input = byLabel(root, label)[0]
  input.props.onFocus({ target: { select() {} } })
  await flush()
  const list = find(root, (n) => n.tag === 'ul' && n.props.role === 'listbox' && !n.props.hidden)[0]
  list.props.onMousedown({ preventDefault() {}, target: { closest: () => ({ dataset: { i: String(index) } }) } })
  await flush()
}

// Mounts any component with plain props (used for the one a loader handed to a module).
export async function mountComponent(component, props = {}, listeners = {}) {
  const root = nodeOps.createElement('root')
  const app = createApp({ render: () => h(component, { ...props, ...listeners }) })
  app.mount(root)
  await flush()
  return { root, unmount: () => app.unmount() }
}
