// 0.12.87: context.tacticalOperation(moduleId, operationId, { params, body, signal }).
import assert from 'node:assert/strict'
import fs from 'node:fs'

const storage = new Map([['access_token', 'abc123']])
let storageReads = 0
globalThis.localStorage = {
  getItem(key) { storageReads += 1; return storage.has(key) ? storage.get(key) : null },
  setItem(key, value) { storage.set(key, String(value)) },
  removeItem(key) { storage.delete(key) },
}
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }

const { apiRaw } = await import('../src/api.js')
const { createTacticalOperation, parseContentDisposition } = await import('../src/tactical-operations.js')
const op = createTacticalOperation({ apiRaw })

let calls = []
function respond(make) {
  calls = []
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return make() }
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

// URL and body are exact; no caller headers or audit field are sent.
respond(() => json({ ok: 1 }, 200, { 'X-Tec-Tac-Audit': 'recorded' }))
let r = await op('checks', 'run-checks', { params: { agent_id: 'abc', pk: 5 }, body: { force: true }, headers: { 'X-Evil': '1' }, audit: { outcome: 'success' } })
assert.equal(calls.length, 1)
assert.equal(calls[0].url, 'https://rmm.example.test/api/tfd/tactical-operations/checks/run-checks/')
assert.equal(calls[0].init.method, 'POST')
assert.equal(calls[0].init.body, JSON.stringify({ params: { agent_id: 'abc', pk: 5 }, body: { force: true } }))
assert.equal(calls[0].init.headers.get('x-evil'), null)
assert.equal(JSON.parse(calls[0].init.body).audit, undefined)
assert.equal(calls[0].init.headers.get('authorization'), 'Token abc123', 'the shared transport adds the token')
assert.deepEqual(r.data, { ok: 1 })
assert.equal(r.ok, true)
assert.equal(r.status, 200)
assert.equal(r.audit, 'recorded')
assert.equal(r.auditRecorded, true)

// Defaults.
respond(() => json({}))
await op('checks', 'list')
assert.equal(calls[0].init.body, JSON.stringify({ params: {}, body: {} }))

// A signal is passed through.
const controller = new AbortController()
respond(() => json({}))
await op('checks', 'list', { signal: controller.signal })
assert.equal(calls[0].init.signal, controller.signal)

// Bad ids, params and body: refused before any request.
for (const [m, o] of [['a/b', 'x'], ['..', 'x'], ['a%2fb', 'x'], ['a b', 'x'], ['checks', 'x/y'], ['checks', '../x'], ['checks', '%2e'], ['checks', 'a b'], ['', 'x'], ['checks', ''], [5, 'x'], ['checks', null], ['.a', 'x'], ['checks', '-x']]) {
  respond(() => json({}))
  await assert.rejects(() => op(m, o), (e) => e instanceof Error && e.status === 0)
  assert.equal(calls.length, 0, `${m} ${o}`)
}
for (const bad of [
  { params: [] }, { params: 'x' }, { params: null }, { params: { a: {} } }, { params: { a: [1] } }, { params: { a: null } }, { params: { a: true } }, { params: { a: NaN } },
  { body: [] }, { body: 'x' }, { body: null }, { body: 5 },
]) {
  respond(() => json({}))
  await assert.rejects(() => op('checks', 'run-checks', bad), (e) => e.status === 0)
  assert.equal(calls.length, 0)
}
await assert.rejects(() => op('checks', 'run-checks', 'x'), (e) => e.status === 0)

// Response shapes: text, 204, JSON.
respond(() => new Response('plain words', { status: 200, headers: { 'content-type': 'text/plain' } }))
r = await op('checks', 'a')
assert.equal(r.data, 'plain words')
assert.equal(r.blob, null)
respond(() => new Response(null, { status: 204 }))
r = await op('checks', 'a')
assert.equal(r.data, null)
assert.equal(r.status, 204)
assert.equal(r.audit, '')
assert.equal(r.auditRecorded, null)

// A file answer keeps its type and disposition; filename* wins.
respond(() => new Response('PDFDATA', { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="plain.pdf"; filename*=UTF-8\'\'r%C3%A9sum%C3%A9.pdf' } }))
r = await op('reportmanager', 'download')
assert.equal(r.data, null)
assert.equal(await r.blob.text(), 'PDFDATA')
assert.equal(r.contentType, 'application/pdf')
assert.match(r.contentDisposition, /^attachment/)
assert.equal(r.filename, 'résumé.pdf')
respond(() => new Response('a,b', { status: 200, headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="rows.csv"' } }))
r = await op('reportmanager', 'download')
assert.equal(r.filename, 'rows.csv')
assert.ok(r.blob)
assert.equal(parseContentDisposition(''), '')
assert.equal(parseContentDisposition('inline'), '')
respond(() => new Response('BIN', { status: 200, headers: { 'content-type': 'application/octet-stream' } }))
r = await op('reportmanager', 'download')
assert.ok(r.blob)
assert.equal(r.filename, '')

// Audit header values.
for (const [raw, audit, flag] of [['recorded', 'recorded', true], ['not-recorded', 'not-recorded', false], ['maybe', '', null], ['RECORDED', '', null], [null, '', null]]) {
  respond(() => json({}, 200, raw === null ? {} : { 'X-Tec-Tac-Audit': raw }))
  r = await op('checks', 'a')
  assert.equal(r.audit, audit)
  assert.equal(r.auditRecorded, flag)
}

// Refusals pass through with status and payload.code.
for (const [status, code] of [[403, 'tactical_permission_denied'], [404, 'object_not_found'], [429, 'rate_limited']]) {
  respond(() => json({ detail: 'refused', code }, status))
  await assert.rejects(() => op('checks', 'a'), (e) => e.status === status && e.payload.code === code && e.code === code)
}
// A 5xx exposes the audit header, without enumerating it.
respond(() => json({ detail: 'bad gateway' }, 502, { 'X-Tec-Tac-Audit': 'not-recorded' }))
await assert.rejects(() => op('checks', 'a'), (e) => {
  assert.equal(e.status, 502)
  assert.equal(e.headers.get('X-Tec-Tac-Audit'), 'not-recorded')
  assert.equal(Object.keys(e).includes('headers'), false)
  assert.equal(JSON.stringify(Object.keys(e).sort()), JSON.stringify(['code', 'payload', 'status']))
  return true
})

// Source scan: the new file never touches storage or builds an auth header.
const source = fs.readFileSync(new URL('../src/tactical-operations.js', import.meta.url), 'utf8').split(/\r?\n/).filter((line) => !line.trim().startsWith('//')).join(' ')
assert.doesNotMatch(source, /localStorage|sessionStorage|Authorization|Token |fetch\(/i)
assert.doesNotMatch(fs.readFileSync(new URL("../src/tactical-operations.js", import.meta.url), "utf8"), /^import /m)
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
assert.match(main, /tacticalOperation,/)
assert.match(main, /createTacticalOperation\(\{ apiRaw \}\)/)
const loader = fs.readFileSync(new URL('../src/module-loader.js', import.meta.url), 'utf8')
const publicPart = loader.slice(loader.indexOf('export async function loadPublicUiModules'))
assert.doesNotMatch(publicPart.slice(0, publicPart.indexOf('export async function loadUiModules') > 0 ? publicPart.indexOf('export async function loadUiModules') : undefined), /tacticalOperation/)
console.log('tactical-operations-0.12.87 ok')
