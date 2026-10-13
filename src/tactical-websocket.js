// 0.12.102: the runtime helper for Core's ticketed Tactical terminal socket (Core 1.17.31, C4, AD-6 condition 2).
//   1. POST /api/tfd/tactical-websocket/<module_id>/<kind>/tickets/ with exactly {agent_id}, through the injected api().
//   2. Open wss://<host>/ws/tfd/agent-terminal/<ticket>/ (no query, no token, no subprotocol).
// Import-free: the transport, the socket class and the API base are injected, so no token, header or storage is built or
// read here. A fresh ticket is asked for on every open; a ticket is never reused or retried. No frame is ever logged.
// Core and Tactical decide the permission (can_use_terminal). The helper does not pre-check it.

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
export const TERMINAL_KIND = 'agent-terminal'
const CONNECT_LIMIT_MS = 10000
const MAX_AGENT_ID = 100
const MAX_SHELL = 260
const MAX_INPUT_BYTES = 64 * 1024
const MAX_TERMINAL_SIZE = 1000
const EVENTS = ['output', 'error', 'info', 'close']

// Close codes Core and Tactical use: the shell's plain text, and a short label for the event's reason.
const CLOSE_CODES = {
  4401: { reason: 'signin-ended', message: 'Your terminal session ended. Open the terminal again.' },
  4003: { reason: 'not-allowed', message: 'You are not allowed to use the terminal on this endpoint.' },
  4503: { reason: 'unavailable', message: "Tactical's terminal is not available right now. Try again later." },
}
const CLOSE_NORMAL = { reason: 'normal', message: 'The terminal closed.' }
const CLOSE_UNEXPECTED = { reason: 'unexpected', message: 'The terminal connection closed unexpectedly.' }
const NO_ANSWER = "Tactical's terminal did not answer. Try again."
const NOT_OPENED = 'The terminal was not opened.'
const BAD_ANSWER = 'Core sent an unexpected terminal answer. No terminal was opened.'
const BAD_BASE = 'The Tactical API address is not set to an http or https address, so the terminal cannot open.'
const NOT_OPEN = 'The terminal is not open. Open it again.'

function refuse(message, { status = 0, code = null } = {}) {
  return Object.assign(new Error(message), { status, payload: null, code })
}

// Ticket refusals from Core, mapped to the shell's plain text. Core's own text is kept where it names the cause.
function ticketRefusal(error) {
  const status = Number.isFinite(Number(error?.status)) ? Number(error.status) : 0
  const code = typeof error?.code === 'string' ? error.code : null
  const coreText = typeof error?.message === 'string' && error.message ? error.message : ''
  let message
  if (status === 401) message = 'Your Tec-Tac session ended. Sign in again.'
  else if (status === 403 && code === 'websocket_owner_required') message = 'This module cannot open that terminal.'
  else if (status === 403 && code === 'tactical_permission_denied') message = coreText || 'Your Tactical role does not allow the terminal.'
  else if (status === 404 && (code === 'object_not_found' || code === 'websocket_kind_not_found')) message = coreText || 'That agent or terminal was not found.'
  else if (status === 400 && code === 'invalid_agent_id') message = coreText || 'The agent id is not valid.'
  else if (status === 429) message = 'Too many terminal requests. Wait a minute and try again.'
  else if (status === 503 && code === 'websocket_unavailable') message = 'The terminal is not available right now. Try again later.'
  else message = 'The terminal could not be opened. Try again.'
  return refuse(message, { status, code })
}

function checkModuleId(moduleId) {
  if (typeof moduleId !== 'string' || !ID_PATTERN.test(moduleId)) {
    throw refuse('The module id must be letters, digits, "_" or "-" only, and start with a letter or digit.')
  }
}

function checkAgentId(agentId) {
  if (typeof agentId !== 'string' || agentId === '') throw refuse('The agent id is required.')
  if (agentId.length > MAX_AGENT_ID) throw refuse(`The agent id must be at most ${MAX_AGENT_ID} characters.`)
  if (CONTROL.test(agentId)) throw refuse('The agent id must not contain control characters.')
}

