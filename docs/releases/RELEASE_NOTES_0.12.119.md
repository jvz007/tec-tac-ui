# UI 0.12.119

Date: 20 October 2026. Requires Core 1.17.65 or later (unchanged: it is the newest signed Core this UI was tested against). Every Core route this release reads is already in the signed 1.17.65 export.

**Install Core 1.17.65 before this UI**, as for 0.12.118.

## What changes for you

- **The whole Module Manager now follows the brand board** (your Q82). 0.12.118 moved the lists and History. This release moves the rest of the Installed tab and the Hotfixes tab. Nothing about what a button does has changed.
  - **Package intake** is a card (P3) with a dashed drop zone, the files to inspect as ordered cards with the arrow buttons, the intake notes as plain inline states (P10), and one primary button at the right of the footer.
  - **The install review** is its own card. The inspection table (module, installed, package, trust, action, source, SHA256, requires) keeps its hover and keyboard detail for the trust pill. The install sequence is ordered cards. You can still drag them or use the arrows. Cancel / discard is at the left, Install at the right.
  - **The module detail panel** shows each fact with its label above it (P2), then Hide or Show, Disable or Enable, Remove and Open.
  - **The module job panel** has the status pill beside the title, the log in the fixed-width font, and Reload Tec-Tac as its one primary button (P9).
  - **The three dialogs** (reinstall, "Switch off replaced modules?", and the enable, disable and remove confirmation) keep every sentence. In a dialog with a destructive button, that button now sits left of Cancel and the primary button sits at the right. The order you tab through is unchanged. The plain No / Yes keeps No on the left and Yes on the right.
  - **The Hotfixes tab** has two cards. The files of a hotfix and the applied hotfixes are tables (P1). **Roll back hotfix has moved out of the table row** (the board keeps buttons out of rows): pick a row, then press Roll back hotfix above the table. Only the newest hotfix can still be rolled back, the two button titles are the same, and the plain Yes or No question still comes first.
- **You can reach the System Updates and server-maintenance logs** (your Q83). The three logs stay separate; nothing is merged.
  - On the History tab, a **Log source** select offers *Module and hotfix jobs* (as before), *System updates* and *Server maintenance*. Open shows that job's log in the same floating window.
  - **System Updates** now has **Open log** on each row of the Update history table.
  - A System Updates log shows the last 80 lines, because that is all Core keeps, and the window says so. A maintenance log shows the log, output and error texts Core returns, and says when Core cut it.
  - A System Updates row from Core's history folder may have no job file. The window then says "Core no longer holds this log" and does not try again.
  - **Download is off for these two** with the reason "Core does not offer a download for this log yet". Core is asked for the route in `requests/core.md`.
  - The same rights as the History tab apply. Everything is shown as text, never as HTML, and no token is ever in a URL.
- **Fixed, held from the 0.12.118 review (Low):** the log Download no longer lets go of its temporary address in the same instant as the click. Firefox and Safari could save an empty file. The address is now kept for 30 seconds, and let go at once if you close the window first.
- **Fixed, held from the 0.12.118 review (Low):** on the Schedules page, a Created by filter that left out the schedule you had open used to turn the editor into a "new schedule", so Save created a copy. The editor now keeps working on the schedule you opened: Save updates it, the Created by and Confirmed by block still shows, and what you typed stays.

## Patterns used

P1 list page (inspection and hotfix tables), P2 item editor (module detail), P3 settings card (package intake, install review, hotfix cards), P4 input dialog and P8 confirmation (the three dialogs), P5 ordered cards (the intake queue and the install sequence), P9 result (the module job panel), P10 feedback (every intake and review message). Pages that already used the board were not changed: the page header, the lifecycle progress bar and the four count tiles already follow it.

## Decisions to know about

- **The inspection table is not the kit table.** The kit table clips whatever opens outside its cell, and the trust pill opens a detail box over the table. A token-only grid under the `mm-inspection` classes is used instead, so the box is not clipped. Every column and every word is as before.
- **Shared rules were left alone.** `.card`, `.modal-panel`, `.pill`, `.drop-zone`, `.queue-row`, `.job-log` and the other shared rules are as they were, because other pages use them. The new styles are `mm-` classes next to the 0.12.118 ones. They use only tokens and sizes from the board's scale (9.8 to 24), the system fonts (`--sans`, `--mono`) and no hex colour.
- **The script of `ModulesView.vue` did not change.** Every handler, computed and ref is where it was. The two hidden file inputs and their refs stay there. The new components take their values as props with the same names and send events with the handlers' names. `tests/fixtures/module-manager-handlers-0.12.118.json` holds every handler, `v-model` target and `:disabled` expression of the 0.12.118 template, and `module-manager-brand-board-0.12.119.mjs` checks each one is still wired.
- **Fonts.** The product keeps the system stacks. The brand fonts are for Tech Flow Dynamics documents. This is Q89 in `reviews/questions/ui.md`.

## For module authors

No contract changed. No module uses the Module Manager classes, the module routes, or the server-maintenance and System Updates job routes (checked by searching `modules/`).

