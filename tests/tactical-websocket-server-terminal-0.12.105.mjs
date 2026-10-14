// 0.12.105: the server-terminal kind of the Tactical WebSocket helper (AD-35, Core 1.17.34). Body exactly {}, the path check,
// no start, the trmmcli frames, the close codes 4401, 4003, 4502 and 4503, the two 403 refusals, the own-id-only binding,
// the limit and cleanup, and the agent-terminal regression. No frame is logged.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { createTacticalWebSocket } = await import(new URL('../src/tactical-websocket.js', import.meta.url).href)
async function dataModule(path, replacements = []) {
  let source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const ticket = (n) => String(n).padStart(43, 'k')
const realConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug }
const seenLogs = []
for (const name of Object.keys(realConsole)) console[name] = (...args) => { seenLogs.push(args.map(String).join(' ')) }

class FakeSocket {
  static instances = []
  constructor(...args) {
    this.args = args; this.url = args[0]; this.sent = []; this.closedWith = null
    this.listeners = { open: [], message: [], close: [] }
    FakeSocket.instances.push(this)
  }
  addEventListener(type, fn) { this.listeners[type].push(fn) }
  send(text) { this.sent.push(JSON.parse(text)) }
  close(code) { this.closedWith = code === undefined ? null : code }
  serverOpen() { for (const fn of this.listeners.open) fn({}) }
  serverMessage(value) { for (const fn of this.listeners.message) fn({ data: JSON.stringify(value) }) }
  serverClose(code) { for (const fn of this.listeners.close) fn({ code }) }
}
const lastSocket = () => FakeSocket.instances.at(-1)

function fakeApi(answers = []) {
  const calls = []
  const queue = [...answers]
  const api = async (path, options) => {
    calls.push({ path, options })
    const next = queue.shift()
    if (next instanceof Error) throw next
    return next
  }
  return { api, calls }
}
const serverAnswer = (n) => ({ ticket: ticket(n), path: `/ws/tfd/server-terminal/${ticket(n)}/`, session_id: `server-${n}`, expires_in: 30, kind: 'server-terminal' })
const agentAnswer = (n) => ({ ticket: ticket(n), path: `/ws/tfd/agent-terminal/${ticket(n)}/`, session_id: `agent-${n}`, expires_in: 30, kind: 'agent-terminal' })
const apiError = (status, code, message) => Object.assign(new Error(message || `failed ${status}`), { status, code, payload: null })

function helper(answers = []) {
  const fake = fakeApi(answers)
  const ws = createTacticalWebSocket({ api: fake.api, wsBase: 'https://tactical.example.test', WebSocketImpl: FakeSocket })
  return { ws, fake }
}
async function openServer(ws, moduleId = 'globalsettings') {
  const pending = ws.open(moduleId, 'server-terminal', {})
  await tick()
  lastSocket().serverOpen()
  return pending
}

