# UI 0.13.2

Date: 22 November 2026. Requires Core 1.18.42 or later (raised from 1.18.35).

## What changes for you

**Upgrade selected** now stages your ticked modules as one batch, the same way a single Download update stages one module. On Settings → Modules → Online catalog:

- Tick the modules you want, or press **Select all upgradable**. **Clear selection** appears once something is ticked.
- Press **Upgrade selected (N)**. The page switches to the Installed tab and shows the batch in the usual install review: the modules in Core's order, with the plan's problems if there are any.
- Press **Install** and answer the one plain Yes or No. Core installs the batch as one job. The job panel and its log show progress, as for any install.
- When it finishes, press **Reload Tec-Tac** to load the new versions.

A batch holds 1 to 50 modules. If you tick more than 50, the button is off and a line tells you how many to untick. **Select all upgradable** picks the first 50.

If Core refuses the batch, you see Core's sentence (it names the module) and nothing is staged. Fix the cause or untick that module, then try again.

The 0.13.1 bulk run panel, its Stop button and its plan step are gone. Core 1.18.42 no longer accepts that run (purpose "upgrade" now answers 400), so 0.13.1 does not work against it. This release replaces it.

The single **Download update** button works as before. Without module management rights you see no tick boxes and no bulk buttons.

## For module developers

No registry, runtime helper or `api()` change. One call is added in `src/modules.js` (`stageOnlineBatch`) and four are removed (the 0.13.1 online plan and run calls). No module uses them: Welcome calls Core's online plan and install routes itself and imports no UI file touched here. Nothing is kept in browser storage. No auth header is built by hand.

## Assumptions

Recorded as information in `reviews/questions/ui.md`:

- Tick boxes stay limited to modules from a licensing source (the unchanged filter), although Core's batch route accepts any repository.
- The UI caps a batch at 50, Core's limit, and says why, so Core never has to answer 400 for it.
- After Upgrade selected the page stages the batch and jumps to the Installed tab. The existing Install button, Yes or No, job poll and Reload do the rest.
- A Core refusal discards the whole batch. There is no licence-override retry on this route, because Core refuses overrides here.

## Checks

`npm test`: 203 test entries ran on this PC. New: `tests/bulk-stage-0.13.2.mjs`. Removed: `tests/bulk-upgrade-0.13.1.mjs`. The release test is now `tests/release-0.13.2.mjs`. Changed on purpose: `tests/api-contract-routes-0.12.58-1.mjs` (names the one batch route in place of the four plan and run routes), `tests/test-runner-0.12.117.mjs` (release test name) and `tests/run-all.mjs`. `npm run build` was run.

## What could not run

The page was not tried against a live Core 1.18.42, and the packaged install on tt01 or dev02 was not run. Pack and sign belong to the release manager. There is no 1.18.42 contract export on disk yet, so the batch route is checked by name.

## Known failing test

`tests/theme-tokens-0.12.114.mjs` can fail when Report Manager or Script Manager define `.tt-win`, which the UI kit owns. That is a request to those two modules, not a UI defect. The test is not weakened.

## Left out, and why

- The System Update version dropdown is a separate later patch.
- Modules from non-licensing sources stay "Upgrade on its own" under the unchanged filter.
- No new Core asks.

## Dev-server checklist

Run on tt01 or dev02 with Core 1.18.42 and this UI installed, with at least three licensed modules that have an update.

1. **Open Settings → Modules → Online catalog.** PASS: upgradable licensed modules have a tick box, and a module from a non-licensing source shows "Upgrade on its own" and no tick box. FAIL: no tick boxes, or one on a non-licensing row. Send back: a screenshot and the HAR of `GET /api/tfd/modules/catalog/online/`.
2. **Tick three modules and press Upgrade selected (3).** PASS: the page opens the Installed tab with one batch review listing all three in Core's order. FAIL: an error, no review, or one module only. Send back: a screenshot and the HAR of `POST .../online/stage/batch/`.
3. **Check the request.** PASS: the body is only `items`, each with `repository_id`, `module_id` and `version`. FAIL: any other key. Send back: the HAR.
4. **Tick a module with a blocked update or a plan problem.** PASS: a blocked module has no tick box and shows Core's reason; a plan problem shows in the review with its reason. FAIL: the problem is hidden. Send back: a screenshot.
5. **Press Install, then No.** PASS: nothing installs and the batch stays staged. FAIL: an install starts. Send back: the HAR.
6. **Press Install, then Yes.** PASS: one job installs all modules in order and the job panel shows progress. FAIL: no job, or a module is left out. Send back: a screenshot and the HAR of the install and job polls.
7. **Force a refusal if you can, for example by ticking a module whose licence lapsed.** PASS: Core's sentence shows, naming the module, and nothing is staged. FAIL: a partial batch is staged. Send back: a screenshot and the HAR.
8. **Tick more than 50 modules, if the catalog has that many (otherwise skip).** PASS: the button is off and a line says how many to untick; Select all upgradable picks 50. FAIL: the button is on. Send back: a screenshot.
9. **Sign in as a user without module management.** PASS: no tick boxes and no bulk buttons. FAIL: any bulk control shows. Send back: a screenshot.
10. **Use the single Download update on one module.** PASS: it stages and installs as before. FAIL: it is blocked with nothing running. Send back: a screenshot.
11. **After an install, press Reload Tec-Tac.** PASS: the new versions load. FAIL: the old versions stay. Send back: a screenshot.
