// 0.12.102: the Tactical WebSocket helper (Core 1.17.31, C4). A fresh ticket for every open, the socket address built from the API
// base with no query, no token and no subprotocol, the start, input, resize and kill frames and their limits, Tactical's
// output, error and info frames, the close codes, every ticket refusal, the connect time limit, the module binding, the
// per-module limit and cleanup, and the raw-path guard. No frame, ticket or token reaches an error or the console.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

import { fileURLToPath } from 'node:url'

const { createTacticalWebSocket } = await import(new URL('../src/tactical-websocket.js', import.meta.url).href)
const root = fileURLToPath(new URL('../', import.meta.url))

function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const ticket = (n) => String(n).padStart(43, 'k')
const TICKET_RE = /[A-Za-z0-9_-]{43}/
// Every console method is recorded during the test, so a frame, a ticket or a token that reached the console fails it.
const realConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug }
const seenLogs = []
for (const name of Object.keys(realConsole)) {
  console[name] = (...args) => { seenLogs.push(args.map(String).join(' ')) }
}

// A fake WebSocket class: records its address and arguments, and lets the test play the server's side.
class FakeSocket {
  static instances = []
  constructor(...args) {
    this.args = args
    this.url = args[0]
    this.sent = []
    this.closedWith = null
    this.listeners = { open: [], message: [], close: [] }
    FakeSocket.instances.push(this)
  }
  addEventListener(type, fn) { this.listeners[type].push(fn) }
  send(text) { this.sent.push(JSON.parse(text)) }
  close(code) { this.closedWith = code === undefined ? null : code }
  serverOpen() { for (const fn of this.listeners.open) fn({}) }
  serverMessage(value) {
    const data = typeof value === 'string' ? value : JSON.stringify(value)
    for (const fn of this.listeners.message) fn({ data })
  }
  serverClose(code) { for (const fn of this.listeners.close) fn({ code }) }
}
const lastSocket = () => FakeSocket.instances.at(-1)

// A fake api(): each call pops the next answer (a value, or a thrown error). Records every call.
function fakeApi(answers = []) {
  const calls = []
  const queue = [...answers]
  const api = async (path, options) => {
    calls.push({ path, options })
    const next = queue.shift()
    if (next instanceof Error) throw next
    if (typeof next === 'function') return next()
    return next
  }
  return { api, calls, push: (...items) => queue.push(...items) }
}
const answerFor = (n, agent = 'agent-1') => ({
  ticket: ticket(n),
  path: `/ws/tfd/agent-terminal/${ticket(n)}/`,
  session_id: `session-${n}`,
  expires_in: 30,
  kind: 'agent-terminal',
})
const apiError = (status, code, message) => Object.assign(new Error(message || `failed ${status}`), { status, code, payload: null })

function helper({ answers = [], base = 'https://tactical.example.test', connectTimeoutMs, withSocket = FakeSocket } = {}) {
  const fake = fakeApi(answers)
  const ws = createTacticalWebSocket({
    api: fake.api,
    wsBase: base,
    WebSocketImpl: withSocket,
    ...(connectTimeoutMs === undefined ? {} : { connectTimeoutMs }),
  })
  return { ws, fake }
}

// Opens a terminal and lets the fake server accept the socket. Returns the session.
async function openAndAccept(ws, moduleId = 'remote-background', options = { agentId: 'agent-1' }) {
  const pending = ws.open(moduleId, 'agent-terminal', options)
  await tick()
  lastSocket().serverOpen()
  return pending
}