## Tests that read the Module Manager markup

The markup moved, so 22 tests that read `ModulesView.vue` now read it together with the components (`tests/helpers/module-manager-source.mjs`). The assertions are the same. These could not be kept as written, and each now says what it always meant:

- `foundation.sh`: reads the joined source. The class names `drop-zone`, `module-inspection-grid`, `module-trust-badge` and `module-trust-popover` became `mm-drop`, `mm-inspection`, `mm-trust-badge` and `mm-trust-popover`.
- `module-manager-brand-board-0.12.118.mjs`: the list of wired handlers is checked with a helper (a handler is wired when the page binds the component's event of the same name to it). The No / Yes and second-step checkbox expressions read the new component text. The confirm dialog is cut at the end of its component. The "page does not grow" line count reads `ModulesView.vue` alone.
- `confirm-dialog-adoption-0.12.96`, `module-handback-warning-0.12.92`, `module-replacement-confirm-0.12.89` and `module-replacement-handback-0.12.90`: `@click="confirmAction"`, `@click="confirmHandBack"`, `@click="confirmInstall"`, `@click="confirmSwitchAction"` and `v-model="switchAck"` now read `@click="emit('...')"` in the component plus the page's `@confirm-...="..."` binding, and `v-model:switchAck`.
- `module-install-guard-0.12.95`: the footer and button strings read `mm-footer` and `emit('clearStaged')`, `emit('install')`, `emit('confirmInstall')`. The disabled expressions are unchanged.
- `api-contract-routes-0.12.58-1`: the two server-maintenance job routes are added and checked against the 1.17.65 export.

## Check it worked

```bash
cd workspace/ui && npm test && npm run build
```

Both should finish without an error. `npm test` ends with "All 193 test entries passed." **One entry fails on this PC for a reason outside this release:** `tests/theme-tokens-0.12.114.mjs`, because the Report Manager 0.7.4 package in `modules/` defines `.tt-win`, a class the kit owns. It was failing before this release. If it still fails when you run it, that is the only expected failure.

## What could not run

- No browser session against a real Core, and no click-through of the signed-in app. The new components were rendered on the server side with Vite's own loader and checked as text.
- No screenshots in dark, light or high-contrast themes. The tokens are the live ones and a test checks that no hex colour or raw pixel font size was added, but nobody has looked at it. **Only your browser can show** the three themes, whether the trust pill's detail box really opens over the table without being cut, the layer order (a confirm or toast over the floating log window), and the spacing with real module data.
- The board's headless Edge command (`docs/ui-brand-board/README.md`) only works on static pages, so it was not used on the app.
- The Firefox and Safari download fix is tested with fake timers, not in those browsers.

## Left out, and why

- **Download of the System Updates and server-maintenance logs, and their full-size logs:** Core has no route yet. The button is there, off, with its reason. Requested in `requests/core.md`.
- **The audit wording "Update installed successfully 1.17.16 -> 1.17.17":** that row is written by Core, so it is a Core request. The UI shows the audit text as Core sends it.
- **A merged log for module, System Updates and server-maintenance jobs:** you said separate logs are fine.
- **The kit props in the public contract export** (`EditorWindow`, `FormRow`, `TagEditor`, layer 1050): a Core request that already stands.
- **Universal filters, UI half** (Shared choice, withheld marker): waits for you to confirm Core 1.17.51 is installed and exported (Q76).
- **"Show a module without a category as refused, not as Test"** (AD-21 condition 6): you have not named that release.
- **`correlationId` on `context.tacticalOperation`:** Core's browser route does not accept it yet.
- **Users, Roles, Sessions, Backups, Audit and the rest of System Updates** are not restyled. Only the Open log button was added to System Updates.
- **Q64, the removal of `context.jobs.follow`, the held Medium in `src/filter-editor.js` and the Report Manager `.tt-win` clash** are unchanged.
- **The licensing wording (Q85)** is as built. You said you have not thought about it, so it stays an open commercial design point and is not signed off.

## Wording flagged for human review

The licensing confirmations and the Scheduler "not re-checked" note from 0.12.118 are unchanged. Q86 (the note) is approved. Q85 (the licensing words and place) is not decided.

## Dev-server checklist (for Johan)

Do these on dev02 with Core 1.17.65 installed. Do steps 1 to 8 in dark, light and high contrast (My Account, appearance). Each step says what you should see (PASS), what is a FAIL, and what to send back.

1. **Installed tab with package intake.** Open Module Manager, Installed. Drop a package (and its .sig and .release.json if you have them) on the dashed area. Use the arrows to move a file, then Clear, then add files again.
   PASS: the intake is a card, the files are ordered cards, the notes read as plain inline messages, Clear is at the left and "Inspect package intake" is the one primary button at the right. A .sig without its package shows "Package intake needs attention." and Inspect stays off.
   FAIL: unreadable text in a theme, the drop zone does not react to a drag, a button overflows the card, or Inspect works while a problem is shown.
   Send back: a screenshot of each theme, and what you dropped.
2. **Install review.** Inspect a package so the review card shows. Hover and then tab onto the trust pill.
   PASS: the table lists module, installed, package, trust, action, source, SHA256 and requires. The trust box opens over the table and is not cut off. INSTALLABLE or BLOCKED shows in the header. Cancel / discard is at the left and "Install N packages" is the one primary button at the right.
   FAIL: the trust box is cut off or hidden behind the next row, a column is missing, or a theme is unreadable.
   Send back: a screenshot with the trust box open, in each theme.
3. **Installed detail and the dialogs.** Select a module. Check the panel, then press Disable, Enable and Remove (cancel each).
   PASS: each fact has its label above it, the pills and buttons are as before, and every dialog keeps its words. A destructive button is left of Cancel and the primary button is at the right.
   FAIL: a missing fact, a changed sentence, a button in the wrong order, or an unreadable theme.
   Send back: a screenshot of the panel and one dialog, in each theme.
4. **Online catalog.** Open the tab.
   PASS: the table, search and footer look as in 0.12.118 in all three themes.
   FAIL: a layout change or an unreadable theme.
   Send back: a screenshot of the failing theme.
5. **Repositories.** Open the tab, then Add repository and cancel.
   PASS: the table and the dialog look as in 0.12.118 in all three themes.
   FAIL: a layout change or an unreadable theme.
   Send back: a screenshot of the failing theme.
6. **Hotfixes.** Open the tab. Choose a hotfix file, inspect it, and look at the preview. Then pick a module that has applied hotfixes.
   PASS: two cards. The preview lists its facts in two columns and its files in a table. The applied hotfixes are a table with "Roll back hotfix" in a bar above it, off until you pick a row. Picking an older row keeps it off with the title "Roll back newer hotfixes first".
   FAIL: a button inside a table row, Roll back enabled for an older hotfix, or an unreadable theme.
   Send back: a screenshot of each theme with a row picked.
7. **History with three log sources.** Open History. Change Log source to System updates, then Server maintenance, then back. Press Open on one row of each.
   PASS: each source lists its own jobs and opens its own log in the floating window. System updates says "Showing the last 80 lines". Download is off for System updates and Server maintenance with the title "Core does not offer a download for this log yet". Module jobs still download.
   FAIL: a log shown as one line or as HTML, a Download that works for the two new sources, or a raw error.
   Send back: a screenshot of the list and the window for each source, and any row that says "Core no longer holds this log".
8. **System Updates, Open log.** Open System Updates and press Open log on a row of Update history.
   PASS: the same floating window opens with the last 80 lines, or "Core no longer holds this log" for a row with no job file. Escape and Close both close it.
   FAIL: the window does not open, shows markup, or a Save button shows.
   Send back: a screenshot and the row's component and version.
9. **The hand-back warning and the second step.** On a replacement pair, disable the replacement, and enable a replaced module whose replacement is on.
   PASS: the hand-back warning is asked first. The enable asks twice: first Yes or No, then a second step with a tick box, and the switch-off button stays off until you tick it. The words are as in 0.12.118.
   FAIL: a step skipped, the second button enabled before the tick, or a changed sentence.
   Send back: a screenshot of each step.
10. **The install order list and drag reorder.** Inspect two packages where one requires the other, then try to move them with the arrows and by dragging.
    PASS: the required order is enforced ("Required sequence enforced: ..."), independent packages move by drag and by arrows, and the order you set is the order that installs.
    FAIL: a package can be dragged before the one it requires, or the arrows do nothing.
    Send back: the two module ids and what the page said.
11. **A hotfix inspected, applied and rolled back.** Inspect a hotfix, press Apply hotfix, wait for the job, then pick the new row and press Roll back hotfix.
    PASS: apply runs as before and the job log shows. Roll back asks the plain Yes or No question and then runs. The row is gone afterwards.
    FAIL: apply or roll back does nothing, or no question is asked before roll back.
    Send back: the job log text and a screenshot.
12. **The download in Firefox or Safari.** Open a module job log in Firefox or Safari and press Download.
    PASS: a file saves with the log text in it (not empty).
    FAIL: an empty file, or nothing saves.
    Send back: the browser name and version, and the file size.
13. **The schedule editor under a Created by filter.** On Schedules, open a user schedule. In the Created by box type a name that did not create it, and press Apply.
    PASS: the editor stays open on the same schedule, the Created by and Confirmed by block still shows, and Save updates that schedule (no copy appears).
    FAIL: the editor turns into "New schedule", the block disappears, or Save creates a second schedule.
    Send back: a screenshot and what the schedule list showed after Save.
14. **Layer order and spacing on real data.** With a log window open, trigger a toast and a confirm (for example roll back a hotfix with the window open).
    PASS: the confirm and the toast show above the window, and nothing in the cards is cramped with real module names and long file names.
    FAIL: a confirm or toast hidden behind the window, text running out of a card, or overlapping rows.
    Send back: a screenshot.
