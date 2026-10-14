// 0.12.108 (Core 1.17.38, the CQ113 request): module preferences debounce rapid saves, offer flush(), and refuse Core's
// 503 audit_failed and 403 module_not_allowed in plain words. set() and remove() on one name within 400 ms are one request
// carrying the last operation; a 2 second maximum wait splits a held-down toggle; every merged caller gets the same outcome;
// get() and getAll() see a waiting write; clear() drops waiting writes; the signed-out and abandoned gates run at call time
// and when a write is sent; 403 module_not_allowed is remembered for the instance (hideControl); 429 and 404 pass through.
import assert from 'node:assert/strict'
import { mock } from 'node:test'

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

// The error Core's refusal becomes in api(): status, code and Core's own detail text.
function coreError(status, code, detail = 'Core detail: do not show this text') {
  return Object.assign(new Error(detail), { status, code, payload: { detail, code } })
}

// Lets the promise jobs that follow a timer run (the api call is async), without advancing fake time.
const flush = () => new Promise((resolve) => setImmediate(resolve))

// The error a call was refused with (or rejected with), awaited.
async function errorOf(promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  assert.fail('the call was not refused')
}

// A helper for one module, with optional gates.
function helperFor({ store = {}, fail = null, signedOut = false, abandoned = false } = {}) {
  const { api, calls } = fakeApi(store, fail)
  const gates = { signedOut, abandoned }
  const helper = createModulePreferencesService().forModule('endpoints', {
    api,
    isSignedOut: () => gates.signedOut,
    isAbandoned: () => gates.abandoned,
  })
  return { helper, calls, store, gates }
}

const tests = []
const test = (name, fn) => tests.push([name, fn])

test('ten set() calls inside the window send one PUT with the last value, and every promise resolves with it', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls, store } = helperFor()
    const promises = []
    for (let i = 1; i <= 10; i += 1) {
      promises.push(helper.set('header-collapsed', i))
      mock.timers.tick(10)
    }
    assert.equal(calls.length, 0, 'nothing is sent while the window is open')
    const done = Promise.all(promises)
    mock.timers.tick(400)
    const results = await done
    assert.deepEqual(results, Array(10).fill(10), 'every caller resolves with the stored value')
    assert.equal(calls.length, 1, 'one request')
    assert.equal(calls[0].method, 'PUT')
    assert.equal(calls[0].path, '/api/tfd/module-preferences/endpoints/header-collapsed/')
    assert.deepEqual(JSON.parse(calls[0].body), { value: 10 })
    assert.equal(store['header-collapsed'], 10)
  } finally {
    mock.timers.reset()
  }
})

test('a set then a remove on one name sends one DELETE; the set caller resolves undefined, the remove caller Core\'s answer (0.12.109)', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls, store } = helperFor({ store: { theme: 'old' } })
    const setting = helper.set('theme', 'new')
    const removing = helper.remove('theme')
    const done = Promise.all([setting, removing])
    mock.timers.tick(400)
    const [a, b] = await done
    assert.equal(calls.length, 1, 'one request')
    assert.equal(calls[0].method, 'DELETE')
    // 0.12.109: the set was superseded by the remove, so it stored nothing and resolves undefined. The remove is the last
    // operation, so it gets Core's answer (true: Core removed the row).
    assert.equal(a, undefined, 'the superseded set resolves undefined (0.12.109; 0.12.108 gave true)')
    assert.equal(b, true, 'the remove caller gets the boolean Core answered')
    assert.equal(Object.prototype.hasOwnProperty.call(store, 'theme'), false)
  } finally {
    mock.timers.reset()
  }
})

test('a continuous stream is split by the 2 second maximum wait', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls } = helperFor()
    const promises = []
    for (let i = 0; i < 25; i += 1) {
      promises.push(helper.set('header-collapsed', i))
      mock.timers.tick(100)
    }
    mock.timers.tick(400)
    await Promise.all(promises)
    const values = calls.filter((call) => call.method === 'PUT').map((call) => JSON.parse(call.body).value)
    assert.deepEqual(values, [19, 24], 'the first write is sent at 2 seconds with the value of that window, then the rest')
  } finally {
    mock.timers.reset()
  }
})

test('two names send two requests, each with its own last value', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls, store } = helperFor()
    const a = helper.set('alpha', 1)
    const b = helper.set('beta', 2)
    helper.set('alpha', 3)
    mock.timers.tick(400)
    await Promise.all([a, b])
    assert.equal(calls.length, 2)
    assert.deepEqual(store, { alpha: 3, beta: 2 })
  } finally {
    mock.timers.reset()
  }
})