// (1) the happy path: exactly one ticket request, the socket address, the session is open
FakeSocket.instances = []
{
  const { ws, fake } = helper({ answers: [answerFor(1)] })
  const session = await openAndAccept(ws)
  assert.equal(session.status, 'open')
  assert.equal(session.sessionId, 'session-1')
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].path, '/api/tfd/tactical-websocket/remote-background/agent-terminal/tickets/')
  assert.equal(fake.calls[0].options.method, 'POST')
  // (2) the ticket body is exactly {agent_id}, and no header or token is built here
  assert.deepEqual(JSON.parse(fake.calls[0].options.body), { agent_id: 'agent-1' })
  assert.equal(Object.keys(fake.calls[0].options).sort().join(','), 'body,method,signal')
  // (4) the address: wss, the API host, the ticket path, no query, one argument only (no subprotocol)
  assert.equal(lastSocket().url, `wss://tactical.example.test/ws/tfd/agent-terminal/${ticket(1)}/`)
  assert.equal(lastSocket().args.length, 1, 'the socket gets the address only')
  assert.doesNotMatch(lastSocket().url, /[?#]/)
  assert.doesNotMatch(lastSocket().url, /token|authorization/i)
  session.close()
}

// (2b) an http API base gives ws://; a port is kept
FakeSocket.instances = []
{
  const { ws } = helper({ answers: [answerFor(2)], base: 'http://10.0.0.5:8000/' })
  await openAndAccept(ws)
  assert.equal(lastSocket().url, `ws://10.0.0.5:8000/ws/tfd/agent-terminal/${ticket(2)}/`)
}

// (3) a fresh ticket on every open: never reused, never retried
FakeSocket.instances = []
{
  const { ws, fake } = helper({ answers: [answerFor(3), answerFor(4)] })
  const first = await openAndAccept(ws)
  const second = await openAndAccept(ws)
  assert.equal(fake.calls.length, 2, 'one ticket request per open')
  assert.notEqual(FakeSocket.instances[0].url, FakeSocket.instances[1].url)
  assert.equal(first.sessionId, 'session-3')
  assert.equal(second.sessionId, 'session-4')
  first.close(); second.close()
}

// (3b) a failed open is not retried: one ticket request, one error
FakeSocket.instances = []
{
  const { ws, fake } = helper({ answers: [apiError(503, 'websocket_unavailable', 'x')] })
  await assert.rejects(ws.open('remote-background', 'agent-terminal', { agentId: 'agent-1' }), (error) => error.status === 503)
  assert.equal(fake.calls.length, 1)
  assert.equal(FakeSocket.instances.length, 0, 'no socket opens after a refused ticket')
}

// (5) the ticket answer is checked: a short ticket, a mismatched path, a missing session id, a non-object answer all refuse
FakeSocket.instances = []
for (const bad of [
  { ...answerFor(5), ticket: 'short' },
  { ...answerFor(5), path: '/ws/tfd/agent-terminal/other/' },
  { ...answerFor(5), path: `/ws/tfd/agent-terminal/${ticket(5)}/?x=1` },
  { ...answerFor(5), session_id: '' },
  { ...answerFor(5), session_id: 7 },
  { ...answerFor(5), ticket: `${ticket(5).slice(0, 42)}+` },
  null,
  'text',
]) {
  const { ws } = helper({ answers: [bad] })
  await assert.rejects(ws.open('remote-background', 'agent-terminal', { agentId: 'agent-1' }), (error) => (
    /unexpected terminal answer/.test(error.message) && !/k{43}/.test(error.message)
  ))
}
assert.equal(FakeSocket.instances.length, 0, 'no socket opens for a bad ticket answer')

// (6) the frames the browser sends, and their limits
FakeSocket.instances = []
{
  const { ws } = helper({ answers: [answerFor(6)] })
  const session = await openAndAccept(ws)
  session.start({ shell: 'bash', runAsUser: true })
  session.start()
  session.start({ shell: 'x'.repeat(260) })
  assert.throws(() => session.start({ shell: 'x'.repeat(261) }), /at most 260/)
  assert.throws(() => session.start({ shell: 'a\u0007b' }), /control characters/)
  assert.throws(() => session.start({ shell: 12 }), /must be text/)
  session.input('ls -la\n')
  assert.throws(() => session.input(''), /not empty/)
  assert.throws(() => session.input('x'.repeat(64 * 1024 + 1)), /64 KB/)
  session.input('x'.repeat(64 * 1024))
  session.resize(24, 80)
  session.resize(1, 1000)
  assert.throws(() => session.resize(0, 80), /whole numbers from 1 to 1000/)
  assert.throws(() => session.resize(24, 1001), /whole numbers/)
  assert.throws(() => session.resize(24.5, 80), /whole numbers/)
  assert.throws(() => session.resize('24', 80), /whole numbers/)
  session.kill()
  const sent = lastSocket().sent
  assert.deepEqual(sent[0], { action: 'start', shell: 'bash', run_as_user: true })
  assert.deepEqual(sent[1], { action: 'start', shell: '', run_as_user: false })
  assert.equal(sent[2].shell.length, 260)
  assert.deepEqual(sent[3], { action: 'input', data: 'ls -la\n' })
  assert.equal(sent[4].data.length, 64 * 1024)
  assert.deepEqual(sent[5], { action: 'resize', rows: 24, cols: 80 })
  assert.deepEqual(sent[6], { action: 'resize', rows: 1, cols: 1000 })
  assert.deepEqual(sent[7], { action: 'kill' })
  assert.equal(sent.length, 8, 'refused calls send nothing')
  session.close()
}

// (6b) a send before the socket is open throws a plain error and sends nothing
FakeSocket.instances = []
{
  const { ws } = helper({ answers: [answerFor(7)] })
  const pending = ws.open('remote-background', 'agent-terminal', { agentId: 'agent-1' })
  await tick()
  const socket = lastSocket()
  socket.serverOpen()
  const session = await pending
  session.close()
  assert.throws(() => session.start({ shell: 'bash' }), /not open/)
  assert.throws(() => session.input('x'), /not open/)
  assert.throws(() => session.kill(), /not open/)
  assert.equal(socket.sent.length, 0)
}

// (7) Tactical's frames reach the listeners; unknown or non-JSON frames are ignored; nothing is logged
FakeSocket.instances = []
{
  const { ws } = helper({ answers: [answerFor(8)] })
  const session = await openAndAccept(ws)
  const outputs = []
  const errors = []
  const infos = []
  const off = session.on('output', (value) => outputs.push(value))
  session.on('error', (value) => errors.push(value))
  session.on('info', (value) => infos.push(value))
  const socket = lastSocket()
  socket.serverMessage({ action: 'trmmcli.output', data: { output: 'hello', session_id: 'session-8', exit_code: null, done: false, messageId: 3 } })
  socket.serverMessage({ action: 'trmmcli.output', data: { output: '', session_id: 'session-8', exit_code: 0, done: true, messageId: 4 } })
  socket.serverMessage({ action: 'terminal_error', error: 'Invalid shell', code: 'invalid_shell' })
  socket.serverMessage({ action: 'terminal_info', message: 'Shell started', code: 'terminal_info' })
  socket.serverMessage({ error: 'Unknown action: nope' })
  socket.serverMessage({ action: 'something_new', data: { secret: 'x' } })
  socket.serverMessage('not json at all')
  socket.serverMessage(12)
  assert.deepEqual(outputs[0], { output: 'hello', sessionId: 'session-8', exitCode: null, done: false, messageId: 3 })
  assert.deepEqual(outputs[1], { output: '', sessionId: 'session-8', exitCode: 0, done: true, messageId: 4 })
  assert.equal(outputs.length, 2)
  assert.deepEqual(errors, [
    { message: 'Invalid shell', code: 'invalid_shell' },
    { message: 'Unknown action: nope', code: 'unknown_action' },
  ])
  assert.deepEqual(infos, [{ message: 'Shell started', code: 'terminal_info' }])
  off()
  socket.serverMessage({ action: 'trmmcli.output', data: { output: 'after off' } })
  assert.equal(outputs.length, 2, 'the off function removes the listener')
  assert.throws(() => session.on('bogus', () => {}), /no event with that name/)
  assert.throws(() => session.on('output', 'not a function'), /needs a function/)
  session.close()
}

// (8) close codes after the socket opened: the message, the reason, and the session is closed
for (const [code, reason, message] of [
  [4401, 'signin-ended', 'Your terminal session ended. Open the terminal again.'],
  [4003, 'not-allowed', 'You are not allowed to use the terminal on this endpoint.'],
  [4503, 'unavailable', "Tactical's terminal is not available right now. Try again later."],
  [1000, 'normal', 'The terminal closed.'],
  [1006, 'unexpected', 'The terminal connection closed unexpectedly.'],
  [4999, 'unexpected', 'The terminal connection closed unexpectedly.'],
]) {
  FakeSocket.instances = []
  const { ws } = helper({ answers: [answerFor(9)] })
  const session = await openAndAccept(ws)
  const closes = []
  session.on('close', (value) => closes.push(value))
  lastSocket().serverClose(code)
  assert.deepEqual(closes, [{ code, reason, message }], `close ${code}`)
  assert.equal(session.status, 'closed')
  assert.throws(() => session.input('x'), /not open/)
}

// (8b) close codes before the socket opened: open() rejects with the same message and the close code
for (const [code, message] of [
  [4401, 'Your terminal session ended. Open the terminal again.'],
  [4003, 'You are not allowed to use the terminal on this endpoint.'],
  [4503, "Tactical's terminal is not available right now. Try again later."],
  [1006, 'The terminal connection closed unexpectedly.'],
]) {
  FakeSocket.instances = []
  const { ws } = helper({ answers: [answerFor(10)] })
  const pending = ws.open('remote-background', 'agent-terminal', { agentId: 'agent-1' })
  await tick()
  lastSocket().serverClose(code)
  await assert.rejects(pending, (error) => error.message === message && error.closeCode === code)
}

// (9) the connect time limit: no answer closes the socket and rejects with the plain message
FakeSocket.instances = []
{
  const { ws } = helper({ answers: [answerFor(11)], connectTimeoutMs: 20 })
  await assert.rejects(ws.open('remote-background', 'agent-terminal', { agentId: 'agent-1' }), (error) => (
    error.message === "Tactical's terminal did not answer. Try again." && error.closeCode === undefined
  ))
  assert.equal(lastSocket().closedWith, 1000, 'the socket is closed at the limit')
}

// (10) ticket refusals: status and code kept, plain text, no socket
const refusals = [
  [400, 'invalid_agent_id', 'The agent id is not valid.', 'The agent id is not valid.'],
  [401, 'session_revoked', 'Your Tactical session is no longer valid.', 'Your Tec-Tac session ended. Sign in again.'],
  [403, 'websocket_owner_required', 'Core refused.', 'This module cannot open that terminal.'],
  [403, 'tactical_permission_denied', 'Your Tactical role does not allow this operation. It needs the Tactical permission can_use_terminal.', 'Your Tactical role does not allow this operation. It needs the Tactical permission can_use_terminal.'],
  [404, 'object_not_found', 'No such agent.', 'No such agent.'],
  [404, 'websocket_kind_not_found', 'Core has no Tactical socket of that kind.', 'Core has no Tactical socket of that kind.'],
  [429, 'throttle', 'Request was throttled.', 'Too many terminal requests. Wait a minute and try again.'],
  [503, 'websocket_unavailable', 'Core cannot issue a terminal ticket right now.', 'The terminal is not available right now. Try again later.'],
  [500, 'boom', 'Something broke.', 'The terminal could not be opened. Try again.'],
]
for (const [status, code, coreText, expected] of refusals) {
  FakeSocket.instances = []
  const { ws } = helper({ answers: [apiError(status, code, coreText)] })
  await assert.rejects(ws.open('remote-background', 'agent-terminal', { agentId: 'agent-1' }), (error) => (
    error.message === expected && error.status === status && error.code === code
  ), `${status} ${code}`)
  assert.equal(FakeSocket.instances.length, 0)
}

// (11) the ticket never appears in an error: a socket constructor that repeats its address is not passed on
FakeSocket.instances = []
{
  class LeakySocket {
    constructor(address) { throw new Error(`cannot reach ${address}`) }
  }
  const { ws } = helper({ answers: [answerFor(12)], withSocket: LeakySocket })
  await assert.rejects(ws.open('remote-background', 'agent-terminal', { agentId: 'agent-1' }), (error) => (
    error.message === 'The terminal could not be opened. Try again.' && !TICKET_RE.test(error.message)
  ))
}

// (12) local refusals come before any request
FakeSocket.instances = []
for (const [label, moduleId, kind, agentId, base] of [
  ['bad module id', 'bad id', 'agent-terminal', 'agent-1', undefined],
  ['module id with a slash', 'a/b', 'agent-terminal', 'agent-1', undefined],
  ['another kind', 'remote-background', 'web-vnc', 'agent-1', undefined],
  ['empty agent', 'remote-background', 'agent-terminal', '', undefined],
  ['agent id too long', 'remote-background', 'agent-terminal', 'a'.repeat(101), undefined],
  ['agent id with a control character', 'remote-background', 'agent-terminal', 'a\nb', undefined],
  ['non-http base', 'remote-background', 'agent-terminal', 'agent-1', 'ftp://tactical.example.test'],
  ['empty base', 'remote-background', 'agent-terminal', 'agent-1', ''],
]) {
  const { ws, fake } = helper({ answers: [answerFor(13)], base: base === undefined ? 'https://tactical.example.test' : base })
  await assert.rejects(ws.open(moduleId, kind, { agentId }), Error, label)
  assert.equal(fake.calls.length, 0, `${label}: no request`)
}
assert.equal(FakeSocket.instances.length, 0)

// (13) abort: before the request, and during the connect
{
  const { ws, fake } = helper({ answers: [answerFor(14)] })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(ws.open('remote-background', 'agent-terminal', { agentId: 'agent-1', signal: controller.signal }), /was not opened/)
  assert.equal(fake.calls.length, 0)
}
{
  FakeSocket.instances = []
  const { ws } = helper({ answers: [answerFor(15)] })
  const controller = new AbortController()
  const pending = ws.open('remote-background', 'agent-terminal', { agentId: 'agent-1', signal: controller.signal })
  await tick()
  controller.abort()
  await assert.rejects(pending, /was not opened/)
  assert.equal(lastSocket().closedWith, 1000)
}

// (14) closeAll ends every terminal the helper opened (a lost sign-in, leaving the page)
FakeSocket.instances = []
{
  const { ws } = helper({ answers: [answerFor(16), answerFor(17)] })
  const one = await openAndAccept(ws)
  const two = await openAndAccept(ws)
  const closes = []
  one.on('close', (value) => closes.push(value.code))
  two.on('close', (value) => closes.push(value.code))
  assert.equal(ws.count(), 2)
  ws.closeAll()
  assert.equal(one.status, 'closed')
  assert.equal(two.status, 'closed')
  assert.deepEqual(closes, [1000, 1000])
  assert.equal(ws.count(), 0)
}

// (15) the helper's source: no storage, no logging, no import, and the wss form comes from the CSP script
const source = fs.readFileSync(new URL('../src/tactical-websocket.js', import.meta.url), 'utf8')
assert.doesNotMatch(source, /localStorage|sessionStorage/)
assert.doesNotMatch(source, /console\./)
assert.doesNotMatch(source, /^import /m)
assert.doesNotMatch(source, /Authorization|Token /)
const csp = spawnSync('bash', ['-c', [
  'set -e',
  'source scripts/tec-tac-csp.sh',
  'TMPF="$(mktemp)"',
  'printf %s \'window._env_ = { PROD_URL: "https://api.x.test" }\' > "$TMPF"',
  'tec_tac_csp_from_env_config enforce "$TMPF" 2>/dev/null',
].join('\n')], { cwd: root, encoding: 'utf8' })
assert.equal(csp.status, 0, csp.stderr)
assert.match(csp.stdout, /connect-src 'self' https:\/\/api\.x\.test wss:\/\/api\.x\.test;/, 'the CSP keeps the wss form of the API origin')

// (16) the package requirement
const pkg = JSON.parse(fs.readFileSync(new URL('../tec_tac_package.json', import.meta.url), 'utf8'))
assert.equal(pkg.requires['tec-tac-framework'], '>=1.17.33,<2.0.0')

// (17) the module binding: own id, the replaced id, another id refused, a failed module refused, the limit, cleanup
FakeSocket.instances = []
{
  const { ws, fake } = helper({ answers: Array.from({ length: 12 }, (_, i) => answerFor(20 + i)) })
  const shared = { tacticalWebSocket: ws }
  const runtime = {
    app: {},
    router: { currentRoute: { value: { path: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} },
    state: { context: { permissions: [], user: { superuser: true, id: 9 }, module_status: [{ id: 'replacer', replaces: 'core-x' }] }, contextSource: 'backend' },
    addNavigation() {},
    removeNavigation() {},
    api: fake.api,
    apiRaw: fake.api,
    tacticalWebSocket: ws,
  }
  const own = entry(`
export default { async register(ctx) {
  globalThis.__own = ctx.tacticalWebSocket
  globalThis.__ownRaw = ctx.api
} }`)
  const replacer = entry(`
export default { register(ctx) { globalThis.__replacer = ctx.tacticalWebSocket; globalThis.__replacerApi = ctx.api } }`)
  const failing = entry(`
export default { async register(ctx) {
  globalThis.__failedHandle = ctx.tacticalWebSocket
  throw new Error('register broke')
} }`)
  const loaded = await loader.loadUiModules(runtime, [
    { id: 'remote-background', entry: own, permissions: [], allowed: true },
    { id: 'replacer', entry: replacer, permissions: [], allowed: true, replaces: 'core-x' },
    { id: 'failing', entry: failing, permissions: [], allowed: true },
  ], { timeoutMs: 500 })
  assert.deepEqual(loaded.loaded, ['remote-background', 'replacer'])
  assert.equal(loaded.failed[0].id, 'failing')

  // a module's helper is its own: the call names its own id, or the one it replaces, and another id is refused
  assert.equal(typeof globalThis.__own.open, 'function')
  assert.equal(globalThis.__own.closeAll, undefined, 'a module does not get the shared close')
  const ownSession = await openAndAccept(globalThis.__own, 'remote-background')
  assert.equal(ownSession.status, 'open')
  const replacedSession = await openAndAccept(globalThis.__replacer, 'core-x')
  assert.equal(replacedSession.status, 'open', 'the replaced module id is allowed for the replacer')
  await assert.rejects(globalThis.__own.open('other', 'agent-terminal', { agentId: 'agent-1' }), (error) => (
    error.message === 'Module "remote-background" cannot open Tactical terminals for "other". It may use only "remote-background".'
  ))
  await assert.rejects(globalThis.__replacer.open('remote-background', 'agent-terminal', { agentId: 'agent-1' }), (error) => (
    error.status === 0 && error.message === 'Module "replacer" cannot open Tactical terminals for "remote-background". It may use only "replacer" or "core-x".'
  ))
  // a failed module keeps no handle that works
  await assert.rejects(globalThis.__failedHandle.open('failing', 'agent-terminal', { agentId: 'agent-1' }), /abandoned/)

  // the raw path guard: another module's ticket path is refused on every shared helper, and the own path is not
  const callsBefore = fake.calls.length
  await assert.rejects(globalThis.__ownRaw('/api/tfd/tactical-websocket/other/agent-terminal/tickets/', { method: 'POST' }), (error) => (
    error.status === 0 && /cannot open Tactical terminals for "other"/.test(error.message)
  ))
  await assert.rejects(globalThis.__replacerApi('/api/%74fd/tactical-websocket/Other/agent-terminal/tickets/', { method: 'POST' }), (error) => error.status === 0)
  assert.equal(fake.calls.length, callsBefore, 'the refused raw calls never reach the transport')
  await globalThis.__ownRaw('/api/tfd/tactical-websocket/remote-background/agent-terminal/tickets/', { method: 'POST' })
  assert.equal(fake.calls.length, callsBefore + 1, 'the module may call its own ticket path')

  // the limit: the module already has one session open; seven more make eight, and the ninth is refused
  const more = []
  for (let i = 0; i < 7; i += 1) more.push(await openAndAccept(globalThis.__own, 'remote-background'))
  await assert.rejects(globalThis.__own.open('remote-background', 'agent-terminal', { agentId: 'agent-1' }), /already has 8 terminal sessions open/)
  // the replacer has its own count: it can still open one
  assert.equal(ws.count(), 9, 'every terminal the shared helper opened is counted')
  for (const session of [ownSession, replacedSession, ...more]) assert.equal(session.status, 'open')
  // a session that closes leaves the module's count, so a new one is allowed
  more[0].close()
  const again = await openAndAccept(globalThis.__own, 'remote-background')
  assert.equal(again.status, 'open')
  ws.closeAll()
  assert.equal(ws.count(), 0)
}

for (const name of Object.keys(realConsole)) console[name] = realConsole[name]
assert.deepEqual(seenLogs, [], 'no frame, ticket or token was logged')
realConsole.log('tactical websocket 0.12.102: PASS')
