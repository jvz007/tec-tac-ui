# UI 0.12.112

Date: 16 October 2026. Requires Core 1.17.43 or later (raised from 1.17.41, the Core release this UI was built and tested against). Core 1.17.42 added `sync_schedule` and the seeded repository. Core 1.17.43 seeds that repository disabled and reads an installer exit status of 78 as "nothing was changed".

Patterns: P1 (list page card) for the Repositories sync card, P4 (input dialog) and P9 (result dialog) for the module dialog host, and P6 (script and report picker) for the SearchSelect server mode, all from the brand board, `docs/ui-brand-board/`. The row menu reuses the existing right-click menu, so it needs no pattern.

## What changes for you

- **The Repositories page shows the daily sync.** Above the repository table, a card titled "Daily sync" shows whether the sync is On or Off, the time and zone Core sends (for example "03:00 Africa/Johannesburg"), when the next sync runs and when the last one ran. "Not yet" shows when a time is missing. Core's last result is shown as a small label. The card says the daily sync runs enabled repositories only.
- **A disabled repository says so.** A repository that is disabled shows "Enable it to sync." under its State label. Its Sync button stays disabled, as before. To enable one, open it and tick Enabled, as you already do. Core 1.17.43 seeds its own repository this way, disabled. It is an ordinary row: the UI adds no label and no special button, and shows the address only to people who can manage modules (Core sends everyone else the redacted form).
- **The card can say the sync is not set up.** When Core sends no schedule, the card says "The daily sync is not set up yet." When Core is older than 1.17.42 and sends no schedule at all, the card is not shown and the page looks as it did.
- **System updates says when an update was refused.** When Core reports that the installer refused before it changed anything, the job shows "Update refused, nothing was changed". The installed version stays in place.
- **Module dialogs are available to modules.** A module can now open a dialog above the page, in the same layer as Quick Actions. Escape, the close button and a backdrop click ask the module before they close it, so unsaved work is not lost by accident. Nothing changes on a page that does not use one yet.
- **The sign-in landing hook is available to modules.** A module can ask the shell to send a person to its own page right after sign-in. Nothing is redirected until a module uses the hook. Welcome adopts it at its next release.
- **A shell right-click menu for module tables is available to modules.** The Menu key and Shift+F10 work too. No module uses it yet, and Checks keeps its own menu until its next release.
- **Long picker lists can load from the server.** A module can switch the shared picker to server mode, so a list of thousands of agents is searched and paged on the server. Every picker in use today behaves as before.
- **Nothing else changes.** No screen is restyled. The Online catalog is unchanged: while the seeded official repository is disabled, Core's sentence still says that no module repository is set up.

## For module developers

- **`context.dialogs`** (`register(context)`). `dialogs.register({ id, title, size, mount(element, { close }), beforeClose })` names a dialog, and `dialogs.open('<id>')` or `dialogs.open({ id, title, size, mount })` opens it. One dialog at a time. A module opens only its own dialogs. Size `'wide'` is the 760px panel; anything else is the 520px default. A refused open rejects with a plain error (status 0, no code). `mount` must finish within `context.module_register_timeout_seconds`, or the dialog shows a plain error line with a Close button. A failed dialog closes at once, without asking `beforeClose()`. Full rules: `docs/module-dialogs.md`.
- **`context.signInLanding`** (`register(context)`). `signInLanding.register({ id, permission, check })`. The check returns nothing (carry on), a route path, or `{ dialog: '<module id>.<dialog id>' }`. It runs once per page load, only on the default landing (`/` or `/dashboards`), never in a popup window, on a public or sso page, while signed out, or for a deep link. A route must be one of the module's own pages or one of Core's named pages. A dialog must be one the module registered. Unsaved changes win. Full rules: `docs/module-sign-in-landing.md`.
- **`context.rowMenu`** (`register(context)`). `rowMenu.open({ event, element, label, items })` shows the shell's right-click menu, where each item is `{ id, label, hint, danger, disabled, reason, run }`. It opens at the pointer, or under the focused row for the Menu key and Shift+F10. `rowMenu.shouldHandle(event)` leaves a right-click on a text field to the browser. At most 40 items. Labels, hints and reasons are plain text. `run()` errors are contained and warned. No item runs after the module is unloaded. One menu is open at a time. It is refused in a popup window, while signed out and outside a signed-in session. The menu sits in layer 1150: above a module dialog (1100), under toasts (1200), the unsaved-changes prompt (1300) and the Yes or No confirm (1400). A denied action is left out by the module (AD-12); a disabled one shows its `reason`. Full rules: `docs/module-row-menu.md`.
- **`SearchSelect` server mode** (from `context.components`). New props, all off by default: `serverSearch` (the module owns the filtering: no local filter, no 300-row cap, up to 1000 loaded rows), `loading` (one quiet "Loading…" line and `aria-busy`), `hasMore` and `selectedLabel` (the label of a chosen value that is not in the loaded rows). New events: `search` (the typed text, also sent when the list opens) and `more` (sent once when the highlight reaches the last row or the list is scrolled to its end, and not again until `options` changes or `loading` ends). Typing never changes `modelValue`. Static lists keep the local filter and the 300-row cap. Full rules: `docs/module-components.md`, "Server search and paging".
- **Component definitions are frozen all the way down.** `context.components` was frozen on its top level only. Each component's options object, props and emits are now frozen too, with the built-in constructors the props name (`Array`, `String` and so on) left alone. Both components render and behave as before (this is checked in the tests). This closes the held Low "Object.freeze is shallow" from the 0.12.111 review.
- **Contract rows.** `ui.authenticated.dialogs`, `ui.authenticated.signInLanding` and `ui.authenticated.rowMenu` are written in `docs/module-runtime-api.md` as "not yet in the export". The new `SearchSelect` props and events are written there as an addition to `ui.authenticated.components`, also "not yet in the export". The newest export (1.17.43-0.12.111) has none of these. Core writes the export rows (`reviews/requests/core.md`). This release does not claim the export lists them.
- **None of these goes to `registerPublic(context)`.** Public pages get no `dialogs`, `signInLanding` or `rowMenu`.
- **No module change is needed.** Modules built before this release keep working. No module in `modules/` uses the new helpers or passes the new `SearchSelect` props, and none uses Core's repository sync route. The `SearchSelect` change touches a component that Agents 0.11.1, Checks 0.16.0, Report Manager 0.6.1 and Tasks 0.9.0 already call, so their calls were read against the change: none passes a name that now means something.

