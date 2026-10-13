// 0.12.97 (held Low from 0.12.96): the confirm a context action handler receives honours the loader's isAbandoned, like
// register(context).confirm does. A handler of a module that failed or timed out in register() cannot open the dialog.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const { createContextActionRegistry } = await import('../src/context-actions.js')
const { loadUiModules } = await import(dataUrl(read('../src/module-loader.js').replace("import * as Vue from 'vue'", 'const Vue = {}')))

const CTX = { selection: [{ id: 1 }] }
const ABANDONED = 'module m was abandoned after a failed or timed-out register(); confirm() is refused'
const action = (id, execute) => ({ id, resource: 'endpoint', label: 'Do it', placements: ['endpoint.context-menu'], execute })

// (1) forModule with isAbandoned: confirm resolves while false, rejects once true, and the shell dialog is not called after.
{
  const asked = []
  const registry = createContextActionRegistry({ confirm: async (options, askedBy) => { asked.push([options.question, askedBy]); return true } })
  let abandoned = false
  const mod = registry.forModule('m', { isAbandoned: () => abandoned })
  mod.register(action('m.go', (context) => context.confirm({ question: 'Go?' })))
  assert.equal(await registry.execute('m.go', CTX), true)
  assert.deepEqual(asked, [['Go?', 'm']])
  abandoned = true
  await assert.rejects(() => registry.execute('m.go', CTX), (error) => error.message === ABANDONED)
  await assert.rejects(() => mod.execute('m.go', CTX), (error) => error.message === ABANDONED)
  assert.equal(asked.length, 1, 'the dialog is not opened after the module is abandoned')
}

// (2) A registry or forModule without the option is unchanged.
{
  const asked = []
  const registry = createContextActionRegistry({ confirm: async (options) => { asked.push(options.question); return false } })
  registry.forModule('plain').register(action('plain.go', (context) => context.confirm({ question: 'Plain?' })))
  assert.equal(await registry.execute('plain.go', CTX), false)
  registry.forModule('plain2', {}).register(action('plain2.go', (context) => context.confirm({ question: 'Plain2?' })))
  assert.equal(await registry.execute('plain2.go', CTX), false)
  assert.deepEqual(asked, ['Plain?', 'Plain2?'])
  // No confirm service: the context is passed through as before.
  const bare = createContextActionRegistry({})
  bare.forModule('b', { isAbandoned: () => true }).register(action('b.go', (context) => typeof context.confirm))
  assert.equal(await bare.execute('b.go', CTX), 'undefined')
  // The snapshot does not carry the function.
  registry.forModule('s', { isAbandoned: () => false }).register(action('s.go', () => 1))
  assert.ok(registry.snapshot().every((row) => !('isAbandoned' in row)))
}

// (3) Through loadUiModules: a module whose register() times out has its action handler's confirm refused.
{
  const asked = []
  const registry = createContextActionRegistry({ confirm: async (options) => { asked.push(options.question); return true } })
  let release
  const gate = new Promise((resolve) => { release = resolve })
  globalThis.__gate = gate
  const entry = dataUrl(`// ${Math.random()}
export default {
  register(context) {
    context.contextActions.register({
      id: 'm.go', resource: 'endpoint', label: 'Do it', placements: ['endpoint.context-menu'],
      execute: async (ctx) => { await globalThis.__gate; return ctx.confirm({ question: 'Late?' }) },
    });
    return new Promise(() => {});
  },
};`)
  const runtime = {
    app: {},
    router: { getRoutes: () => [], addRoute() { return () => {} } },
    state: { context: { permissions: [], user: {}, module_status: [] }, contextSource: 'backend' },
    addNavigation() {},
    removeNavigation() {},
    contextActions: registry,
    confirm: async () => true,
  }
  // The action is registered before the time limit, so it can be started while register() is still pending.
  const loading = loadUiModules(runtime, [{ id: 'm', entry, dependencies: [], permissions: [] }], { timeoutMs: 80 })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const inFlight = registry.execute('m.go', CTX)
  const result = await loading
  assert.deepEqual(result.failed.map((row) => row.id), ['m'], 'the module timed out')
  release()
  await assert.rejects(() => inFlight, (error) => error.message === ABANDONED)
  assert.deepEqual(asked, [], 'the shell dialog was never opened')
  delete globalThis.__gate
}

// (4) Source: the loader passes isAbandoned, and the shell's own execute path stays as it was.
const loader = read('../src/module-loader.js')
assert.ok(loader.includes('runtime.contextActions?.forModule(descriptor.id, { isAbandoned })'))
assert.ok(read('../docs/context-actions.md').includes('abandoned'))

console.log('context-action-confirm-abandoned-0.12.97: PASS')
