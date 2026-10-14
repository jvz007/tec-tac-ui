// 0.12.109 (held Low from the 0.12.108 review): a set() and a remove() on one name within 400 ms still send one request with the
// last operation, but each caller gets a resolved value of its own call's type. A set() superseded by a remove() resolves
// undefined; a remove() superseded by a set() resolves false. A caller whose operation was the last gets Core's answer. Every
// merged caller still gets the same rejection. Built on the fakeApi harness of module-preferences-debounce-0.12.108.mjs.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mock } from 'node:test'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { createModulePreferencesService } = await import(new URL('../src/module-preferences.js', import.meta.url).href)

// A fake api that answers as Core does, records each call, and can be told to fail a request.
function fakeApi(store = {}, fail = null) {
  const calls = []
  const api = async (path, options = {}) => {
    const method = options.method || 'GET'
    calls.push({ path, method, body: options.body })
    const m = /^\/api\/tfd\/module-preferences\/([^/]+)\/(?:([^/]+)\/)?$/.exec(path)
    if (!m) throw new Error(`unexpected path ${path}`)
    const name = m[2]
    const failure = fail ? fail(method, name) : null
    if (failure) throw failure
    if (method === 'PUT') {
      const value = JSON.parse(options.body).value
      store[name] = value
      return { module_id: m[1], name, value }
    }
    if (method === 'DELETE') {
      const existed = Object.prototype.hasOwnProperty.call(store, name)
      delete store[name]
      return { module_id: m[1], name, deleted: existed }
    }
    return { module_id: m[1], preferences: { ...store } }
  }
  return { api, calls }
}

function coreError(status, code, detail = 'Core detail: do not show this text') {
  return Object.assign(new Error(detail), { status, code, payload: { detail, code } })
}

async function errorOf(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  assert.fail('the call was not refused')
}

function helperFor({ store = {}, fail = null } = {}) {
  const { api, calls } = fakeApi(store, fail)
  const helper = createModulePreferencesService().forModule('endpoints', {
    api,
    isSignedOut: () => false,
    isAbandoned: () => false,
  })
  return { helper, calls, store }
}

const tests = []
const test = (name, fn) => tests.push([name, fn])

test('set then remove: one DELETE; the set caller resolves undefined and the remove caller Core\'s true', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls, store } = helperFor({ store: { theme: 'old' } })
    const setting = helper.set('theme', 'new')
    const removing = helper.remove('theme')
    mock.timers.tick(400)
    const [a, b] = await Promise.all([setting, removing])
    assert.equal(calls.length, 1, 'one request')
    assert.equal(calls[0].method, 'DELETE')
    assert.equal(a, undefined, 'the superseded set stored nothing')
    assert.equal(b, true, 'Core removed the row')
    assert.equal(Object.prototype.hasOwnProperty.call(store, 'theme'), false)
  } finally {
    mock.timers.reset()
  }
})

test('set then remove when Core had no row: the remove caller resolves false as Core answered', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls } = helperFor({ store: {} })
    const setting = helper.set('theme', 'new')
    const removing = helper.remove('theme')
    mock.timers.tick(400)
    const [a, b] = await Promise.all([setting, removing])
    assert.equal(calls.length, 1)
    assert.equal(a, undefined)
    assert.equal(b, false, 'Core had no row, so it removed nothing')
  } finally {
    mock.timers.reset()
  }
})

test('remove then set: one PUT; the remove caller resolves false and the set caller the stored value', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls, store } = helperFor({ store: { theme: 'old' } })
    const removing = helper.remove('theme')
    const setting = helper.set('theme', 'new')
    mock.timers.tick(400)
    const [a, b] = await Promise.all([removing, setting])
    assert.equal(calls.length, 1, 'one request')
    assert.equal(calls[0].method, 'PUT')
    assert.deepEqual(JSON.parse(calls[0].body), { value: 'new' })
    assert.equal(a, false, 'the superseded remove removed nothing this time')
    assert.equal(b, 'new', 'the set caller gets the stored value')
    assert.equal(store.theme, 'new')
  } finally {
    mock.timers.reset()
  }
})

