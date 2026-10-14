# Tactical terminal socket (`tacticalWebSocket`)

A module can open a Tactical terminal for the signed-in person through `register(context).tacticalWebSocket`. The module never
holds a token. Core issues a single-use ticket, and the browser opens the socket with that ticket.

Added in UI 0.12.102. It needs Core 1.17.31 or later (`tec-tac-framework >=1.17.31,<2.0.0`). The shell's
`tacticalWebSocket` is bound to each module, as `tacticalOperation` is. The Core contract row is
`ui.authenticated.websocket`; see [the runtime API](module-runtime-api.md#tactical-terminal-socket-tacticalwebsocket).

To show the session in a window, use the [terminal widget](module-terminal.md) (UI 0.12.104). It draws the output, sends typed
input to the session and reports the size, so the session's `input` and `resize` are all a module needs to wire up.

## Open a terminal

```js
const session = await context.tacticalWebSocket.open('remote-background', 'agent-terminal', {
  agentId: agent.agent_id,
  signal: controller.signal, // optional: cancels the open
})
session.on('output', ({ output }) => appendToTerminal(output))
session.on('error', ({ message }) => showLine(message))
session.on('close', ({ message }) => showLine(message))
session.start({ shell: '', runAsUser: false })
session.input('hostname\n')
```

- `moduleId` is your own module id, or the core module you replace under AD-20. Any other id is refused before any request.
- `kind` is `agent-terminal`. Any other kind is refused before any request.
- `agentId` is text of 1 to 100 characters with no control characters.
- `open()` resolves with the session once the socket is open. It rejects with a plain message otherwise.

## What happens on every open

1. The helper asks Core for a ticket: `POST /api/tfd/tactical-websocket/<module_id>/<kind>/tickets/` with exactly `{agent_id}`,
   through the shell's `api()` transport. No header is built here, and nothing is stored in `localStorage` or
   `sessionStorage`.
2. Core answers `201` with `ticket`, `path`, `session_id`, `expires_in` and `kind`. The helper checks the answer. The ticket
   must be 43 URL-safe characters, `session_id` must be text, and `path` must be exactly `/ws/tfd/agent-terminal/<ticket>/`.
   Anything else refuses, and no socket opens.
3. The helper opens `wss://<host>/ws/tfd/agent-terminal/<ticket>/`. The host comes from the API address: `https` gives `wss`,
   `http` gives `ws`. The address has no query string, no token and no subprotocol.

A ticket lives 30 seconds and works once. The helper asks for a fresh ticket on every open, never reuses one and never retries
one. Ask for a new terminal for each terminal tab.

The socket must open within 10 seconds. If it does not, the helper closes it and rejects with `Tactical's terminal did not answer. Try again.`

The ticket never appears in an error message, a console line or a stored value.

## Session

| Member | What it does |
| --- | --- |
| `sessionId` | The id Core issued with the ticket. |
| `status` | `connecting`, `open` or `closed`. |
| `on(event, fn)` | Listens for `output`, `error`, `info` or `close`. Returns a function that removes the listener. |
| `start({ shell, runAsUser })` | Starts the shell. Sends `{action: 'start', shell, run_as_user}`. `shell` is text of at most 260 characters with no control characters. Empty means Tactical's default shell. |
| `input(text)` | Sends typed text. Sends `{action: 'input', data}`. Text must not be empty, and must be at most 64 KB. |
| `resize(rows, cols)` | Sends `{action: 'resize', rows, cols}`. Each is a whole number from 1 to 1000. |
| `kill()` | Sends `{action: 'kill'}`. Ends the shell. |
| `close()` | Closes the socket normally. Tactical ends the shell when the socket closes. |

Calling `start`, `input`, `resize` or `kill` before the session is open throws a plain error and sends nothing.

## Events

| Event | Payload | From Tactical |
| --- | --- | --- |
| `output` | `{ output, sessionId, exitCode, done, messageId }` | `trmmcli.output` |
| `error` | `{ message, code }` | `terminal_error`. A bare `{error}` frame (an unknown action) arrives with the code `unknown_action`. |
| `info` | `{ message, code }` | `terminal_info` |
| `close` | `{ code, reason, message }` | The socket closed after it opened. |

Frames that are not JSON, and frames with an unknown action, are ignored. No frame is ever logged.

## Close codes

| Code | `reason` | Message |
| --- | --- | --- |
| 4401 | `signin-ended` | Your terminal session ended. Open the terminal again. |
| 4003 | `not-allowed` | You are not allowed to use the terminal on this endpoint. |
| 4503 | `unavailable` | Tactical's terminal is not available right now. Try again later. |
| 1000 | `normal` | The terminal closed. |
| any other | `unexpected` | The terminal connection closed unexpectedly. |

A close before the socket opens rejects `open()` with the same message, and the error carries `closeCode`.

## Ticket refusals

The helper keeps `error.status` and `error.code` from Core. The text is plain:

| Status and code | Message |
| --- | --- |
| 400 `invalid_agent_id` | Core's text: The agent id is not valid. |
| 401 | Your Tec-Tac session ended. Sign in again. (The shell has already ended the session.) |
| 403 `websocket_owner_required` | This module cannot open that terminal. |
| 403 `tactical_permission_denied` | Core's text, which names the Tactical permission `can_use_terminal`. |
| 404 `object_not_found` | Core's text. |
| 404 `websocket_kind_not_found` | Core's text. |
| 429 `throttle` | Too many terminal requests. Wait a minute and try again. |
| 503 `websocket_unavailable` | The terminal is not available right now. Try again later. |
| Anything else | The terminal could not be opened. Try again. |

The helper does not check `can_use_terminal` before it asks. Core and Tactical decide. Hide your Terminal tab with
`context.hasTacticalPermission('can_use_terminal')` (AD-12). Hiding is not authorization.

## Who may open what

- A module opens terminals for its own id, or for the core module it replaces under AD-20. Another id is refused before any
  request, with an error that names the module and the ids it may use.
- The same guard covers `api`, `apiRaw`, `apiBlob` and `apiText`. A call to `/api/tfd/tactical-websocket/<other id>/...` is
  refused, however the path is written. Use `tacticalWebSocket.open` instead.
- Public modules (`registerPublic`) do not get `tacticalWebSocket`.
- A module whose `register()` failed or timed out cannot open a terminal.

## Lifetime

- A module may have 8 terminals open or connecting at once. A ninth is refused with a plain message.
- Every terminal a module opened is closed when the module is cleaned up (its `register()` failed, timed out or was abandoned),
  and when the module is unloaded because it was switched off while the page was open.
- Every terminal the shell opened is closed when the Tactical session ends (`tec-tac:tactical-session-invalid`) and when the page
  is left (`pagehide`).
- There is no automatic reconnect. A dropped terminal reports `close`. Open a new terminal to continue, which needs a new ticket.

## Requirements

- Core 1.17.31 or later, for the ticket route `POST /api/tfd/tactical-websocket/<module_id>/<kind>/tickets/` and the socket
  `/ws/tfd/agent-terminal/<ticket>/`.
- The API origin in the Content Security Policy keeps its `wss://` form. `scripts/tec-tac-csp.sh` already adds it to
  `connect-src`.
- The reverse proxy must send `/ws/tfd/agent-terminal/` to Core's socket server. Core 1.17.31 assumes the existing `^/ws/`
  location already does this. That is not confirmed on the dev server yet (see `reviews/requests/core.md`).

## Contract row (`ui.authenticated.websocket`)

Core writes the export row. The row is:

- id `ui.authenticated.websocket`, phase `authenticated`, service `tacticalWebSocket`;
- operations `open`, `session.start`, `session.input`, `session.resize`, `session.kill`, `session.close` and `session.on`;
- events `output`, `error`, `info` and `close`;
- the close codes 4401, 4003 and 4503 with the messages above, and 1000 and the rest;
- the ticket route, its refusals, and the rule that a ticket lives 30 seconds, works once, and that a new one is asked for each
  terminal tab;
- the bound-module rule above;
- Core 1.17.31 or later, and UI 0.12.102 or later.

This UI release does not claim that the export lists the row yet. `reviews/requests/core.md` asks for it.