## Repositories (Core 1.17.43)

- The card reads `sync_schedule` from `GET /api/tfd/modules/repositories/`. It is display only. Nothing reads it to decide a button, a filter or a request.
- **Where the fields come from.** The 1.17.43 export (`docs/contracts`, 1.17.43-0.12.111) lists only the four repository routes, not their response fields. The six keys of `sync_schedule` (`enabled`, `time`, `timezone`, `next_run_at`, `last_run_at`, `last_run_status`) come from Core 1.17.43's own `docs/module-repositories.md` and `contracts.py`. The card tolerates a missing or mistyped key: a wrong type shows as a dash, "Not yet" or nothing, never an error. The UI shows only what Core sends; it does not work out a local time.
- Every value is shown as text. Timestamps use the person's date format.
- Enabling a disabled repository is the existing repository edit. The editor sends the five fields it always sent (name, index URL, priority, trust and enabled), which is how it has always saved. No new route is used.

## Installer refusal (Core 1.17.43 request, "From Core 1.17.43: UI installer refusal exit status")

- `scripts/install.sh` now has `refuse()`. It prints `[TEC-TAC-UI] ERROR: <reason>` and then `[TEC-TAC-INSTALL] REFUSED: <reason>` on stderr, and exits with status 78.
- It refuses only before the first change to the live deployment, in three places: the Tactical frontend `env-config.js` is missing, `npm` is missing, and the staged `sync-modules.sh` preflight fails. Core's helper treats any 78 as "nothing changed", so no 78 can come after `mkdir -p` of the deploy base.
- Every other failure ends with status 1: not root, `npm ci` or the build failing (an error trap now forces 1, so a child that happens to exit with 78 cannot read as a refusal), a missing `dist/index.html`, and everything after the backup. A failure after the first live change keeps the full rollback.
- System updates shows "Update refused, nothing was changed" when `job.rollback.reason` is `installer-refused`. The other rollback wording is unchanged.

## Screenshots

- **Module dialog host**, rendered on a scratch page that mounts the real `ModuleDialogHost` and `styles.css` and opens a wide dialog on load: dark, light, high contrast, and the failed state (the plain error line with a Close button). All four were checked by eye in the earlier run of this release.
- **Repository sync card**, rendered on a scratch page with the real helper and `styles.css`, using the same markup as the Repositories page: dark, light and high contrast with a schedule, and dark with no schedule. This is a copy of the markup, not the Repositories page itself, because the page needs a signed-in session. Checked by eye in the earlier run.
- **Not taken in this run:** screenshots of the row menu and of the SearchSelect "Loading…" line (dark, light, high contrast), the Repositories page itself and the first-run Welcome flow. This session has no browser to drive and the pages need a live Tactical session. Both new surfaces reuse existing classes and tokens (`.resource-menu`, `.tt-combo ul li.none`), so the risk is low, but the screenshots are still owed.
- **Not clicked through in a live browser:** the keyboard behaviour of the dialog host (Tab stays inside, Escape order against Quick Actions and the notice drawer) and of the row menu. They are covered by tests of the rules, a render of the components through a minimal renderer, and by reading the code.

## Left out, and why

