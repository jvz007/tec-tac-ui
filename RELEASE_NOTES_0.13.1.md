# UI 0.13.1

Date: 21 November 2026. Requires Core 1.18.35 or later (raised from 1.18.0).

## What changes for you

You can now upgrade several modules in one go. On Settings → Modules → Online catalog:

- Rows with an upgrade you can run in bulk have a tick box. Tick the ones you want, or press **Select all upgradable**. **Clear selection** appears once something is ticked.
- Press **Upgrade selected (N)**. You see Core's plan first: the modules in the order Core will upgrade them, with the version change. Modules Core will not run are listed with Core's reason.
- Press **Upgrade N modules…**, then answer one plain Yes or No. Nothing is typed.
- Core upgrades the modules one after the other. The page shows each module's state, version change and, for a failed or skipped one, Core's reason. **Stop** ends the run after the current module. A failed module does not stop the others.
- When the run ends, the lists refresh. If at least one module upgraded, press **Reload Tec-Tac** to load the new versions. The page does not reload by itself, because that would wipe the results.

The single **Download update** button works as before. It is off while a bulk run is going.

Only modules from the Licensing source can join a bulk run, because that is what Core 1.18.35 plans and runs. A module from another source shows "Upgrade on its own" and keeps its Download update button. A blocked update shows Core's reason and no tick box.

Without module management rights you see the page read-only: no tick boxes and no bulk buttons.

## For module developers

No registry, runtime helper or `api()` change. The four new calls are in `src/modules.js` and use `apiFetch`. The Welcome module calls the same Core routes itself; nothing it uses changes. Nothing is kept in browser storage. No auth header is built by hand.

## Assumptions

Recorded as information in `reviews/questions/ui.md`:

- The page does not reload after a bulk run. It shows the results and a Reload button.
- Tick boxes appear only on rows whose source is a licensing repository.
- The browser sends only the ids the plan says can run, with purpose `upgrade`. Blocked modules are not sent.
- The confirm is the shell's plain Yes or No, asked after the plan panel.
- The run id is not stored. If you reload the page mid-run, a new Upgrade selected gets "run_in_progress" and the page follows that run.
- `tests/release-0.13.0.mjs` is replaced by `tests/release-0.13.1.mjs`, without the `git diff` check (held Medium from the UI 0.13.0 review).
- The order said "the existing plan view". The Core UI had none (only the Welcome module has one), so the plan and progress panels are new, in `ModuleUpgradeRun.vue`. Welcome is untouched.

## Checks

`npm test` runs 203 test entries. New: `tests/bulk-upgrade-0.13.1.mjs`. The release test is now `tests/release-0.13.1.mjs`, with no `git` call. Changed on purpose: `tests/api-contract-routes-0.12.58-1.mjs` (names the four online plan and install routes, checked in the 1.18.33 contract export), `tests/test-runner-0.12.117.mjs` (release test name), `tests/ui-0.12.54.mjs` (the unmount line now also stops the bulk poll), `tests/module-repository-skipped-0.12.109.mjs` (the Download button rule is read from the multi-line hook list), `tests/module-manager-brand-board-0.12.118.mjs` (the Online table takes the column list with the tick column) and `tests/run-all.mjs`. The page logic sits in `src/module-bulk-upgrade-state.js` so `ModulesView.vue` stays under its 1400-line guard.

`npm test` stops at the first failing entry, so the entries were run one by one. 203 test entries ran on this PC. All passed, including `theme-tokens-0.12.114`, which passed here. `npm run build` was run and built.

## What could not run

The packaged install on tt01 or dev02 was not run here. The page was not tried against a live Core 1.18.35. Pack and sign belong to the release manager.

## Known failing test

`tests/theme-tokens-0.12.114.mjs` failed in earlier releases because Report Manager and Script Manager define `.tt-win`, which the UI kit owns. It passed on this PC for this release. It depends on the module files in the workspace, so it can fail again. That is a request to those two modules, not a UI defect. The test is not weakened.

## Left out, and why

Johan's order said "Nothing else". These stay open in `reviews/requests/ui.md`:

- "Not available" list on the Online catalog (Core 1.17.108).
- "Always on" label and hidden Disable and Uninstall for core modules (Core 1.18.11).
- Universal filters Shared choice, Scheduler Yes/No for system actions and nth weekday, `context.confirm` tick-box option, `correlationId` on `tacticalOperation`, sandbox status panel, System Update rewriting tracked UI files.
- Bulk upgrade of modules from non-licensing sources. Core blocks them (`other_source`). A new Core request if you want them.
- Bulk install, uninstall, enable or disable, and any forced, downgrade or licence-override path. Not asked, and Core forbids them.
- Resuming a run after a page reload. The run id is not stored.

## Dev-server checklist

Run on tt01 or dev02 with Core 1.18.35 and this UI installed, with at least two licensed modules that have an update.

1. **Open Settings → Modules → Online catalog.** PASS: two upgradable licensed modules have a tick box, and a module from a non-licensing source shows "Upgrade on its own" and no tick box. FAIL: no tick boxes, or one on a non-licensing row. Send back: a screenshot and the HAR of `GET /api/tfd/modules/catalog/online/`.
2. **Press Select all upgradable.** PASS: every row with a tick box is ticked and the button reads Upgrade selected (N) with the right N. Clear selection empties it. FAIL: a wrong count or a blocked row ticked. Send back: a screenshot.
3. **Tick two modules and press Upgrade selected.** PASS: the plan shows both in install order with old and new versions, and any blocked module with Core's reason. FAIL: an error, or no plan. Send back: a screenshot and the HAR of `POST .../online/plan/`.
4. **Press Upgrade, then No.** PASS: nothing starts and the selection stays. FAIL: a run starts. Send back: the HAR.
5. **Press Upgrade, then Yes.** PASS: the run starts, each module moves through downloading and installing to succeeded, and the counts update. FAIL: no progress, or a module stuck. Send back: a screenshot and the HAR of `POST .../online/install/` and the progress polls.
6. **When the run ends, check the page.** PASS: the lists refresh and Reload Tec-Tac appears. Pressing it loads the new versions. FAIL: no refresh, or the page reloaded by itself. Send back: a screenshot.
7. **Start another run and press Stop.** PASS: it reads "Stopping after the current module." and then ends as stopped, with the rest skipped. FAIL: Stop does nothing. Send back: a screenshot and the HAR of `POST .../stop/`.
8. **Make one module fail if you can, for example by taking its licence away.** PASS: that module shows failed with Core's reason and the others still run. FAIL: the whole run stops. Send back: a screenshot.
9. **Use the single Download update on one module.** PASS: it works as before, and is off while a bulk run is going. FAIL: it is blocked with no run active. Send back: a screenshot.
10. **Sign in as a user without module management.** PASS: the Modules page is read-only with no tick boxes and no bulk buttons. FAIL: any bulk control shows. Send back: a screenshot.
