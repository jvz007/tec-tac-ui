# UI 0.12.125

Date: 3 November 2026. Requires Core 1.17.104 or later (raised from 1.17.98).

## What changes for you

You can now see at a glance which installed modules have a newer version, and why an update can't install yet. This closes the request "From core 1.17.104 (3 November 2026): module update badge, highlighted rows and notices" (phase 1b of `docs/planning/module-auto-update/PLAN-MODULE-UPDATES.md`). Nothing installs by itself: you still install an update through the Online catalogue, as before.

**1. A badge on the Modules menu entry.**

- It shows how many installed modules have an update, from Core's `GET /api/tfd/modules/updates/count/`.
- Only people who can manage modules see it. Anyone else gets 403 from Core, and the badge stays hidden.
- It is read once when the shell loads, and again when you open the Modules page. It is not read on a timer.

**2. Highlighted rows on Settings → Modules.**

- A module in Core's `GET /api/tfd/modules/updates/` list gets a light highlight and a chip under its version: "Update available 1.3.0 (minor)". The level is patch, minor or major. For any other version shape (a pre-release or a `-N` rebuild) the bracket is left out.
- When Core gives a release-notes link, a "Release notes" link opens it in a new tab. Only https links are shown.
- When an update can't install yet (for example, it needs a newer Core or a missing module), its reason shows under the chip in plain text.
- The same chip shows on the Online catalogue tab. A blocked update shows "Blocked" (the reason is its tooltip and is also under the chip) and has no Download update button.

**3. An "Updates available" filter.**

- On the Installed table, next to the category filter: "All modules" or "Updates available (n)". It lists only the modules in Core's update list.

**4. The notice.**

- Core 1.17.104 raises a "Module update available" notice for superusers. It shows in the existing bell and as a toast, like the failed module-job notices, with "Open Modules" going to `/modules`. This needed no new code; a new test proves the existing path shows it.

## For module developers

- The shared kit `DataTable` has one new optional prop, `rowClass(row)`, which returns one class name for a row. Without it, nothing changes. No module uses a prop of that name today (checked with a search of `modules/*/package/extensions/*/ui/`). `docs/module-components.md` lists it.
- No registry, runtime helper or `api()` behaviour changes. The new reads go through `apiFetch` in `src/api.js`, with Core's session, and keep nothing in browser storage.
- `coreNavigation(context, extras)` takes an optional second argument; the one-argument call works as before.

## Assumptions

Recorded as information in `reviews/questions/ui.md` (Q96):

- The badge is refreshed when the shell loads and when the Modules page loads, not when a notice arrives.
- The browser asks only when the person has `manage_modules` or is a superuser; Core's 403 decides.
- The installed table has no Update button, so "no Update button" applies to the Online catalogue's Download update button. The page also refuses to stage a blocked update.
- The filter is a select on the Installed table, shown only to people who can read the update list.

## Checks

`npm test` runs 200 test entries. New: `tests/module-updates-0.12.125.mjs` (the chip text for each level, the https-only link, the blocked reason, the badge text, quiet reads of both routes, a 403 hiding the badge and emptying the list, no request without the permission, sign-out clearing the count, the Modules menu badge, the highlighted rows and the escaping of Core's text, a blocked update with no button, the filter, the stage guard, tokens only in the new styles, and Core's notice toasting with "Open Modules" to `/modules`). The release test is now `tests/release-0.12.125.mjs`. Changed on purpose: `api-contract-routes-0.12.58-1.mjs` (the two Core 1.17.104 routes added by name until the next signed contract export carries them) and `test-runner-0.12.117.mjs` (the release test name). `npm run build` built.

200 test entries ran on this PC. 199 passed. The one failure is the known failing test below.

## What could not run

The packaged install on tt01 or dev02 was not run here. The page was not tried against a live Core 1.17.104; the tests use stubs with Core 1.17.104's answer shapes, read from its release notes and `module_updates.py`. Pack and sign belong to the release manager.

## Known failing test

`tests/theme-tokens-0.12.114.mjs` fails because Report Manager 0.7.4 defines `.tt-win`. That is requested from the core-modules area and is not fixed in this release. It failed before this release too.

## Left out, and why

- The automatic install (policy, approval queue, schedule, history) is phase 2 and later. Core has not built it yet.
- A badge refresh when a notice arrives: not asked for, and the request says to load the count with the shell, not on a timer.

## Dev-server checklist

Run on tt01 or dev02 with Core 1.17.104 and this UI installed. Have at least one installed module with a newer release in a synced repository.

1. **Sign in as a superuser and look at the Modules menu entry.** PASS: a badge shows the number of modules with an update, the same as `count` in `/api/tfd/modules/updates/count/`. FAIL: no badge, or a different number. Send back: a screenshot of the menu and the answer of the count route.
2. **Open Modules, Installed tab.** PASS: each module with an update is highlighted, with "Update available x.y.z (patch|minor|major)" under its version, and the version and level match `/api/tfd/modules/updates/`. FAIL: a row is missing, a wrong version or level, or a module without an update is highlighted. Send back: a screenshot and the answer of the list route.
3. **Choose "Updates available" in the filter next to the category filter.** PASS: only the modules in the update list are listed; "All modules" shows them all again. FAIL: any other module is listed. Send back: a screenshot.
4. **Check a blocked update (for example, one that needs a newer Core).** PASS: the reason shows under the chip; on the Online catalogue tab the row shows "Blocked" and no Download update button. FAIL: the Download update button is offered. Send back: a screenshot of both tabs and the list route's row for that module.
5. **When a row has a release-notes link, click "Release notes".** PASS: it opens in a new tab and the row is not selected. FAIL: it opens in the same tab, or a non-https link is shown. Send back: the `release_notes_url` value and a screenshot.
6. **Sync repositories after a new module version is published, then wait up to a minute.** PASS: one "Module update available" toast and a bell entry; "Open Modules" goes to the Modules page. FAIL: no toast and no bell entry while the list route shows the update with `source_current: true`. Send back: a screenshot of the bell and the answer of `/api/tfd/ui/notices/?state=unread`.
7. **Sign in as a user without module management.** PASS: no badge on Modules, no update filter, and the Network tab shows no request to `modules/updates` (or a 403 only). FAIL: a badge or update data shows. Send back: a screenshot and the Network list filtered on `modules/updates`.
