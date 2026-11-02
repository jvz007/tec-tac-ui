# UI 0.12.123

Date: 30 October 2026. Requires Core 1.17.97 or later (raised from 1.17.67).

## What changes for you

Two things.

**1. The Scheduler page handles schedules of an uninstalled module (Core 1.17.97, Johan's request of 30 October 2026).**

- A schedule whose owner module is not installed shows an **Owner module not installed** label next to enabled or disabled. Core's own label is used when it sends one.
- Such a row does not open the editor. Its **Run now** button is off, with the reason as its title. The Module schedules note gets a second sentence for these rows.
- Scheduler managers see **Disable** and **Remove** on those rows. Disable is hidden once the schedule is disabled. Remove asks a plain Yes or No: no typing. Run history stays.
- A new **Owner module not installed** tick box sits beside the Created by and Confirmed by filters. It asks Core for these rows only (`?orphaned=true`). Every earlier query string is unchanged.
- A panel lists each uninstalled module with its schedule count and how many are enabled. **Disable all** and **Remove all schedules of this module** ask Yes or No first. The question names the module and the count. Core's answer is shown as one sentence, for example "Removed 4 schedules of patchmanagement. 1 outside your scope was left alone." Schedules outside your scope are counted in one line and left alone.
- If Core could not read the module registry, the page shows one notice and offers no Disable or Remove anywhere. If Core could not read the module state, one sentence says it is hiding every module-bound schedule.
- Errors are plain sentences: not a manager or outside your scope, the module is installed again (the list reloads), a run is queued or running (try again later; there is no force option), and nothing changed because the audit row could not be written.
- Schedules of a **disabled** module show nothing. Core 1.17.97 hides them, so the page has no code for them.

**2. System updates shows a rollback warning as a warning (Core 1.17.96 and 1.17.97).**

- A rollback with status `warning` is yellow: "Restored 1.17.96, verification warning: database check". Under it you see Core's advice (or "Restart the Tec-Tac services and check ..." when Core sends none), the installer exit status, the stages that may not have run, and the restart command as text. The page never runs that command.
- Only a rollback with status `failed` is red. A status this build does not know is yellow and shows the word. The job itself stays Failed with its own red error line, because the update failed.
- The stage `rolled-back` counts as a rollback stage in the System updates and Module job progress bars. A failed job still shows 100% and Failed, and the Stage text is printed as Core sent it.
- The History window's System updates detail gets a Rollback row with the same words.
- The lifecycle output box already holds Core's 200 lines and scrolls. A test now locks that, and the 8-line "Final lifecycle output" for a failure is unchanged.

## For module developers

No registry, runtime helper or `api()` behaviour changes. `listSchedules()` sends the same URL by default. Modules that call `/api/tfd/scheduler/` through `ctx.api` (backups, communicator, patchmanagement, reportmanager, softwarerepository, wau, remote-background) see no difference. The new `src/scheduler.js` helpers are for Core's own page.

## Assumptions

- A rollback status the UI does not know is shown yellow with the word, so only `failed` is ever red (as the Core request asks).
- An uninstalled module's schedule owned by a user (a user schedule with a module id) gets the same label and buttons and does not open the editor.
- Nothing here needed Johan's decision. Remove and the two bulk calls use the plain Yes or No (signed decision 2.2). Core stays the authority for the manage flag, scope and the 409 re-checks; the page only hides buttons for convenience and fails closed.

## Checks

`npm test` runs 198 test entries. New: `tests/scheduler-orphaned-0.12.123.mjs` and `tests/system-update-rollback-warning-0.12.123.mjs`. The release test is now `tests/release-0.12.123.mjs`. The route test knows the five orphaned-schedule routes, which are not yet in a signed contract export. The two dependency-audit tests no longer pin one version.

## What could not run

The packaged install on a dev server was not run here. `npm run build` built. Pack and sign belong to the release manager. The routes were not tried against a live Core 1.17.97; the tests use a stub fetch.

## Known failing test

`tests/theme-tokens-0.12.114.mjs` fails because Report Manager 0.7.4 defines `.tt-win`. That is requested from the core-modules area and is not fixed in this release. It failed before this release too.

## Left out, and why

- The Yes or No for a system action and the groups summary (Core 1.17.66 request): large, and changes the create and edit flow of the same page. Next Scheduler release.
- Monthly "nth weekday" (Core 1.17.88 request): changes the same timing fields as the item above. Goes in the same release.
- `context.tacticalOperation` correlation id: needs Core to accept the id first.
- Force delete for an orphaned schedule with an active run: Core offers none.

## Dev-server checklist

1. **Uninstall a module that has schedules, then open Scheduler, Module schedules.** PASS: its rows show Owner module not installed, a click does not open an editor, Run now is off, and a manager sees Disable and Remove. FAIL: a row opens the editor or runs. Send back: a screenshot and the row's module id.
2. **Use Disable all and Remove all schedules of this module in the panel.** PASS: a Yes or No names the module and the count, and the answer sentence appears after Yes. FAIL: a call runs without a question, or you must type. Send back: the sentence shown and the module id.
3. **Open System updates after an update that rolled back with a warning.** PASS: the rollback line is yellow with advice, and only the job's own error line is red. FAIL: the rollback line is red for a warning. Send back: a screenshot of the job panel.

198 test entries ran on this PC (`npm test` stops at the first failure, so the entries after it were run one by one). 197 passed. The one failure is the known failing test below.
