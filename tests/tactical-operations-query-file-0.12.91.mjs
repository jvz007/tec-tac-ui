// 0.12.91: tacticalOperation options query and file (Core 1.17.13).
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { createTacticalOperation } = await import('../src/tactical-operations.js')

let calls = []
let reply = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
const apiRaw = async (path, init) => { calls.push({ path, init }); return reply() }
const op = createTacticalOperation({ apiRaw })
const refused = async (options, pattern) => {
  calls = []
  await assert.rejects(() => op('reportmanager', 'upload-asset', options), (e) => {
    assert.equal(e.status, 0)
    assert.equal(e.payload, null)
    assert.equal(e.code, null)
    if (pattern) assert.match(e.message, pattern)
    return true
  })
  assert.equal(calls.length, 0, 'nothing is sent')
}

// (1) a call written for 0.12.90 sends exactly the same bytes
await op('reportmanager', 'list', { params: { a: 'b' }, body: { x: 1 } })
assert.equal(calls[0].path, '/api/tfd/tactical-operations/reportmanager/list/')
assert.equal(calls[0].init.method, 'POST')
assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json' })
assert.equal(calls[0].init.body, '{"params":{"a":"b"},"body":{"x":1}}')
calls = []
await op('reportmanager', 'list')
assert.equal(calls[0].init.body, '{"params":{},"body":{}}')

// (2) query call
calls = []
await op('reportmanager', 'list', { params: { id: 1 }, query: { page: 2, name: 'a b' } })
assert.equal(calls[0].init.body, '{"params":{"id":1},"body":{},"query":{"page":2,"name":"a b"}}')
assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json' })
calls = []
await op('reportmanager', 'list', { query: {} })
assert.equal(calls[0].init.body, '{"params":{},"body":{},"query":{}}')

// (3) query refusals
await refused({ query: { a: { b: 1 } } })
await refused({ query: { a: [1] } })
await refused({ query: { a: true } })
await refused({ query: { a: 1.5 } })
await refused({ query: { a: Infinity } })
await refused({ query: { a: null } })
await refused({ query: { a: 'x'.repeat(513) } })
await refused({ query: { a: 'bad\nvalue' } })
await refused({ query: { a: 'tab\there' } })
await refused({ query: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, 'v'])) })
await refused({ query: { 'bad key': 'v' } })
await refused({ query: { '': 'v' } })
await refused({ query: ['a'] })
await refused({ query: 'a=b' })
await refused({ query: null })
calls = []
await op('reportmanager', 'list', { query: { a: 'x'.repeat(512) } })
await op('reportmanager', 'list', { query: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`k${i}`, i])) })
assert.equal(calls.length, 2, 'the limits themselves are allowed')

// (4) file call: multipart with named parts, no Content-Type header
const file = new File(['hello'], 'logo.png', { type: 'image/png' })
calls = []
await op('reportmanager', 'upload-asset', { params: { id: 'r1' }, body: { note: 'n' }, query: { v: 3 }, file })
const init = calls[0].init
assert.equal(init.method, 'POST')
assert.ok(init.body instanceof FormData)
assert.equal(init.headers, undefined, 'the browser writes the multipart boundary')
assert.deepEqual([...init.body.keys()], ['params', 'body', 'query', 'logo.png'])
assert.equal(init.body.get('params'), '{"id":"r1"}')
assert.equal(init.body.get('body'), '{"note":"n"}')
assert.equal(init.body.get('query'), '{"v":3}')
const part = init.body.get('logo.png')
assert.equal(part.name, 'logo.png')
assert.equal(await part.text(), 'hello')
calls = []
await op('reportmanager', 'upload-asset', { file })
assert.deepEqual([...calls[0].init.body.keys()], ['params', 'body', 'logo.png'], 'no query part unless given')
assert.equal(calls[0].init.body.get('params'), '{}')

// a Blob that carries a name (like a File) is accepted
calls = []
const named = Object.assign(new Blob(['z']), { name: 'n.txt' })
await op('reportmanager', 'upload-asset', { file: named })
assert.equal(calls.length, 1)

// (5) file refusals, before any request
await refused({ file: new Blob(['x']) }, /file/)
await refused({ file: 'logo.png' })
await refused({ file: null })
await refused({ file: { name: 'a.png' } })
await refused({ file: [file, file] })
await refused({ file: new File(['x'], 'bad\nname.png') })
await refused({ file: new File(['x'], `${'a'.repeat(256)}`) })
await refused({ file: new File(['x'], 'params') })
await refused({ file: new File(['x'], '') })
// a bad query with a good file is still refused
await refused({ file, query: { a: true } })
// validation order: params and body first
await refused({ file, params: { a: {} } }, /param/)
await refused({ file, body: [] }, /body/)

// (6) signal passes, with and without a file
const ctl = new AbortController()
calls = []
await op('reportmanager', 'list', { signal: ctl.signal })
await op('reportmanager', 'upload-asset', { file, signal: ctl.signal })
assert.equal(calls[0].init.signal, ctl.signal)
assert.equal(calls[1].init.signal, ctl.signal)

// (7) Core refusal codes pass through
for (const code of ['upload_too_large', 'query_field_not_allowed', 'invalid_query', 'upload_not_allowed', 'upload_type_not_allowed', 'invalid_upload']) {
  const err = Object.assign(new Error('Core said no'), { status: 413, payload: { code }, code })
  const failing = createTacticalOperation({ apiRaw: async () => { throw err } })
  await assert.rejects(() => failing('reportmanager', 'upload-asset', { file }), (e) => e.code === code && e.status === 413 && e.payload.code === code)
}

// (8) source: no token, no auth header, no storage
const source = fs.readFileSync(new URL('../src/tactical-operations.js', import.meta.url), 'utf8')
assert.ok(!/localStorage|sessionStorage|Authorization|access_token/.test(source))
assert.ok(!/^import /m.test(source), 'stays import-free')
const docs = fs.readFileSync(new URL('../docs/module-runtime-api.md', import.meta.url), 'utf8')
assert.match(docs, /\{ params, body, query, file, signal \}/)
assert.match(docs, /multipart\/form-data/)
assert.match(docs, /Core 1\.17\.13/)
assert.match(docs, /UI 0\.12\.91/)
console.log('tactical-operations-query-file-0.12.91: ok')