test('set, remove, set: one PUT with the last value; the two set callers get it and the remove caller false', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls } = helperFor({ store: {} })
    const first = helper.set('theme', 1)
    const removing = helper.remove('theme')
    const last = helper.set('theme', 3)
    mock.timers.tick(400)
    const results = await Promise.all([first, removing, last])
    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, 'PUT')
    assert.deepEqual(JSON.parse(calls[0].body), { value: 3 })
    assert.deepEqual(results, [3, false, 3], 'the last operation is a set, so both set callers get the stored value; the remove was superseded and gets false')
  } finally {
    mock.timers.reset()
  }
})

test('remove, set, remove: one DELETE; the two remove callers get Core\'s answer and the set caller undefined', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls } = helperFor({ store: { theme: 'old' } })
    const first = helper.remove('theme')
    const setting = helper.set('theme', 'new')
    const last = helper.remove('theme')
    mock.timers.tick(400)
    const results = await Promise.all([first, setting, last])
    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, 'DELETE')
    // The last operation is a remove, so every remove caller gets Core's answer; the set caller gets undefined.
    assert.deepEqual(results, [true, undefined, true], 'the last operation is a remove: both remove callers get Core\'s answer, the set caller gets undefined')
  } finally {
    mock.timers.reset()
  }
})

test('a plain set run still gives every caller the stored value', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls } = helperFor()
    const promises = [helper.set('header-collapsed', 1), helper.set('header-collapsed', 2), helper.set('header-collapsed', 3)]
    mock.timers.tick(400)
    assert.deepEqual(await Promise.all(promises), [3, 3, 3])
    assert.equal(calls.length, 1)
  } finally {
    mock.timers.reset()
  }
})

test('a plain remove run still gives every caller Core\'s boolean', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls } = helperFor({ store: { theme: 'old' } })
    const promises = [helper.remove('theme'), helper.remove('theme')]
    mock.timers.tick(400)
    assert.deepEqual(await Promise.all(promises), [true, true])
    assert.equal(calls.length, 1)
  } finally {
    mock.timers.reset()
  }
})

test('a 403 module_not_allowed on a merged set and remove rejects both callers with the same error', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper } = helperFor({ fail: () => coreError(403, 'module_not_allowed') })
    const setting = errorOf(helper.set('theme', 'new'))
    const removing = errorOf(helper.remove('theme'))
    mock.timers.tick(400)
    const [a, b] = await Promise.all([setting, removing])
    assert.equal(a, b, 'one request, one rejection')
    assert.equal(a.code, 'module_not_allowed')
    assert.equal(a.hideControl, true)
  } finally {
    mock.timers.reset()
  }
})

test('a 503 audit_failed on a merged remove and set rejects both callers with the plain message', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, store } = helperFor({ store: { theme: 'old' }, fail: () => coreError(503, 'audit_failed') })
    const removing = errorOf(helper.remove('theme'))
    const setting = errorOf(helper.set('theme', 'new'))
    mock.timers.tick(400)
    const [a, b] = await Promise.all([removing, setting])
    assert.equal(a, b)
    assert.equal(a.status, 503)
    assert.equal(a.code, 'audit_failed')
    assert.doesNotMatch(a.message, /Core detail/)
    assert.equal(store.theme, 'old', 'the stored value stays')
  } finally {
    mock.timers.reset()
  }
})

test('the docs state the per-type results, and the source has the own-operation rule', async () => {
  const doc = read('../docs/module-preferences.md')
  const source = read('../src/module-preferences.js')
  assert.ok(doc.includes('Every call whose write was merged gets the same rejection.'), 'the docs say the rejection is shared')
  assert.ok(doc.includes('Every `remove()` in the window resolves `false`'), 'the docs give the remove rule when a set is last')
  assert.ok(doc.includes('Every `set()` in the window resolves `undefined`'), 'the docs give the set rule when a remove is last')
  assert.doesNotMatch(doc, /same resolved value/, 'the old shared resolved value is gone from the docs')
  assert.match(source, /function ownResult\(caller, write, value\)/)
  assert.match(source, /caller\.resolve\(ownResult\(caller, write, value\)\)/)
})

for (const [name, fn] of tests) {
  await fn()
  console.log(`ok - ${name}`)
}

console.log('module-preferences-merged-result-0.12.109: PASS')
