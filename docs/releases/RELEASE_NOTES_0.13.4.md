# UI 0.13.4

Date: 22 November 2026. Requires Core 1.18.45 or later (raised from 1.18.43). Core 1.18.44 never installed, so 1.18.45 is the first Core with the result route.

## What changes for you

A new page shows the results of a bulk run, one row per endpoint. You reach it from the bell. When Core finishes checking a run, the bell shows a notice such as "Run script: 38 done, 1 failed, 1 offline". **See results** on that notice opens `/results/<id>`.

- The heading is the name of the run. Under it you see Core's own summary sentence.
- Five counts sit above the table: Done, Failed, Offline, Still running and No result.
- The table has one row per endpoint: **Endpoint** (the hostname, or the endpoint id when there is no hostname), **State** and **Exit code** (a dash when there is none).
- No script output is shown. Core does not send any.
- The table shows 50 endpoints at a time. **Previous** and **Next** move between pages, and a line says "1 to 50 of 120".
- **Refresh** reads the current page again. A check that is still open says "Still checking". Core re-checks once a minute and announces the close in the bell, so the page has no timer.
- Only the person who started the run can open the page. Anyone else, and any result older than 30 days, sees one plain sentence: "We can't find these results. They may belong to someone else, or they may be older than 30 days." The sentence never says which.
- If Core refuses the request or cannot be reached, you see Core's sentence and a **Retry** button.

There is no menu entry and no list of past checks. Core 1.18.45 has one read route and no list route.

## For module developers

No registry, runtime helper or `api()` change. One call is added to `src/api.js` (`getResultCheck`), one pure helper file `src/result-check.js` and one view. `notifications.js` and `job-follow.js` are unchanged: the notice action already routes to `/results/<id>`. No module registers a `/results` route (checked in `modules/*/package/extensions/*/ui/`), so none is affected. Nothing is kept in browser storage. No auth header is built by hand.

## Assumptions

Recorded as information in `reviews/questions/ui.md` (Q103):

- A Refresh button instead of a timer.
- Previous and Next at 50 per page.
- One 404 sentence for every cause.
- The hostname is shown, with the endpoint id as the fallback.
- Nothing is stored in the browser.

## Checks

`npm test`: 205 test entries ran on this PC. New: `tests/result-check-0.13.4.mjs`. The release test is now `tests/release-0.13.4.mjs`. Changed on purpose: `tests/run-all.mjs`, `tests/api-contract-routes-0.12.58-1.mjs` (the new route, by name), `tests/test-runner-0.12.117.mjs` (release test name), `tests/bulk-stage-0.13.2.mjs` (file list) and the line-ending list in `tests/system-update-versions-0.13.3.mjs` (the 0.13.3 notes moved to `docs/releases/`).

## What could not run

The page was not tried against a live Core 1.18.45, and the packaged install on tt01 or dev02 was not run. Pack and sign belong to the release manager. There is no Core 1.18.45 contract export on disk, so the route is checked by name and against Core's source. The view is tested through its controller with a stubbed api, not in a browser.

## Known failing test

`tests/theme-tokens-0.12.114.mjs` can fail when Report Manager or Script Manager define `.tt-win`, which the UI kit owns. That is a request to those two modules, not a UI defect. The test is not weakened.

## Left out, and why

- No other open request is in this patch, as asked.
- No timer or live poll. Refresh is enough, and the bell announces the close.
- No menu entry or list of past checks. Core has no list route.
- The two Low findings of the 0.13.3 review stay held for a later patch.
- Script Execution 0.7.1 (the reader and the bulk-script follow) is a different release and area. The page works with any check Core holds.

## Dev-server checklist

Run on dev02 with Core 1.18.45, Script Execution 0.7.1 and this UI installed, signed in as a technician who can list agent history.

1. **Select about 40 endpoints, with one switched off, press Run script with a quick script, then close the browser tab.** PASS: the run starts and the page says you will be told when results are in. FAIL: an error, or no run starts. Send back: a screenshot and the HAR of the run request.
2. **Wait for the script timeout plus about 2 minutes, then look at the bell.** PASS: a notice such as "Run script: N done, M failed, 1 offline" with a **See results** button. FAIL: no notice, or a wrong count. Send back: a screenshot of the bell and the time you waited.
3. **Click See results.** PASS: the page opens with the run name, Core's sentence, five counts and one row per endpoint with its state and exit code. The offline endpoint shows Offline and a dash. No output text shows. FAIL: no page, a missing row, or output text. Send back: a screenshot and the HAR of `GET /api/tfd/ui/result-checks/<id>/?page=1&page_size=50`.
4. **Press Next and Previous, then Refresh.** PASS: with more than 50 endpoints the next page shows "51 to ..." and Next is greyed on the last page. With 50 or fewer both are greyed. Refresh reads the same page again. FAIL: a wrong range or the wrong page. Send back: a screenshot and the HAR.
5. **Sign in as another technician and open the same link.** PASS: one sentence, "We can't find these results...", and no table. FAIL: any row or count shows. Send back: a screenshot and the HAR.
6. **Open `/results/` with a made-up id.** PASS: the same sentence as step 5. FAIL: a different message or a blank page. Send back: a screenshot.