// (1) the ticket: exactly {} through one api() call, the address, no query, no subprotocol
FakeSocket.instances = []
{
  const { ws, fake } = helper([serverAnswer(1)])
  const session = await openServer(ws)
  assert.equal(session.status, 'open')
  assert.equal(session.sessionId, 'server-1')
  assert.equal(fake.calls.length, 1)
  assert.equal(fake.calls[0].path, '/api/tfd/tactical-websocket/globalsettings/server-terminal/tickets/')
  assert.equal(fake.calls[0].options.method, 'POST')
  assert.equal(fake.calls[0].options.body, '{}')
  assert.equal(Object.keys(fake.calls[0].options).sort().join(','), 'body,method,signal')
  assert.equal(lastSocket().url, `wss://tactical.example.test/ws/tfd/server-terminal/${ticket(1)}/`)
  assert.equal(lastSocket().args.length, 1)
  assert.doesNotMatch(lastSocket().url, /[?#]|token|authorization/i)

  // (3) no start; the three frames
  assert.throws(() => session.start({ shell: '/bin/bash' }), /no start step/)
  assert.throws(() => session.start(), /no start step/)
  assert.deepEqual(lastSocket().sent, [], 'start sends nothing')
  session.input('ls\n')
  session.resize(24, 80)
  session.kill()
  assert.deepEqual(lastSocket().sent, [
    { action: 'trmmcli.input', data: { input: 'ls\n' } },
    { action: 'trmmcli.resize', data: { rows: 24, cols: 80 } },
    { action: 'trmmcli.disconnect' },
  ])
  // the limits still apply
  assert.throws(() => session.input(''), /not empty/)
  assert.throws(() => session.input('a'.repeat(64 * 1024 + 1)), /64 KB/)
  assert.throws(() => session.resize(0, 80), /whole numbers/)
  assert.equal(lastSocket().sent.length, 3)

  // (4) output
  const outputs = []
  session.on('output', (event) => outputs.push(event))
  lastSocket().serverMessage({ action: 'trmmcli.output', data: { output: 'hello', messageId: 'm1' } })
  assert.equal(outputs.length, 1)
  assert.equal(outputs[0].output, 'hello')
  assert.equal(outputs[0].messageId, 'm1')

  // close(): a normal close
  session.close()
  assert.equal(lastSocket().closedWith, 1000)
  assert.equal(session.status, 'closed')
}

// (2) a given agentId refuses locally, with no request
{
  const { ws, fake } = helper([serverAnswer(2)])
  await assert.rejects(ws.open('globalsettings', 'server-terminal', { agentId: 'agent-1' }), /takes no agent id/)
  assert.equal(fake.calls.length, 0)
}

// (2b) a wrong path in the answer is refused with no socket; so is a ticket of the wrong shape
FakeSocket.instances = []
{
  for (const bad of [
    { ...serverAnswer(3), path: `/ws/tfd/agent-terminal/${ticket(3)}/` },
    { ...serverAnswer(3), path: `/ws/tfd/server-terminal/${ticket(4)}/` },
    { ...serverAnswer(3), path: `/ws/tfd/server-terminal/${ticket(3)}/?x=1` },
    { ...serverAnswer(3), ticket: 'short' },
    { ...serverAnswer(3), session_id: 7 },
  ]) {
    const { ws, fake } = helper([bad])
    await assert.rejects(ws.open('globalsettings', 'server-terminal', {}), /unexpected terminal answer/)
    assert.equal(fake.calls.length, 1)
  }
  assert.equal(FakeSocket.instances.length, 0, 'no socket was made')
  // the server path is not accepted for the agent kind
  const { ws } = helper([serverAnswer(5)])
  await assert.rejects(ws.open('remote-background', 'agent-terminal', { agentId: 'a' }), /unexpected terminal answer/)
}

// (5) close codes after open and before open; nothing reconnects
const closeCases = [
  [4401, 'signin-ended', 'Your terminal session ended. Open the terminal again.'],
  [4003, 'not-allowed', 'You are not allowed to use the server terminal, or your superuser standing ended.'],
  [4502, 'audit-unavailable', 'The server terminal could not start because Core could not record it. No shell was started.'],
  [4503, 'unavailable', "Tactical's terminal is not available right now. Try again later."],
  [1000, 'normal', 'The terminal closed.'],
  [1006, 'unexpected', 'The terminal connection closed unexpectedly.'],
]
for (const [code, reason, message] of closeCases) {
  // after open: the close event
  FakeSocket.instances = []
  {
    const { ws, fake } = helper([serverAnswer(10)])
    const session = await openServer(ws)
    const closes = []
    session.on('close', (event) => closes.push(event))
    lastSocket().serverClose(code)
    assert.deepEqual(closes, [{ code, reason, message }], `after open ${code}`)
    assert.equal(session.status, 'closed')
    assert.equal(ws.count(), 0)
    await tick()
    assert.equal(FakeSocket.instances.length, 1, 'nothing reconnects')
    assert.equal(fake.calls.length, 1, 'no second ticket')
  }
  // before open: open() rejects with the message and closeCode
  FakeSocket.instances = []
  {
    const { ws, fake } = helper([serverAnswer(11)])
    const pending = ws.open('globalsettings', 'server-terminal', {})
    await tick()
    lastSocket().serverClose(code)
    await assert.rejects(pending, (error) => error.message === message && error.closeCode === code)
    await tick()
    assert.equal(FakeSocket.instances.length, 1)
    assert.equal(fake.calls.length, 1)
  }
}

// (6) ticket refusals: one api() call, status and code kept, own sentence
for (const [status, code, message] of [
  [403, 'superuser_required', 'Only a superuser can use the server terminal.'],
  [403, 'server_terminal_disabled', "The server terminal is turned off in Tactical's global settings."],
  [401, 'not_authenticated', 'Your Tec-Tac session ended. Sign in again.'],
  [429, 'throttled', 'Too many terminal requests. Wait a minute and try again.'],
  [503, 'websocket_unavailable', 'The terminal is not available right now. Try again later.'],
  [500, 'boom', 'The terminal could not be opened. Try again.'],
]) {
  const { ws, fake } = helper([apiError(status, code, 'core text')])
  await assert.rejects(ws.open('globalsettings', 'server-terminal', {}), (error) => (
    error.message === message && error.status === status && error.code === code
  ))
  assert.equal(fake.calls.length, 1, 'one call, no retry')
}

// (7) agent-terminal regression: body, start, input, resize, kill, close messages
FakeSocket.instances = []
{
  const { ws, fake } = helper([agentAnswer(20)])
  const pending = ws.open('remote-background', 'agent-terminal', { agentId: 'agent-1' })
  await tick(); lastSocket().serverOpen()
  const session = await pending
  assert.deepEqual(JSON.parse(fake.calls[0].options.body), { agent_id: 'agent-1' })
  assert.equal(lastSocket().url, `wss://tactical.example.test/ws/tfd/agent-terminal/${ticket(20)}/`)
  session.start({ shell: '/bin/bash', runAsUser: true })
  session.input('x'); session.resize(10, 20); session.kill()
  assert.deepEqual(lastSocket().sent, [
    { action: 'start', shell: '/bin/bash', run_as_user: true },
    { action: 'input', data: 'x' },
    { action: 'resize', rows: 10, cols: 20 },
    { action: 'kill' },
  ])
  const closes = []
  session.on('close', (event) => closes.push(event))
  lastSocket().serverClose(4003)
  assert.deepEqual(closes, [{ code: 4003, reason: 'not-allowed', message: 'You are not allowed to use the terminal on this endpoint.' }])
  const again = helper([agentAnswer(21)])
  const p2 = again.ws.open('remote-background', 'agent-terminal', { agentId: 'agent-1' })
  await tick(); lastSocket().serverClose(4502)
  await assert.rejects(p2, (error) => error.message === 'The terminal connection closed unexpectedly.' && error.closeCode === 4502)
  await assert.rejects(helper().ws.open('remote-background', 'agent-terminal', {}), /agent id is required/)
}

// (8) unknown kinds are refused before any request
{
  const { ws, fake } = helper([serverAnswer(30)])
  for (const kind of ['web-vnc', 'constructor', '__proto__', 'toString', '']) {
    await assert.rejects(ws.open('globalsettings', kind, {}), /not one the shell knows/)
  }
  assert.equal(fake.calls.length, 0)
}

// (9) the module binding: server-terminal for the module's own id only, no AD-20 exception, limit and cleanup
FakeSocket.instances = []
{
  const answers = [serverAnswer(40), agentAnswer(41), ...Array.from({ length: 8 }, (_, i) => serverAnswer(50 + i))]
  const { ws, fake } = helper(answers)
  const own = loader.bindTacticalWebSocket(ws.open, { moduleId: 'globalsettings', replaces: '' })
  const replacer = loader.bindTacticalWebSocket(ws.open, { moduleId: 'premium-settings', replaces: () => 'globalsettings' })
  const other = loader.bindTacticalWebSocket(ws.open, { moduleId: 'remote-background', replaces: '' })

  const ownSession = await (async () => {
    const pending = own.tacticalWebSocket.open('globalsettings', 'server-terminal', {})
    await tick(); lastSocket().serverOpen()
    return pending
  })()
  assert.equal(ownSession.status, 'open')
  const callsBefore = fake.calls.length
  await assert.rejects(other.tacticalWebSocket.open('globalsettings', 'server-terminal', {}), /cannot open Tactical terminals for "globalsettings"\. It may use only "remote-background"\./)
  await assert.rejects(replacer.tacticalWebSocket.open('globalsettings', 'server-terminal', {}), (error) => (
    error.message === 'Module "premium-settings" cannot open Tactical terminals for "globalsettings". It may use only "premium-settings".'
  ))
  assert.equal(fake.calls.length, callsBefore, 'refused before any request')
  // the replacer keeps the AD-20 exception for agent-terminal
  const pending = replacer.tacticalWebSocket.open('globalsettings', 'agent-terminal', { agentId: 'a' })
  await tick(); lastSocket().serverOpen()
  assert.equal((await pending).status, 'open')
  assert.equal(fake.calls.at(-1).path, '/api/tfd/tactical-websocket/globalsettings/agent-terminal/tickets/')

  // the limit: one open, seven more make eight, the ninth is refused; unload closes them all
  const sockets = []
  for (let i = 0; i < 7; i += 1) {
    const p = own.tacticalWebSocket.open('globalsettings', 'server-terminal', {})
    await tick(); sockets.push(lastSocket()); lastSocket().serverOpen(); await p
  }
  await assert.rejects(own.tacticalWebSocket.open('globalsettings', 'server-terminal', {}), /already has 8 terminal sessions open/)
  own.close()
  for (const socket of sockets) assert.equal(socket.closedWith, 1000)
  assert.equal(ownSession.status, 'closed')
  await assert.rejects(own.tacticalWebSocket.open('globalsettings', 'server-terminal', {}), /was unloaded/)
  // closeAll on the shared helper ends what is left (the replacer's agent terminal)
  ws.closeAll()
  assert.equal(ws.count(), 0)
}

for (const name of Object.keys(realConsole)) console[name] = realConsole[name]
assert.deepEqual(seenLogs, [], 'no frame, ticket or token was logged')
realConsole.log('tactical websocket server terminal 0.12.105: PASS')
