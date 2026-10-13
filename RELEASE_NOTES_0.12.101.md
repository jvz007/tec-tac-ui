# UI 0.12.101

Date: 14 October 2026. Requires Core 1.17.28 or later (unchanged).

## What changes for you

- **A Core notice pops up once.** A notice such as "Module job failed" appears as a pop-up (a toast) once for you in this browser. It no longer comes back every 30 seconds, and it does not come back after you reload the page.
- **Clicking Open Modules marks the notice read.** Clicking the × on the pop-up also marks it read. Either way the notice leaves the unread count. A pop-up that fades by itself does not mark the notice read. The notice stays in the bell until you read it or clear it.
- **A new notice still pops up.** A notice created after your last check pops up once. This is true even when it arrives while the page is open, or after a poll restarts.
- **Older notices wait in the bell.** When you open Tec-Tac, a notice created before your last visit does not pop up again. It stays in the bell.
- **Notice memory stays in your browser.** Tec-Tac stores the ids of the notices it has shown and the time of your last check, per person. It stores no notice text and no token. If your browser blocks storage, the page remembers the notices only until you reload.
- **Add API key needs your account id.** If Tec-Tac cannot read your account id, Add API key is turned off, with a line that says to sign in again. Tec-Tac does not guess an owner. Edit still works.
- **API keys and Single sign-on keep your place when they refresh.** Refresh, and the reload after a save or a delete, keep the page open. An open editor, the one-time key window and the provider window stay put. The list buttons wait while the list reloads, and the page says "Refreshing…".
- **Unsaved sign-in settings stay as you set them.** On Single sign-on, Refresh keeps the two checkboxes you changed until you save them.
- **A layer for top-bar pop-ups.** The shell now has a layer that a header pop-up can use, so the pop-up is not trapped under the top bar. No module uses it yet, so Alerts keeps its own placement for now. Shell dialogs still open above it.

## What hides, and for whom

- **Add API key:** shown for a role that can manage API keys. It is turned off, with its reason, when Tec-Tac cannot read your account id and your role cannot list Tactical users.
- **Module services:** a service a module publishes is shown to another module only when the person passes that service's checks. A service the person may not use is hidden and cannot be called.

## What stays as it was

- Every notice you already have stays in the bell. Clearing or reading a notice works as before.
- The toast API that modules use (`notifications.info`, `success`, `warning`, `error`, `show`, `dismiss`, `clear`) does not change.
- Context actions, resource views, dashboards, the module loader and `api()` do not change.
- Single sign-on and API keys still need the same Tactical permissions as before.

## What you do not get yet

- **No module uses the new service registry yet.** Script Execution, Checks, Alerts, Automation, Tasks and Software move to it in their own releases. Until then their actions work as they did.
- **Alerts keeps its own pop-up layer** until Alerts adopts the header pop-up layer.
- **The background job-follow service** (for a job that finishes after you leave the page) is not in this release.
- **The Tactical WebSocket helper** waits for Core's terminal ticket.
- **Universal filters** wait for Core's filter-set contract.
- **Save all UI preferences** is not built. It needs a Core request first (`reviews/requests/core.md`).
- **The production gate for uncategorised modules** is not built.

## For module developers

- **`services` in `register(context)`.** A module can publish a named browser operation with `services.provide(name, handler, options)`. Another module can check it with `services.has(name)`, call it with `services.call(name, args)` and list it with `services.list()`. The name must begin with your module id and a dot. Permission is checked on every call. A refused call has the code `service_denied`; a missing service has the code `service_unavailable`. The handler receives `(args, { caller })`, and `caller` is bound by the shell. See `docs/module-services.md`.
- **`header.popoverTarget`** is `'#tec-tac-popover-layer'`, a selector for `<Teleport :to>`. Use it for a header pop-up. See `docs/module-header.md`.
- **`context.context.user.id`** is Tactical's own user id. It is documented in `docs/module-runtime-api.md`. Use it only when it is a whole number of at least 1.
- Every addition is optional. A module built for UI 0.12.100 keeps working.

## For the maintainer

- New files: `src/module-services.js`, `src/load-phase.js`, `docs/module-services.md`.
- Changed: `src/notifications.js` (per-person toasted ids, first-check rule, mark-read on dismiss and action, `dismissByPerson`, `markRead` takes an id or a row), `src/main.js` (person key, service registry), `src/App.vue` (× calls `dismissByPerson`, popover layer element), `src/styles.css` (one rule for the popover layer), `src/module-loader.js` (services bound per module), `src/header-contributions.js` (`popoverTarget`), `src/api-keys.js` (`selfOwner`), `src/components/access/ApiKeysPanel.vue` and `src/components/access/SsoAdminPanel.vue` (first-load-only loading, refreshing state, disabled list controls, owner check).
- Docs changed: `docs/module-notifications.md`, `docs/module-header.md`, `docs/module-runtime-api.md`, plus the new `docs/module-services.md`.
- New tests: `notice-toast-once-0.12.101`, `access-panels-reload-0.12.101`, `module-services-0.12.101`, `header-popover-layer-0.12.101`. All four are in the `test` script.
- The Q40 choice (a first check toasts a notice created since the last check) and the Q41 and Q42 choices are logged in `reviews/questions/ui.md` for Johan.
- `RELEASE_NOTES_0.12.100.md` moved to `docs/releases/`, so the root holds this note only.