test('get and getAll see a waiting write: the pending value, or absent after a pending remove', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, store } = helperFor({ store: { alpha: 'stored', gone: 'old' } })
    const setting = helper.set('alpha', 'pending')
    const removing = helper.remove('gone')
    assert.equal(await helper.get('alpha', 'fallback'), 'pending', 'get sees the waiting value')
    assert.equal(await helper.get('gone', 'fallback'), 'fallback', 'get sees a waiting remove as absent')
    assert.deepEqual(await helper.getAll(), { alpha: 'pending' })
    mock.timers.tick(400)
    await Promise.all([setting, removing])
    assert.equal(store.alpha, 'pending')
    assert.equal(await helper.get('alpha', 'fallback'), 'pending', 'after the write, get reads what Core stored')
  } finally {
    mock.timers.reset()
  }
})

test('validation errors are thrown before anything is queued, and nothing is sent', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls } = helperFor()
    assert.equal((await errorOf(helper.set('Bad Name', 1))).code, 'invalid_name')
    assert.equal((await errorOf(helper.set('ok', undefined))).code, 'invalid_value')
    assert.equal((await errorOf(helper.remove('Bad Name'))).code, 'invalid_name')
    mock.timers.tick(5000)
    await flush()
    assert.equal(calls.length, 0, 'no request for a refused name or value')
  } finally {
    mock.timers.reset()
  }
})

test('503 audit_failed on PUT rejects with the plain message, keeps 503 and the code, and the stored value stays', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, store } = helperFor({ store: { 'header-collapsed': false }, fail: (method) => (method === 'PUT' ? coreError(503, 'audit_failed') : null) })
    const pending = helper.set('header-collapsed', true)
    mock.timers.tick(400)
    const error = await errorOf(pending)
    assert.equal(error.message, 'Your change was not saved. Tec-Tac could not record it, so the old value stays. Try again in a moment.')
    assert.equal(error.status, 503)
    assert.equal(error.code, 'audit_failed')
    assert.equal(error.payload, null, "Core's detail is not kept")
    assert.doesNotMatch(error.message, /Core detail/)
    assert.equal(store['header-collapsed'], false)
    assert.equal(await helper.get('header-collapsed', 'fallback'), false, 'a later get returns the stored value, not the failed one')
  } finally {
    mock.timers.reset()
  }
})

test('503 audit_failed on DELETE is refused the same way', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, store } = helperFor({ store: { 'header-collapsed': true }, fail: (method) => (method === 'DELETE' ? coreError(503, 'audit_failed') : null) })
    const pending = helper.remove('header-collapsed')
    mock.timers.tick(400)
    const error = await errorOf(pending)
    assert.equal(error.status, 503)
    assert.equal(error.code, 'audit_failed')
    assert.equal(error.message, 'Your change was not saved. Tec-Tac could not record it, so the old value stays. Try again in a moment.')
    assert.equal(store['header-collapsed'], true)
    assert.equal(await helper.get('header-collapsed', 'fallback'), true)
  } finally {
    mock.timers.reset()
  }
})

test('403 module_not_allowed on PUT, DELETE and GET rejects in plain words with hideControl, and the next call is refused with no request', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const message = 'You may not use this module, so its settings are not available to you.'
    // PUT
    {
      const { helper, calls } = helperFor({ fail: () => coreError(403, 'module_not_allowed') })
      const pending = helper.set('header-collapsed', true)
      mock.timers.tick(400)
      const error = await errorOf(pending)
      assert.equal(error.message, message)
      assert.equal(error.status, 403)
      assert.equal(error.code, 'module_not_allowed')
      assert.equal(error.hideControl, true)
      const before = calls.length
      const again = await errorOf(helper.set('header-collapsed', false))
      assert.equal(calls.length, before, 'the next call is refused with no request')
      assert.equal(again, error, 'the same error is refused again')
      assert.equal((await errorOf(helper.get('header-collapsed'))).code, 'module_not_allowed', 'get is refused too')
      assert.equal(calls.length, before)
    }
    // DELETE
    {
      const { helper, calls } = helperFor({ fail: (method) => (method === 'DELETE' ? coreError(403, 'module_not_allowed') : null) })
      const pending = helper.remove('header-collapsed')
      mock.timers.tick(400)
      const error = await errorOf(pending)
      assert.equal(error.message, message)
      assert.equal(error.hideControl, true)
      const before = calls.length
      assert.equal((await errorOf(helper.remove('header-collapsed'))).code, 'module_not_allowed')
      assert.equal(calls.length, before)
    }
    // GET
    {
      const { helper, calls } = helperFor({ fail: (method) => (method === 'GET' ? coreError(403, 'module_not_allowed') : null) })
      const error = await errorOf(helper.getAll())
      assert.equal(error.message, message)
      assert.equal(error.status, 403)
      assert.equal(error.hideControl, true)
      const before = calls.length
      assert.equal((await errorOf(helper.get('header-collapsed', 1))).code, 'module_not_allowed')
      assert.equal(calls.length, before)
    }
  } finally {
    mock.timers.reset()
  }
})

