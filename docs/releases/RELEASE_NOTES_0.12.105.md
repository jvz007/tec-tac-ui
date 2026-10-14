# UI 0.12.105

Date: 14 October 2026. Requires Core 1.17.34 or later (raised from 1.17.33, the Core release this UI was built and tested against).

## What changes for you

- **The server terminal can open.** Tec-Tac's shell can now open Tactical's server terminal for a superuser. Nothing on screen changes until the Global Settings module adds its Terminal entry in a later release.
- **Clear messages when it will not open.** You see a plain sentence if you are not a superuser, if Tactical has the server terminal turned off, if Core could not record the session, or if your superuser standing ended.

## What stays as it was

- The endpoint terminal (`agent-terminal`) works exactly as before: same ticket, same frames, same messages.
- The job follow service is unchanged. Open question Q47 stays open, and we are still going on assumption (a) until Johan answers.
- The sign-in screen, notifications and every installed module keep working without a change.

## What you do not get yet

- **No screen uses the server terminal yet.** Global Settings adopts it in a later release. No module in `modules/` calls the new kind today.
- **The browser contract export** does not list the server-terminal kind yet. Core writes that row (`reviews/requests/core.md`). This release does not claim the export lists it.

## For module developers

- **`context.tacticalWebSocket.open('globalsettings', 'server-terminal', { signal })`** opens the server shell. Pass no `agentId`: the helper refuses one before any request.
- The ticket body is exactly `{}`. The socket path must be exactly `/ws/tfd/server-terminal/<ticket>/`. One ticket per open, no retry.
- There is no start frame. The shell starts when the socket opens, and `session.start()` throws. `session.input` sends `trmmcli.input`, `session.resize` sends `trmmcli.resize`, `session.kill` sends `trmmcli.disconnect`. Tactical's `trmmcli.output` reaches the `output` event.
- Close codes: 4401 `signin-ended`, 4003 `not-allowed`, 4502 `audit-unavailable` (no shell started), 4503 `unavailable`, 1000 `normal`. 4502 and 4003 are terminal refusals; nothing reconnects.
- Ticket refusals 403 `superuser_required` and 403 `server_terminal_disabled` have their own messages and are never retried. `error.status` and `error.code` are kept.
- Only the module's own id may open this kind. The AD-20 replaced-module exception does not apply to it. `agent-terminal` keeps the exception.
- The helper sends nothing extra for session activity. Core counts input and resize on the server.
- Pair it with the shared `context.terminal` widget as shown in `docs/module-terminal.md`.
- The full contract is in `docs/module-tactical-websocket.md` and `docs/module-runtime-api.md`. All of this is additive.