- **Welcome adoption.** Welcome is not in `modules/` or `modules/catalog.toml` in this tree. Its owner is not known (UI Q69). It adopts the hook and the dialog host at its next release (request filed under core-modules, see `reviews/requests/core-modules.md`).
- **Core's contract export rows** for `ui.authenticated.dialogs`, `ui.authenticated.signInLanding`, `ui.authenticated.rowMenu` and the `SearchSelect` additions. Core writes them (`reviews/requests/core.md`).
- **Adoption by modules.** Checks moves to `context.rowMenu`, and Script Manager to `serverSearch` for its Run test agent picker, at their own next releases (`reviews/requests/core-modules.md`). Nothing in `modules/` is changed.
- **Enable button.** Left out. Enabling is the existing repository edit (see above).
- **Theme tokens, density, secondary button, field label size, toast corners** (brand board Q57 to Q62). They wait for Johan's go. No restyle in this release.
- **Universal filters, UI half.** Core has not published the filter-set contract yet.
- **Production gate** (show a module without a category as refused). Waits until Johan names the release.
- **Policy fields on Edit client and Edit site** (AU8, AU10). They belong to Automation.
- **Q44** (jobs follow service). Johan's call; nothing removed.
- **Held Low "module `load()` still runs when the host signal is already aborted"** (`resource-views.js`). It changes behaviour that Checks, Patching and Endpoints rely on, so it goes in a UI release of its own.
- **Q63 and Q64** (SearchSelect opening and TagEditor commas). Still open as in 0.12.111: the full list still shows on focus, and the comma default is unchanged.
- **Policy and trust behaviour of the official repository** (CQ125, CQ126). The UI shows only what Core sends.

## Open questions for Johan

- **UI Q66, sign-in landing reload.** The check runs once per page load, kept in memory. A reload on the dashboards runs it again; the module's own setup-complete state is the brake. The alternative is a small session flag, cleared at sign-out.
- **UI Q67, where a landing route may point.** Built: only the module's own pages and Core's named pages. The alternative is any page.
- **UI Q68, dialog backdrop click.** Built: a backdrop click, Escape and the close button all ask `beforeClose()` first. A failed dialog closes at once.
- **UI Q69, who owns Welcome.** Core-modules, provisionally. Welcome is not in the catalog.
- **UI Q70, SearchSelect server mode switch.** Built: an explicit `serverSearch` prop. The alternatives were to infer it from a `search` listener, or to wait for Script Manager to prove the shape.
- **UI Q71, row menu shape.** Built: `rowMenu.open({ event, element, label, items })` in layer 1150, at most 40 items, plain text, reusing the existing menu look. The alternatives were a smaller placement-only service, or to wait for a second module to ask.

## Tests added or changed

- New: `module-dialogs-0.12.112.mjs`, `sign-in-landing-0.12.112.mjs`, `repository-sync-schedule-0.12.112.mjs`, `core-requirement-0.12.112.mjs`, `installer-refusal-0.12.112.sh`, `installer-refusal-view-0.12.112.mjs`, `row-menu-0.12.112.mjs` and `shared-select-server-search-0.12.112.mjs`. All are in the `test` script.
- Replaced in the `test` script: `core-requirement-0.12.111.mjs` is replaced by `core-requirement-0.12.112.mjs`. The old file stays in `tests/`, unused, because it pins 0.12.111.
- Changed: `module-services-0.12.101.mjs` now accepts the keys the loader strips next to `services` (`dialogs`, `signInLanding` and `rowMenu`). The rule it checks is unchanged.
- Changed: `shared-select-tags-0.12.111.mjs` pinned the exact list of `SearchSelect` props and events. Only those two lines moved, to add the four new props and the `search` and `more` events. Every other assertion is as it was, and the whole file passes.
- The installer test runs a copy of `install.sh` with only its root check swapped, in a temp tree, with stub `npm` and `sync-modules.sh`. It checks status 78 and the REFUSED line for the three refusals, status 1 for a failing `npm ci` and for a non-root run, that no refusal creates the deploy base, and that no `refuse` call comes after the first live change.

## Housekeeping

- The 0.12.111 release notes moved to `docs/releases/`.
- `package.json`, `package-lock.json`, `VERSION` and `tec_tac_package.json` are at 0.12.112; the manifest requires `tec-tac-framework >=1.17.43,<2.0.0`.

## Agent checklist (brand board README)

1. Read the board before touching a screen. Patterns named above: P1, P4, P6 and P9.
2. No hex colours and no raw font sizes in the new CSS. Colours are `var(--token)`; the panel uses `modal-panel` and `modal-wide` as they are. The row menu adds one rule, a z-index.
3. No pattern needed a new one. Nothing invented.
4. Screenshots: see above for what was taken in the earlier run and what is still owed.
5. No Decision (D1 to D5) was used in this release.
