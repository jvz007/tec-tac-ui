# UI 0.12.118

Date: 20 October 2026. Requires Core 1.17.65 or later (raised from 1.17.52, the newest signed Core on dev). The features need Core 1.17.58 (licensing), 1.17.60 (job history and full logs), 1.17.61 (pending runs), 1.17.63 (created by and confirmed by) and 1.17.45 (event jobs); all of them are inside 1.17.65. It is a patch release, not 0.13.0. **Nothing in this release was tested on the dev server.** The checks ran in node with a fake api, in shell tests, and in the build. No browser was opened against a real Core, and no screenshot was taken.

**Install Core 1.17.65 before this UI.** The Core requirement is raised, so the UI will not install on an older Core.

## What changes for you

- **The Module Manager follows the brand board.** Installed, Online catalog and Repositories are now list pages on the shared table (pattern P1): a search box, the category filter on Installed, a count at the bottom, headers you can sort, and Enter, double-click or right-click to open a row. Adding or editing a repository is now an input dialog (P4) and not a card beside the table. Nothing the page does has changed: install, enable, disable, remove, hide and show, stage, sync, repository changes and hotfix apply and rollback all call what they called before.
- **A History tab with full job logs.** Jobs come from Core's new history route. Columns: when, module(s) with versions, action, requested by, status in plain words, stage and the short error. A rename shows as "Rename old to new", and a replacement switch says so. Filter by module, action, status and type (module or hotfix). Fifty rows a page; Core cuts a larger page size to 100. Click Open on a row to read the whole log in a floating, read-only window, with the job's details beside it. Download saves the log as a file. A row with no log says "No log was kept". A log over 5 MB shows "This log is about N MB. Core shows the start and the end." beside Open, with no extra question. When Core cut the middle out of a long log, a line above it says: "This log is long. The start and the end are shown; the middle was left out."
- **Licensing on System Configuration.** A new card shows the licensing mode (off, log only or enforce) with one plain sentence for each. Only a superuser can change it, after one plain Yes or No. A superuser can also press "Use Core's default". Below it a status panel shows the licence state in plain words, the modules that would be refused if licensing were enforced (the true count, and up to Core's 50 listed), the grace window, and the line "Licensing never blocks: sign-in, Tactical operations, rollback, security updates." Licensing stays on log only by default, and the UI sends nothing until a superuser chooses.
- **A licence override for superusers.** If Core refuses a module because of its licence while licensing is on enforce, a superuser sees Core's reason and a box for why the override is needed (1 to 500 characters). One plain Yes or No follows ("Let this module through without a licence? Core records your reason and your name."). The reason is sent once and cleared. It is not carried from stage to install, so the install asks again. Anyone else sees the plain refusal and no control. The control never appears in log-only or off.
- **The Scheduler page shows who created and who confirmed each schedule**, with two filter boxes (Created by, Confirmed by). A name Core has on record shows even if that user no longer exists; an older schedule shows "Not recorded". A plain note says that scheduled runs are not re-checked against the person who created them. The editor says that saving makes you the confirmer.
- **Runs that wait for a result** show "Waiting for the result", what they wait for ("a module job" or "a server maintenance job") and since when. The run status still reads running. Core's seven run error types now read as sentences.
- **Scheduler Configuration lists event jobs** (read only): the jobs modules start from an event, with counts, how long the oldest has waited, and the last error. It hides itself if you do not have server maintenance authority or if Core is older.

## Patterns used

P1 list page (Installed, Online catalog, Repositories, History), P2 item editor (the log window), P4 input dialog (repository add and edit), P8 confirmation (the plain shell Yes or No for the licensing mode, the licence override, remove repository and hotfix rollback), P9 result dialog and P10 feedback (the job panel, the lifecycle bar and every empty, loading and error state, which are the kit's). Tokens only: no hex colour and no raw pixel font size in anything this release added.

## For module authors (contract change, additive)

- `context.components.EditorWindow` takes `floating` and `readOnly`. `floating` draws the window fixed over the page, as a dialog, on layer 1050. It takes the focus when it opens and gives it back when it closes. `readOnly` hides Save and Discard changes. **Layer order:** resource menu 1000, floating window 1050, module dialogs and the SearchSelect list 1100, row menu 1150, toasts 1200, unsaved prompt 1300, shell confirm 1400. A confirm or a toast is never behind a module window. Written in `docs/module-components.md` and `docs/module-dialogs.md`.
- `FormRow` takes `stacked` (label above the control). Inside an editor window's properties column a row stacks on its own, so Script Manager can drop its `.sm013-window .tt-frow` rule.
- `TagEditor` takes `inputId` (the id of the real text input) and `describedBy`. Report Manager can drop its labelled-group wrapper.
- All five props are off by default and the output without them is exactly what 0.12.117 drew (the tests compare it with a string made from the 0.12.117 source). No module imports `src/modules.js`, `ModulesView`, or the licensing, history or event-jobs routes, so nothing in `modules/` needs a change to keep working.
- **Reportmanager 0.7.4 defines `.tt-win`**, a class the kit owns (`tests/theme-tokens-0.12.114.mjs` reports it). It was already failing before this release. A floating window makes the collision matter more, so it is written to core-modules as a request.
- The Core export rows for these props are asked for in `core.md`.

## Check it worked

```bash
cd workspace/ui && npm test && npm run build
```

Both should finish without an error. `npm test` ends with "All 189 test entries passed." **One entry fails on this PC for a reason outside this release:** `tests/theme-tokens-0.12.114.mjs`, because the Report Manager 0.7.4 package in `modules/` defines `.tt-win` (see above). It failed the same way on 0.12.117.

## What could not run

- No browser session against a real Core, and no click-through of the signed-in app.
- No screenshots in dark, light or high-contrast themes. The tokens are the live ones, and the test checks no hex colour is added, but nobody has looked at it.
- The layer order (a confirm or toast over a floating window) was checked in the stylesheet numbers, not in a browser. The dev-server checklist has the real check.
- **Whether the browser can read `X-Tec-Tac-Log-Truncated` and `Content-Disposition` is unknown.** If the API and the UI are on different origins and Core does not send `Access-Control-Expose-Headers`, the browser hides both. The UI then finds the cut by Core's own marker line (`[... N bytes were left out of the middle of this log ...]`) and names the file itself (`module-job-<module>-<action>-<date>.log`, using only a-z, 0-9 and -). The window says when it used the marker. A request to Core asks it to expose the headers. The checklist asks you to look in the Network tab.
- **Download does not link to `?download=1`.** The token travels only in the Authorization header, so a plain link would be refused. The button fetches the file through the api transport, saves it, and revokes the temporary address. No token is ever in a URL.

## Left out, and why

- **Package intake, the install review and the Hotfixes tab are not restyled.** They keep their exact markup and logic. They are large, carry the replacement and hand-back warnings, and 21 existing tests read them. Only the three lists, the repository form and History moved to the board. The next release does the rest, with no behaviour change. This is part of Johan's request that is not done yet.
- **Universal filters, UI half** (Shared choice, withheld marker): waits for Johan to confirm that Core 1.17.51 is installed and exported (Q76).
- **"Show a module without a category as refused, not as Test"** (AD-21 condition 6): Johan has not named that release.
- **`correlationId` on `context.tacticalOperation`:** Core's browser route does not accept it yet (request in `core.md`).
- **Logs of System Updates and server-maintenance jobs:** Core 1.17.60 serves full logs for module and hotfix jobs only. Those pages keep their short log panels. A Core request asks for the rest if Johan wants it.
- **Q64 (the TagEditor comma rule), the removal of `context.jobs.follow`, and the held Medium in `src/filter-editor.js`** are unchanged.
- Other Core pages (Users, Roles, Sessions, Backups, Audit) are not restyled.

## Wording flagged for human review

The licensing mode confirmations, the licence override text and the Scheduler "not re-checked" note are commercial and security wording. They are in `reviews/questions/ui.md` with the assumptions used.

- Enforce: "Switch licensing to enforce? A module that needs a licence will be refused at stage and install. Sign-in, Tactical operations, rollback and security updates are never blocked."
- Off: "Switch licensing off? Core will stop checking licences. A module that needs a licence will not be checked at all."
- Scheduler note: "Scheduled runs are not re-checked against the person who created them, as in Tactical. Core checked their rights when the schedule was created or last edited. A schedule keeps running after its creator loses access, until someone removes or edits it."

## The test list

`tests/run-all.mjs` now has 189 entries: the 180 of 0.12.117 (the Core requirement test replaced in place by `tests/release-0.12.118.mjs`, as 0.12.117 did) and nine new ones, listed at the end. Thirteen existing tests were edited, and the rest that read the Module Manager still pass untouched. Eight were pointed at the new files because the markup moved (the lists are built in `src/module-manager-tables.js`, the History tab in `src/components/modules/`): `foundation.sh`, `history-pagination-ui.sh`, `module-category`, `module-replacement-status`, `module-replacement-handback`, `module-repository-skipped`, `repository-sync-schedule` and `module-install-guard`. Each still makes the same checks, on the file where the code now lives. Five changed because a new optional argument, prop or route is now part of the public shape: `module-intake-sets` (the inspect call now passes a function that keeps the raw error for the licence check, and the install call may carry a reason), `shared-select-tags` (TagEditor's two new props), `api-contract-routes` (the four new routes, checked against the 1.17.65 export when it is on disk), `test-runner-0.12.117` (the entry list now continues after the 0.12.117 tests) and `filter-editor-docs-0.12.117` (the 0.12.117 notes moved to `docs/releases`, which that test already scans). `tests/core-requirement-0.12.117.mjs` is replaced by `tests/release-0.12.118.mjs`.

## Dev-server checklist (for Johan)

Do these on dev02 with Core 1.17.65 installed. Each step says what you should see (PASS), what is a FAIL, and what to send back.

1. **Tabs and tables in the three themes.** Open Module Manager. Switch the theme to dark, light and high contrast (My Account, appearance). Open Installed, Online catalog, Repositories and History in each.
   PASS: every table has the search box, count at the bottom and sortable headers, text is readable, no hex-coloured oddities, and the selected row is clear.
   FAIL: unreadable text, a table with no border or header, or a layout that overflows.
   Send back: a screenshot of the failing tab and theme.
2. **History list and filters.** Open History. Filter by module, then action, then status "Failed", then type "Hotfixes". Press Clear. Go to page 2 if there is one.
   PASS: rows match the filter, the status is a plain word (Done, Failed, Waiting to start), paging works, Clear brings back every job.
   FAIL: a raw status word such as `dispatch_failed`, a filter that is ignored, or no paging.
   Send back: the filter you used and a screenshot.
3. **A failed job's log.** Click Open on a failed job.
   PASS: a window floats over the page with the job's details on the left and the log in a fixed-width area on the right. Close and Escape both close it and put you back where you were. There is no Save button.
   FAIL: the log runs together as one line, the page behind scrolls instead of the log, or a Save button shows.
   Send back: a screenshot and the job's module and action.
4. **A log over 5 MB, if one exists.** Look for a row that says "This log is about N MB. Core shows the start and the end." Open it.
   PASS: the line "This log is long. The start and the end are shown; the middle was left out." shows above the log, and the middle of the log reads `[... N bytes were left out of the middle of this log ...]`.
   FAIL: no line above a log that has the marker, or the window freezes.
   Send back: the size shown and whether the marker line is in the text. If no log is that big, write "none".
5. **Download.** Press Download in the log window.
   PASS: a file saves named `module-job-<module>-<action>-<date>.log`, and its text is the same log.
   FAIL: nothing saves, the file is empty, or an error line shows.
   Send back: the file name and what the window said.
6. **A person without module rights.** Sign in as a user without `core.privileged_operations` and open Module Manager.
   PASS: there is no History tab. If you open the route another way, the page says "You need module management rights to see this".
   FAIL: the History tab shows, or a raw error shows.
   Send back: a screenshot.
7. **Licensing mode, as a superuser.** System Configuration, the Licensing card.
   PASS: it shows Log only with its sentence. Choose Enforce and press Save mode. One plain Yes or No dialog shows (danger wording). Press No: nothing changes. Choose it again, press Yes: the card says licensing is now enforce. Press "Use Core's default" and answer Yes: it goes back to log only.
   FAIL: any typed confirmation, a change without a question, or a mode that does not match what Core holds.
   Send back: a screenshot after each step.
8. **Licensing mode, as someone who is not a superuser** (with `core.runtime_settings.manage` only).
   PASS: the card shows the mode and status read-only, with no selector and no Default button.
   FAIL: a selector shows, or the card is blank.
   Send back: a screenshot.
9. **The status panel.** Read the panel while Module licensing is not live.
   PASS: it says "Module licensing is not live yet, so no module is treated as licensed", shows how many modules would be refused, shows Core's grace line with no invented number, and "Licensing never blocks: sign-in, Tactical operations, rollback, security updates."
   FAIL: a number of grace days when Core sent none, or a missing "never blocks" line.
   Send back: a screenshot.
10. **The override appears only on enforce.** With licensing on enforce, stage a module that needs a licence. Then set licensing back to log only and stage it again.
    PASS: on enforce a refusal shows Core's reason, module, version and state, plus a reason box and "Override and try again" (superuser only). Enter a reason and press the button: one Yes or No, then the staging goes through and the box is empty. The install then asks for its own reason. On log only there is no refusal and no control.
    FAIL: the control shows on log only, the reason is still in the box after a try, or the install reuses the stage's reason.
    Send back: a screenshot and the Core audit row for the override if you can see it.
11. **Scheduler: created by and confirmed by.** Open Schedules. Look at User schedules and Module schedules.
    PASS: both tabs have Created by and Confirmed by columns and the note "Scheduled runs are not re-checked". An old schedule shows "Not recorded". Type a name in Created by and press Enter: only that person's schedules show, with the line "Showing schedules created by <name>", and the tab counts say "filtered". Fill both boxes, then Clear.
    FAIL: no note, filters that do nothing, or a blank column.
    Send back: a screenshot and the name you filtered by.
12. **Waiting for the result.** Scheduler Configuration, or Schedules: create a schedule that runs `tec-tac.scheduler-test-pending` and press Run now. Open User history.
    PASS: the run shows "running" and "Waiting for the result", with "a module job" or "a server maintenance job" and the start time.
    FAIL: the label is missing, or the status says something other than running.
    Send back: a screenshot and the run's id.
13. **Event jobs panel.** Open Scheduler Configuration.
    PASS: summary tiles and an Event jobs table (module, job, pending, running, oldest pending, counts, last failure). Sign in as someone without server maintenance authority: the panel is not there.
    FAIL: a payload or key shows, or the panel breaks the page.
    Send back: a screenshot.
14. **Can the browser read the headers?** Open a log, then Download, with the browser Network tab open. Look at the response headers of `.../jobs/<id>/log/`.
    PASS: you can see `X-Tec-Tac-Log-Truncated` and `Content-Disposition` in the browser's view of the response, and the window shows no note about the marker.
    FAIL: the headers are in the response on the wire but the window says it found the cut from the marker line.
    Send back: which headers you can see. This tells us whether Core must send `Access-Control-Expose-Headers`.
15. **The layer order.** With the log window open, trigger a toast (for example copy a value from another page element) and any Yes or No you can reach from behind the window (for example a context action that asks). If you cannot trigger one, write "could not trigger" and say which.
    PASS: the toast and the Yes or No sit above the log window. The window sits above the right-click menu of a table under it.
    FAIL: either is hidden behind the window.
    Send back: a screenshot and which layer was hidden.
