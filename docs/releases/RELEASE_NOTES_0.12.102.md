# UI 0.12.102

Date: 14 October 2026. Requires Core 1.17.31 or later (raised from 1.17.28, because the terminal ticket route is new in Core 1.17.31).

## What changes for you

- **The Tactical terminal helper is in place.** A module can now open a Tactical terminal for the signed-in person. The shell asks Core for a single-use ticket and opens the socket with it, so no module holds a token. Each terminal tab asks for its own ticket. Nothing you see changes until a module uses the helper: remote-background 0.5.0 and globalsettings 0.2.0 are the first to use it.
- **A module switched off is unloaded at once.** When a disable or uninstall job succeeds, the module's services, context actions and terminals stop at once. A replacement that a job switched off is unloaded the same way. Then the page reloads, as before.
- **A service needs a permission.** A module cannot publish a service with no permission at all. The provider gets a plain error that names the fix. No service in use today is affected, because no module publishes one yet.
- **Services are hidden outside a backend context.** Before sign-in, or when the context did not come from Core, a service is hidden and its call is refused.

## What hides, and for whom

- **Terminal tabs:** a module hides its Terminal tab with `hasTacticalPermission('can_use_terminal')`. The helper does not check it. Core and Tactical decide every terminal.
- **Services:** a service a person may not use is hidden and cannot be called (AD-12). That now includes every service outside a backend context.

## What stays as it was

- Every existing module loads and works as before. The changes are additive.
- The services API (`provide`, `has`, `call`, `list`) does not change its names. The only change is the new permission rule.
- Context actions, resource views, dashboards, notices and `api()` do not change. The raw path guard now also refuses another module's terminal-ticket path, and nothing in the signed modules calls that path.
- The unload runs only for a module that a job switched off: the module a disable or uninstall removed, and a replacement that a job switched off. Enabling or showing a module does not unload that module. A replacement that enabling its replaced module switched off is unloaded.

## What you do not get yet

- **The server web terminal (ws/trmmcli/, the global-settings terminal)** is not in this release. Its open decision (CQ100) is Johan's. The helper accepts only the terminal kind `agent-terminal`.
- **The command stream socket (ws/agent/<id>/cmd/)** is not in this release. Send command still uses declared operations.
- **The Core contract export does not list `ui.authenticated.websocket` yet.** Core writes that row. The rows for `services` and `tacticalPermission` on navigation, and for `popupPublishers`, are still asked for in `reviews/requests/core.md`.
- **Save all UI preferences** still waits for Core's storage.
- **Universal filters** still wait for Core's filter-set contract.
- **The background job-follow service** is not in this release.
- **The production gate for uncategorised modules** is not built.

## For module developers

- **`tacticalWebSocket` in `register(context)`.** `await context.tacticalWebSocket.open(moduleId, 'agent-terminal', { agentId, signal })` resolves with a session. The session has `start({ shell, runAsUser })`, `input(text)`, `resize(rows, cols)`, `kill()`, `close()`, `status` and `on('output' | 'error' | 'info' | 'close', fn)`. Use your own module id, or the core module you replace under AD-20. See `docs/module-tactical-websocket.md`.
- **A ticket lives 30 seconds and works once.** Ask for a new terminal for each terminal tab. There is no automatic reconnect: a dropped terminal reports `close`, and a new one needs a new ticket.
- **At most 8 terminals per module.** A module that has all 8 open is refused a ninth.
- **`services.provide` needs at least one permission.** Declare one for the module (`permissions` in `tec_tac.json`) or for the service (`permission`, `permissions` or `tacticalPermission`). A service with none throws `Service <name> needs at least one permission: declare one for the module or for this service.`
- **Services are hidden outside a backend context.** A module that reads `services.has()` or `services.list()` before sign-in sees nothing.
- **Your module is unloaded when it is switched off.** Its `cleanup` runs, and so do its services, context actions and terminals. Do not rely on a timer or a socket that outlives `register()`.
- The services change is the only break in 0.12.101 behaviour, and it only affects a provider that declared no permission. None exists.

## Choices made where the request was silent

These are the calls the shell made where the request did not say.

- **Helper shape:** `context.tacticalWebSocket.open(moduleId, kind, options)` resolves with the session, in the style of `tacticalOperation`.
- **Connect time limit:** 10 seconds, then the socket closes and the open is rejected with `Tactical's terminal did not answer. Try again.`
- **Limit:** 8 terminals per module, counted while they connect.
- **Reconnect:** none. A reconnect would need a new ticket and a new terminal start, so the module asks again.
- **Close labels:** the `reason` field of `close` is `signin-ended`, `not-allowed`, `unavailable`, `normal` or `unexpected`. A normal close (1000) says `The terminal closed.`
- **Unload and disabled replacements:** an unload uses the job's `plugin_id` for a disable or uninstall, and `disabled_modules` for any succeeded job. The single job row carries no `module_ids`; only the history list does.
- **Cascade dependants:** a dependant that a cascade disabled is not named in the job row, so it is not unloaded at once. The reload that follows clears it.

## Browser contract (for Core)

- The row `ui.authenticated.websocket` is written in `docs/module-runtime-api.md` (section "Tactical terminal socket") and in full in `docs/module-tactical-websocket.md`. Core writes the export row.
- The services rule (at least one permission; hidden outside a backend context) is in `docs/module-services.md`. Core's services rows are asked for in `reviews/requests/core.md`.

## For the maintainer

- New files: `src/tactical-websocket.js`, `docs/module-tactical-websocket.md`, `tests/tactical-websocket-0.12.102.mjs`, `tests/tactical-websocket-contract-docs-0.12.102.mjs`, `tests/module-unload-0.12.102.mjs`, `tests/module-services-permissions-0.12.102.mjs`.
- Changed: `src/module-loader.js` (`bindTacticalWebSocket`, `unloadUiModule`, the cleanup store, the terminal path guard), `src/module-services.js` (fail closed, `isTrustedContext`), `src/main.js` (the helper, the trusted-context check, `tecTacModuleUnload`, close on session end and on `pagehide`), `src/views/ModulesView.vue` (unload after a succeeded job, before the reload), `docs/module-services.md`, `docs/module-runtime-api.md`, `tec_tac_package.json` (`>=1.17.31,<2.0.0`).
- Tests updated to the new rules and the new requirement: `tests/module-services-0.12.101.mjs` (fixtures given a permission; the `main.js` assertion matches the trusted-context argument), and the framework-range assertions in 17 older tests (`>=1.17.28` is now `>=1.17.31`). This follows the same practice as earlier releases.
- Archived: `RELEASE_NOTES_0.12.101.md` moved to `docs/releases/`.
- `package.json` `test` script: the four new tests are appended.
