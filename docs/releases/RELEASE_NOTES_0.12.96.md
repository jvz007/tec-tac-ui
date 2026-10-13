# UI 0.12.96

Date: 12 October 2026. Requires Core 1.17.22 or later (raised from 1.17.20).

## What changes for you

- **Limit a role to some clients or sites.** The role form has a new tab, **Clients & sites**. Tick whole clients, or single sites grouped under their client. Search, tick and remove with chips. Nothing ticked means the role sees every client and site, and the tab says so. Ticking only sites puts the role in site mode, and the tab says that too. The lists save with the role through Tactical's own role routes. If the role already holds a client or site you cannot see, it shows as "Client #12 (not visible to you)" and is sent back when you save, so nothing is lost. A superuser role shows the lists but cannot change them here. Core writes the audit row.
- **Add client asks for the first site name.** The new client dialog has a required **First site name** field. Before, Tactical named the first site "Default Site". Core's own refusal text shows as sent, for example "Client name cannot contain the | character". After you create a client, **Edit fields** opens its custom fields. If your role is limited to sites only, the notice tells you Tactical does not add the new client to your access, and that an administrator must.
- **Clients & Sites follows your Tactical role.** The menu entry shows when you can list clients or list sites, or you are a superuser. With only List sites, the page reads the sites and groups them under their client. With neither, the page says "Your role cannot list clients or sites." and sends no request. A refused read shows Core's message and never tries the other read.
- **First-login two-factor set-up.** If your set-up session ended, the sign-in page says "Your setup session ended. Sign in again." and takes you back to the password step.
- **One Yes or No question instead of typing names.** Core's own pages now ask "Are you sure?" with Yes and No. The question names the target (user, role, schedule, module, dashboard) and, for a bulk action, the number of endpoints. Focus starts on No, and Escape answers No. No page asks you to type a name, a hostname or a number any more, and no page uses the browser's OK and Cancel box. This covers Delete user, Reset password, Reset 2FA, Delete role, revoking login sessions, My Account resets, Preferences resets, Delete dashboard, Remove repository, Roll back hotfix, dangerous module actions and quick actions. Modules enable, disable and uninstall lose the "Type the module id" field. Schedules lose the typed name on Run now and on force delete.

## What stays as it was

- The hand-back second step on Modules (a checkbox and a separate Switch off button) stays. It has no typed text.
- Backup and Restore "Confirm restore", Storage "Purge now" and the Delete client or site dialog keep their layout. Each shows facts or a choice you must read, and none asks for typed text. This is a question for Johan (`reviews/questions/ui.md`, Q26 and Q27).
- Permissions, scope, caps and audit rows do not change. Hiding a button or answering Yes is never authorisation. Tactical and Core decide every call.

## What you do not get yet

- **Custom fields inside the Add client and Add site forms.** Core has no read of the field definitions before a row exists. Until it does, use **Edit fields** right after you create. The request is filed for Core.
- Modules keep their own confirmation dialogs until they move to the shell dialog. The requests are filed for each module.
- The right-click menus on Clients & sites, the session theme choice, End all sessions for all users, and the popup and table layout are not in this release.

## For module developers

- `context.confirm(options)` is new in `register(context)`. It is bound to your module, so the dialog shows "Asked by <your module id>". It is refused after a failed or timed-out `register()`. A context action handler gets the same helper as `context.confirm` on its argument. The shell's value wins over a key the caller supplied, and every other key is passed through. Nothing in `modules/` read `context.confirm` before, so no module changes behaviour.
- Options: `question` (required, 300 characters), `target` (200), `count` (a whole number of 1 or more), `noun` (30), `detail` (400), `danger`, `yesLabel` and `noLabel` (24). Text is shown as text. There is no input field. Requests queue and show one at a time. A missing question rejects with a `TypeError`.
- Details: `docs/module-runtime-api.md` ("confirm(options)") and `docs/context-actions.md`.
- `context.router.addRoute` now refuses a path or alias that starts with `/popup/`. The shell owns that prefix. It also refuses an alias that another path or alias already owns.

## For the maintainer

- New files: `src/confirm-dialog.js` (service, option cleaning, queue, `useConfirm`), `src/components/ConfirmDialog.vue`, `src/role-scope.js`, `src/components/access/RoleScopePicker.vue`, `src/resource-directory-read.js` (read mode, `groupSitesByClient`, paged reads).
- `src/App.vue` mounts the dialog outside the popup condition, so popup windows get it. Sign-out answers every open or queued request No. `src/main.js` provides `tecTacConfirm`. `src/module-loader.js` adds `bindConfirm`. `src/context-actions.js` adds the bound `confirm` to the handler argument, in both the module-scoped and the shell-level `execute`.
- `src/components/access/RolesPanel.vue` keeps every key Tactical returned. Only `can_view_clients` and `can_view_sites` are normalised (unique whole numbers, sorted). The snapshot, the unsaved-changes guard and Discard include both lists. The directory is read once, on the first visit to the tab, by the editor's flags: clients when the editor can list clients (or is a superuser), else sites when it can list sites, else nothing.
- `src/views/ResourcesView.vue`: the site pane reads nothing. The selected client carries its sites (clients mode), or the grouped list does (sites mode). Search and paging are local. In sites mode every site is read once, in pages of 500, up to 40 pages. Large estates should use List clients.
- `src/api.js`: `createResourceClient({ name, siteName, customFields })` and `createResourceSite({ clientId, name, customFields })`. A plain string still works for the client.
- `ModulesView.vue` no longer has `confirmText`. `confirmAction` and `closeConfirm` keep their names, so the extracted-function tests still run.
- Tests: `tests/role-scope-pickers-0.12.96.mjs`, `tests/resource-create-fields-0.12.96.mjs`, `tests/resources-menu-rule-0.12.96.mjs`, `tests/confirm-dialog-0.12.96.mjs`, `tests/confirm-dialog-adoption-0.12.96.mjs`, `tests/popup-route-prefix-0.12.96.mjs`, all in the `test` script. `tests/core-navigation-resources.mjs` gained the List sites rule. `tests/foundation.sh` now asserts the shell dialog on Schedules and that the typed schedule name does not return. The eight Core requirement pins moved to 1.17.22.
- `docs/ui-design-standards.md` section 8.1 still describes typed confirmation. It is left unedited until Johan signs off the change. The same applies to `docs/tec-tac-module-standard.md` line 107 and `docs/review-accepted-decisions.md` line 266 (root `docs/`, not touched here).
- `RELEASE_NOTES_0.12.95.md` moved to `docs/releases/`, as earlier releases were.

## Checks and gaps

- `npm test` runs the whole chain and passed. `python3` must resolve for `tests/foundation.sh`; on this PC a shim outside the repo was used. `npm run build` passed.
- Nothing was run in a browser. The dialog, the role tab and the Clients & Sites read modes are covered by unit tests and source checks, not by a mounted page. Focus on No, the Tab loop and the backdrop click are not exercised in a real browser.
- The dialog answers No when the service is missing (a test mount), never `window.confirm`.
