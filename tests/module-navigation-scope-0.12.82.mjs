import assert from 'node:assert/strict'
import fs from 'node:fs'

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])

function fixture() {
  const routes = []
  const navigation = []
  const router = {
    currentRoute: { value: { path: '/', fullPath: '/' } },
    getRoutes: () => routes,
    addRoute(route) {
      routes.push(route)
      return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1) }
    },
    replace: async () => {},
  }
  const runtime = {
    state: { context: { permissions: [], user: {}, module_register_timeout_seconds: 30 }, contextSource: 'backend' },
    router,
    addNavigation(item) { navigation.push(item) },
    removeNavigation(moduleId) {
      for (let i = navigation.length - 1; i >= 0; i -= 1) if (navigation[i].moduleId === moduleId) navigation.splice(i, 1)
    },
    api: async () => {}, apiRaw: async () => {}, apiBlob: async () => {}, apiText: async () => {},
  }
  return { runtime, navigation }
}

globalThis.__seen = {}
const a = entry(`export default { async register(ctx) { ctx.addNavigation({ to: '/a', label: 'A' }) } }`)
const b = entry(`export default { async register(ctx) {
  ctx.addNavigation({ to: '/b', label: 'B' })
  let threw = false
  try { ctx.removeNavigation?.('a') } catch { threw = true }
  globalThis.__seen = { type: typeof ctx.removeNavigation, keys: Object.keys(ctx), threw }
} }`)
const failing = entry(`export default { async register(ctx) { ctx.addNavigation({ to: '/f', label: 'F' }); throw new Error('boom') } }`)
const hanging = entry(`export default { register(ctx) { ctx.addNavigation({ to: '/h', label: 'H' }); return new Promise(() => {}) } }`)

const f = fixture()
const result = await loader.loadUiModules(f.runtime, [
  { id: 'a', entry: a, permissions: [], allowed: true },
  { id: 'b', entry: b, permissions: [], allowed: true },
  { id: 'failing', entry: failing, permissions: [], allowed: true },
  { id: 'hanging', entry: hanging, permissions: [], allowed: true },
], { timeoutMs: 50 })

assert.deepEqual(result.loaded, ['a', 'b'])
assert.deepEqual(result.failed.map((row) => row.id), ['failing', 'hanging'])
assert.equal(globalThis.__seen.type, 'undefined', 'removeNavigation must not reach a module')
assert.equal(globalThis.__seen.keys.includes('removeNavigation'), false)
assert.equal(globalThis.__seen.keys.includes('addNavigation'), true, 'addNavigation stays')
assert.equal(globalThis.__seen.threw, false)
assert.deepEqual(f.navigation.map((item) => item.moduleId).sort(), ['a', 'b'], 'A survives B; failed and timed-out modules lose their items')
assert.equal(f.navigation.some((item) => item.to === '/f' || item.to === '/h'), false)

const source = fs.readFileSync(new URL('../src/module-loader.js', import.meta.url), 'utf8')
assert.match(source, /runtime\.removeNavigation\?\.\(descriptor\.id\)/, 'the loader keeps removing a failed module\'s items')
const docs = fs.readFileSync(new URL('../docs/module-runtime-api.md', import.meta.url), 'utf8')
assert.match(docs, /Modules cannot remove navigation/)

console.log('[TEST] module navigation scope (0.12.82) OK')