// The socket host and scheme from the API base: https gives wss, http gives ws. Any other base refuses.
function socketAddress(apiBaseUrl, ticketPath) {
  let url
  try { url = new URL(String(apiBaseUrl || '')) } catch { throw refuse(BAD_BASE) }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw refuse(BAD_BASE)
  const scheme = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${url.host}${ticketPath}`
}

function inputBytes(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length
  return text.length
}

function createEvents() {
  const byName = new Map(EVENTS.map((name) => [name, new Set()]))
  return {
    add(name, fn) {
      if (!byName.has(name)) throw refuse('The terminal has no event with that name. Use output, error, info or close.')
      if (typeof fn !== 'function') throw refuse('A terminal event needs a function.')
      byName.get(name).add(fn)
      return () => { byName.get(name).delete(fn) }
    },
    emit(name, payload) {
      for (const fn of [...byName.get(name)]) {
        try { fn(payload) } catch (error) {
          // A listener's own error is not the terminal's. It is raised outside this call, and the frame is never logged.
          setTimeout(() => { throw error }, 0)
        }
      }
    },
  }
}

// One terminal. The public session has only the documented members; the socket is driven through `driver`.
function createSession({ sessionId, socket, onGone }) {
  const events = createEvents()
  let state = 'connecting'
  let rejectOpen = null
  let resolveOpen = null
  const opened = new Promise((resolve, reject) => { resolveOpen = resolve; rejectOpen = reject })
  let timer = null

  function sendFrame(frame) {
    if (state !== 'open') throw refuse(NOT_OPEN)
    socket.send(JSON.stringify(frame))
  }

  function gone(info, { wasConnecting }) {
    state = 'closed'
    clearTimeout(timer)
    onGone(session)
    if (wasConnecting) {
      rejectOpen(Object.assign(new Error(info.message), { closeCode: info.code }))
    } else {
      events.emit('close', { code: info.code, reason: info.reason, message: info.message })
    }
  }

  function receive(text) {
    let frame
    try { frame = JSON.parse(text) } catch { return }
    if (!frame || typeof frame !== 'object') return
    if (frame.action === 'trmmcli.output') {
      const data = frame.data && typeof frame.data === 'object' ? frame.data : {}
      events.emit('output', {
        output: typeof data.output === 'string' ? data.output : '',
        sessionId: typeof data.session_id === 'string' ? data.session_id : '',
        exitCode: Number.isInteger(data.exit_code) ? data.exit_code : null,
        done: data.done === true,
        messageId: typeof data.messageId === 'string' || typeof data.messageId === 'number' ? data.messageId : '',
      })
    } else if (frame.action === 'terminal_error') {
      events.emit('error', {
        message: typeof frame.error === 'string' ? frame.error : 'The terminal reported an error.',
        code: typeof frame.code === 'string' ? frame.code : 'terminal_error',
      })
    } else if (frame.action === 'terminal_info') {
      events.emit('info', {
        message: typeof frame.message === 'string' ? frame.message : '',
        code: typeof frame.code === 'string' ? frame.code : 'terminal_info',
      })
    } else if (frame.action === undefined && typeof frame.error === 'string') {
      // Tactical answers an unknown action with a bare {error} frame.
      events.emit('error', { message: frame.error, code: 'unknown_action' })
    }
    // Any other frame is ignored.
  }

  const session = Object.freeze({
    sessionId,
    get status() { return state },
    on(name, fn) { return events.add(name, fn) },
    start({ shell = '', runAsUser = false } = {}) {
      if (typeof shell !== 'string') throw refuse('The shell must be text.')
      if (shell.length > MAX_SHELL) throw refuse(`The shell must be at most ${MAX_SHELL} characters.`)
      if (CONTROL.test(shell)) throw refuse('The shell must not contain control characters.')
      sendFrame({ action: 'start', shell, run_as_user: runAsUser === true })
    },
    input(text) {
      if (typeof text !== 'string' || text === '') throw refuse('The terminal input must be text, and not empty.')
      if (inputBytes(text) > MAX_INPUT_BYTES) throw refuse('The terminal input must be at most 64 KB.')
      sendFrame({ action: 'input', data: text })
    },
    resize(rows, cols) {
      const whole = (value) => Number.isInteger(value) && value >= 1 && value <= MAX_TERMINAL_SIZE
      if (!whole(rows) || !whole(cols)) throw refuse(`The terminal rows and columns must be whole numbers from 1 to ${MAX_TERMINAL_SIZE}.`)
      sendFrame({ action: 'resize', rows, cols })
    },
    kill() { sendFrame({ action: 'kill' }) },
    // A normal close. Tactical kills the shell when the socket closes.
    close() {
      if (state === 'closed') return
      const wasConnecting = state === 'connecting'
      try { socket.close(1000) } catch {}
      gone({ code: 1000, ...CLOSE_NORMAL }, { wasConnecting })
    },
  })

  // Driven by the helper: the socket's own events, the connect time limit and an abort during connect.
  const driver = Object.freeze({
    opened,
    startConnectLimit(ms, onLimit) {
      timer = setTimeout(() => { if (state === 'connecting') onLimit() }, ms)
    },
    onSocketOpen() {
      if (state !== 'connecting') return
      state = 'open'
      clearTimeout(timer)
      resolveOpen(session)
    },
    onSocketMessage(text) { if (state === 'open') receive(text) },
    onSocketClose(code) {
      if (state === 'closed') return
      const known = CLOSE_CODES[code]
      const info = code === 1000 ? CLOSE_NORMAL : (known || CLOSE_UNEXPECTED)
      gone({ code, reason: known ? known.reason : info.reason, message: info.message }, { wasConnecting: state === 'connecting' })
    },
    // A connect that did not finish (time limit or abort): the caller's message, no closeCode.
    abandonConnect(message) {
      if (state !== 'connecting') return
      state = 'closed'
      clearTimeout(timer)
      try { socket.close(1000) } catch {}
      onGone(session)
      rejectOpen(refuse(message))
    },
  })
  return { session, driver }
}

export function createTacticalWebSocket({ api, wsBase, WebSocketImpl, connectTimeoutMs = CONNECT_LIMIT_MS } = {}) {
  // Every terminal this helper has open or connecting, so closeAll() can end them all.
  const live = new Set()
  const baseOf = () => (typeof wsBase === 'function' ? wsBase() : wsBase)

  async function open(moduleId, kind, { agentId, signal } = {}) {
    checkModuleId(moduleId)
    if (kind !== TERMINAL_KIND) throw refuse('The terminal kind is not one the shell knows.')
    checkAgentId(agentId)
    if (typeof api !== 'function') throw refuse('The terminal needs the Tec-Tac request helper.')
    if (typeof WebSocketImpl !== 'function') throw refuse('This browser cannot open a terminal socket.')
    // The API base is checked before any request, so a bad address never asks for a ticket.
    socketAddress(baseOf(), '/')
    if (signal?.aborted) throw refuse(NOT_OPENED)

    // A fresh ticket for every open. It is asked once: no retry, and it is never kept.
    const path = `/api/tfd/tactical-websocket/${encodeURIComponent(moduleId)}/${encodeURIComponent(kind)}/tickets/`
    let answer
    try {
      answer = await api(path, { method: 'POST', body: JSON.stringify({ agent_id: agentId }), signal })
    } catch (error) {
      throw ticketRefusal(error)
    }
    const ticket = answer?.ticket
    const sessionId = answer?.session_id
    const ticketPath = answer?.path
    if (typeof ticket !== 'string' || !TICKET_PATTERN.test(ticket)) throw refuse(BAD_ANSWER)
    if (typeof sessionId !== 'string' || sessionId === '') throw refuse(BAD_ANSWER)
    if (ticketPath !== `/ws/tfd/agent-terminal/${ticket}/`) throw refuse(BAD_ANSWER)

    const address = socketAddress(baseOf(), ticketPath)
    let socket
    try {
      // One argument only: no query, no subprotocol. The browser's own error text can repeat the address, so it is not used.
      socket = new WebSocketImpl(address)
    } catch {
      throw refuse('The terminal could not be opened. Try again.')
    }

    const { session, driver } = createSession({
      sessionId,
      socket,
      onGone: (done) => { live.delete(done) },
    })
    live.add(session)
    socket.addEventListener('open', () => driver.onSocketOpen())
    socket.addEventListener('message', (event) => driver.onSocketMessage(typeof event?.data === 'string' ? event.data : ''))
    socket.addEventListener('close', (event) => driver.onSocketClose(Number.isInteger(event?.code) ? event.code : 1006))
    driver.startConnectLimit(connectTimeoutMs, () => driver.abandonConnect(NO_ANSWER))

    const onAbort = () => driver.abandonConnect(NOT_OPENED)
    signal?.addEventListener?.('abort', onAbort, { once: true })
    try {
      await driver.opened
    } finally {
      signal?.removeEventListener?.('abort', onAbort)
    }
    return session
  }

  // Ends every terminal this helper opened: on a lost sign-in and when the page is left.
  function closeAll() {
    for (const session of [...live]) {
      try { session.close() } catch {}
    }
    live.clear()
  }

  return Object.freeze({ open, closeAll, count: () => live.size })
}
