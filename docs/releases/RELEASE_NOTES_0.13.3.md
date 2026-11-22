# UI 0.13.3

Date: 22 November 2026. Requires Core 1.18.43 or later (raised from 1.18.42).

## What changes for you

System Updates gets a **Choose a version** list on the Tec-Tac Framework card and on the Tec-Tac UI card.

- The list shows the builds on the card's update source, newest first. The newest is picked for you.
- Each line says whether the build is an update, a reinstall of what you run now, or a downgrade.
- A build Core will not install is greyed out. Its reason is in the line, and also under the list when it is the one picked.
- **Download & inspect 1.18.42** (the version you picked) stages that build. You get the usual inspection card, and the usual Install button below it.
- A small line shows the installed version, the saved update source and the oldest version you can install.
- If GitHub's request limit is used up and Core shows a saved list, the page says so in a plain sentence.
- If the list cannot load, you see Core's sentence and a **Retry** button. Every other button on the page keeps working.
- The list loads when the page opens. It loads again after you save a new update source, because the list follows that source. There is no timer, because Core keeps the list for 5 minutes.

Installing an older build is a downgrade. The inspection card says DOWNGRADE, shows Core's warning and asks one plain Yes or No before Install runs. Core adds three limits and explains each in a sentence. It refuses a build that is older than an installed module allows, a Core build that would lose a database migration this server already applied (restore the server backup instead), and a Core build the installed UI does not support.

**Check for updates**, **Download & inspect** (release or branch) and the Advanced one-off branch stage work as before. The list sits beside them.

## Correction to 0.13.2

The 0.13.2 notes said a Yes or No appears before every batch Install. That was wrong. Install of a staged batch follows the normal install route. The Installed tab list is the review, and Install starts the job at once. A Yes or No appears only when modules would be replaced. This is what Johan asked for, and the 0.13.1 per-run Yes or No is gone on purpose. The code did not change in this release: the notes did. The 0.13.2 notes are kept unedited in `docs/releases/`. Step 5 of the 0.13.2 checklist ("press Install, then No") is withdrawn. Its replacement is step 11 below.

## For module developers

No registry, runtime helper or `api()` change. Two calls are added to `src/api.js` (`getSystemUpdateVersions`, `stageSystemUpdateVersion`) and a pure helper file `src/system-update-versions.js`. No module calls `/api/tfd/system/updates/*`, so none is affected. Nothing is kept in browser storage. No auth header is built by hand.

## Assumptions

Recorded as information in `reviews/questions/ui.md` (Q102):

- The list is added beside the existing check and stage buttons, which stay unchanged.
- The newest row is preselected.
- A not-installable row is shown disabled with Core's plain reason.
- The list loads on page open and after a saved source change, with no timer.
- A version stage records the saved source as the page's request, because Core's preview reports the saved source and not "version". The existing source check therefore shows no false mismatch.
- Install and the downgrade Yes or No are the existing ones.
- If the route fails, only a Retry button shows.

## Checks

`npm test`: 204 test entries ran on this PC. New: `tests/system-update-versions-0.13.3.mjs`. The release test is now `tests/release-0.13.3.mjs`. Changed on purpose: `tests/run-all.mjs`, `tests/test-runner-0.12.117.mjs` (release test name) and the line-ending list in `tests/bulk-stage-0.13.2.mjs` (the 0.13.2 notes moved). `npm run build` was run.

## What could not run

The page was not tried against a live Core 1.18.43, and the packaged install on tt01 or dev02 was not run. Pack and sign belong to the release manager. There is no Core 1.18.43 contract export on disk, so the two routes are checked by name and by the Core 1.18.43 release notes.

## Known failing test

`tests/theme-tokens-0.12.114.mjs` can fail when Report Manager or Script Manager define `.tt-win`, which the UI kit owns. That is a request to those two modules, not a UI defect. The test is not weakened.

## Left out, and why

- No other open request is in this patch, as asked.
- The existing Check for updates and Download & inspect buttons are not replaced by the list. Their trust, stale-head and one-off flows stay untouched.
- Paging past Core's 100 newest commits for a branch source. The list shows what Core sends.

## Dev-server checklist

Run on tt01 or dev02 with Core 1.18.43 and this UI installed, signed in as a superuser.

1. **Open Settings → System Updates.** PASS: each card shows Choose a version with builds newest first and the newest picked. FAIL: no list, or an unexpected order. Send back: a screenshot and the HAR of `GET /api/tfd/system/updates/versions/?component=framework`.
2. **Look for a row Core will not install.** PASS: it is greyed out, with Core's reason in its line. FAIL: you can pick it and press the button. Send back: a screenshot and the HAR.
3. **Pick an older installable build and press Download & inspect.** PASS: the inspection card says DOWNGRADE with Core's warning, and no "package came from another source" message shows. FAIL: no card, a false source mismatch, or the wrong version. Send back: a screenshot and the HAR of `POST .../online/stage/`.
4. **Check the request body.** PASS: it holds only `component`, `source_type` ("version") and `version`, plus `commit` when the row has one. FAIL: any other key. Send back: the HAR.
5. **Press Install on the downgrade.** PASS: a plain Yes or No appears first. No starts nothing. Yes starts the job. FAIL: the install starts without the question. Send back: the HAR.
6. **Try a build below a module's minimum, or across a migration.** PASS: the build is greyed out, or staging is refused with Core's sentence. FAIL: it installs. Send back: a screenshot and the HAR.
7. **Stage the newest build and install it.** PASS: it works as it did before this release. FAIL: it is blocked or does nothing. Send back: a screenshot and the HAR.
8. **Press Check for updates and, with branch sources unlocked, the one-off branch stage.** PASS: both work as before. FAIL: either one breaks. Send back: a screenshot and the HAR.
9. **Save a different update source (release or branch).** PASS: the list reloads and follows the new source. FAIL: the old list stays. Send back: the HAR.
10. **Stop the list route if you can, or use a build of Core without it.** PASS: the card shows a sentence and Retry, and all other buttons still work. FAIL: the page breaks. Send back: a screenshot.
11. **Corrected 0.13.2 step 5: press Install on a staged batch of modules with none replaced.** PASS: the install job starts at once and the job panel shows progress. A Yes or No appears only when modules would be replaced. FAIL: a Yes or No shows for a plain batch, or Install does nothing. Send back: the HAR.