test('429 and 404 pass through unchanged; other refusals are not turned into plain messages', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const tooMany = coreError(429, 'rate_limited', 'Slow down')
    const { helper: limited } = helperFor({ fail: () => tooMany })
    const pending = limited.set('header-collapsed', true)
    mock.timers.tick(400)
    assert.equal(await errorOf(pending), tooMany, 'the 429 error is the same object')
    const missing = coreError(404, 'module_not_found', 'No such module')
    const { helper: absent } = helperFor({ fail: () => missing })
    assert.equal(await errorOf(absent.get('header-collapsed')), missing, 'the 404 error passes through')
  } finally {
    mock.timers.reset()
  }
})

test('the merged callers of a refused write all get the same error', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper } = helperFor({ fail: () => coreError(503, 'audit_failed') })
    const first = helper.set('header-collapsed', 1)
    const second = helper.set('header-collapsed', 2)
    mock.timers.tick(400)
    const errors = await Promise.all([errorOf(first), errorOf(second)])
    assert.equal(errors[0], errors[1], 'one request, one outcome')
    assert.equal(errors[0].code, 'audit_failed')
  } finally {
    mock.timers.reset()
  }
})

test('clear() drops waiting writes, rejects their callers as unloaded, sends nothing, and refuses later calls', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls } = helperFor()
    // Attach the rejection handlers at once, so an early rejection is never unhandled.
    const first = errorOf(helper.set('header-collapsed', true))
    const second = errorOf(helper.remove('other'))
    helper.clear()
    const [a, b] = await Promise.all([first, second])
    assert.match(a.message, /was unloaded/)
    assert.match(b.message, /was unloaded/)
    mock.timers.tick(5000)
    await flush()
    assert.equal(calls.length, 0, 'nothing is sent after clear()')
    assert.match((await errorOf(helper.get('header-collapsed'))).message, /was unloaded/)
  } finally {
    mock.timers.reset()
  }
})

test('flush() sends waiting writes now and resolves when they are done', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper, calls, store } = helperFor()
    const pending = helper.set('header-collapsed', 'now')
    await helper.flush()
    assert.equal(calls.length, 1, 'sent without waiting for the window')
    assert.equal(store['header-collapsed'], 'now')
    assert.equal(await pending, 'now')
    // With nothing waiting, flush() resolves at once.
    await helper.flush()
    assert.equal(calls.length, 1)
  } finally {
    mock.timers.reset()
  }
})

test('flush() resolves even when a write fails; the failure goes to the write\'s own caller', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    const { helper } = helperFor({ fail: () => coreError(503, 'audit_failed') })
    const outcome = errorOf(helper.set('header-collapsed', true))
    await helper.flush()
    const error = await outcome
    assert.equal(error.code, 'audit_failed')
  } finally {
    mock.timers.reset()
  }
})

test('the signed-out and abandoned gates refuse at call time and again when the write is sent', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  try {
    // At call time
    {
      const { helper, calls } = helperFor({ signedOut: true })
      const error = await errorOf(helper.set('header-collapsed', true))
      assert.equal(error.code, 'signed_out')
      assert.equal(error.status, 401)
      assert.equal(calls.length, 0)
    }
    // Signed out after the call, before the window closes
    {
      const { helper, calls, gates } = helperFor()
      const pending = errorOf(helper.set('header-collapsed', true))
      gates.signedOut = true
      mock.timers.tick(400)
      assert.equal((await pending).code, 'signed_out')
      assert.equal(calls.length, 0, 'nothing is sent once the person has signed out')
    }
    // Abandoned after the call, before the window closes
    {
      const { helper, calls, gates } = helperFor()
      const pending = errorOf(helper.remove('header-collapsed'))
      gates.abandoned = true
      mock.timers.tick(400)
      assert.match((await pending).message, /was abandoned/)
      assert.equal(calls.length, 0)
    }
  } finally {
    mock.timers.reset()
  }
})

for (const [name, fn] of tests) {
  await fn()
  console.log(`ok - ${name}`)
}

console.log('module-preferences-debounce-0.12.108: PASS')
