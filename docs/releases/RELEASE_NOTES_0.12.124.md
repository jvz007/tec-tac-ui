# UI 0.12.124

Date: 2 November 2026. Requires Core 1.17.98 or later (raised from 1.17.97).

## What changes for you

The System Updates page now uses far fewer GitHub requests and tells you plainly where its answers come from. This closes the request "UI: GitHub update-check rate-limit optimisation, System Updates page" (Johan, 2 November 2026; spec `docs/core-github-rate-limit-optimization.txt`, sections 8, 10, 11, 13, 19 and 20) and uses what Core 1.17.98 added.

**1. The page only asks GitHub when you press a button.**

- Opening the page, coming back to it, switching tabs and watching an update job all ask Core for its saved answer (`refresh=none`). Core sends a GitHub request only when its saved answer is old.
- **Check for updates** sends `refresh=branch` for a branch source and `refresh=release` for a release source. A branch card also has **Refresh stable release** on its Stable release row, which sends `refresh=release`. The page never sends `force=true`.
- While a check runs for a component, both of its buttons are off and the running one says Checking…. Pressing again sends nothing: there is never more than one request per component. Framework and UI can be checked at the same time.
- The hourly look on an open page stays, with `refresh=none`.
- After you save a new update source, the page asks for the saved answer of that source (`refresh=none`), not a forced check.

**2. Last checked tells you how old the answer is.**

- It reads "Checked 8 seconds ago", "Checked 3 minutes ago" and so on, from the answer's `checked_at`. It updates every 5 seconds without a request.
- For a branch, Core 1.17.98 does not send the time of its saved check. The page shows the time it received a fresh check, or "Saved check, less than 5 minutes old". It never claims a new check it did not get.
- When Core answers `recently_refreshed` (you pressed again within 20 seconds for a branch, 45 for a release), a line under the buttons says "Checked moments ago, so this is that result. GitHub was not asked again."

**3. The GitHub API line.**

- Above the two cards: **GitHub API** · 43 / 60 remaining · Resets (time) · AUTHENTICATED or UNAUTHENTICATED. It uses the newest of Core's saved figures. The page reads only the limit, remaining, reset time and authenticated flag. The token is never shown or read.

**4. When GitHub's limit is used up.**

- Core answers with the saved data and `github_rate_limit_error`, or with HTTP 429 when nothing is saved. The card keeps what it showed, marks Last checked **STALE**, and shows a calm yellow note: "GitHub's request limit for this server is used up until (time). The last saved result is shown and marked stale. The page will not ask GitHub again before then."
- The Refresh buttons stay off until the reset time and the hourly look skips that component. Nothing retries by itself. After the reset time the note says you can use Refresh again.
- A 429 from the branch list or the stage route shows the same sentence instead of a raw error.

**5. Download & inspect sends the commit you saw.**

- For a saved branch source the stage sends the branch head the card shows; for a release source, the release commit (`commit`, 40 hex characters).
- If the branch moved or the release changed, Core answers 409 `stale_candidate`. The card says "The branch moved after your last check, so nothing was downloaded. Refresh the check, look at the new commit, then download again." with a **Refresh the check** button. Nothing is staged or installed.
- Download & inspect is off while a check for that component runs, so the commit sent is the one on screen.

The Help article "System Updates" explains all of this.

## For module developers

No registry, runtime helper or `api()` behaviour changes. `checkOnlineSystemUpdate(component, { refresh })` replaces the `force` option, and `stageOnlineSystemUpdate` takes an optional fourth argument `commit`. Both are Core's own page helpers; no module calls them (checked with a search of `modules/*/package/extensions/*/ui/`, and Core 1.17.98 found no module calling these routes).

## Assumptions

Recorded as information in `reviews/questions/ui.md` (Q95):

- After a source save the page asks for the saved answer, not a forced refresh.
- The hourly look stays, with `refresh=none`, skipped while the limit is used up.
- The Refresh buttons stay off until GitHub's reset time.
- The one-off Advanced branch stage sends no `commit`: Core 1.17.98 accepts a pin only for a branch it has checked, so a pin there would be refused every time. Its inspection card shows the commit before Install, as before.
- A saved-source stage with nothing shown yet (never checked) sends no `commit`, as before.

## Checks

`npm test` runs 199 test entries. New: `tests/github-rate-limit-0.12.124.mjs` (the helpers, the wire format, ten presses giving one request, a saved-source change waiting for the running check, recently_refreshed, the 200 and 429 rate-limit answers, the hourly look skipping a limited component, the stage pin and 409, and source checks that page load and job polling never refresh and that the page names no token). The release test is now `tests/release-0.12.124.mjs`. Six earlier tests were changed where the behaviour changed on purpose: `foundation.sh` (the `refresh` signature), `stable-release-0.12.85.mjs` and `update-source-0.12.82.mjs` (the re-check after a save is `refresh=none`), `update-source-stage-0.12.83.mjs` (the stage passes `commit`) `discovered-version-0.12.84.mjs` (the branch Last checked text) and `scheduler-orphaned-0.12.123.mjs` (it pinned the Core requirement to exactly 1.17.97; it now accepts 1.17.97 or later, and the release test pins the exact value). `npm run build` built.

199 test entries ran on this PC (`npm test` stops at the first failure, so the 30 entries after it were run with `TT_TEST_LIST`). 198 passed. The one failure is the known failing test below.

## What could not run

The packaged install on tt01 or dev02 was not run here. The page was not tried against a live Core 1.17.98 or a real GitHub limit; the tests use a stub fetch with Core 1.17.98's answer shapes (read from `contracts.py`, `views.py` and `system_update.py`). Pack and sign belong to the release manager.

## Known failing test

`tests/theme-tokens-0.12.114.mjs` fails because Report Manager 0.7.4 defines `.tt-win`. That is requested from the core-modules area and is not fixed in this release. It failed before this release too.

## Left out, and why

- A check time for a saved branch head: Core 1.17.98 sends none. Requested in `reviews/requests/core.md` ("From UI 0.12.124").
- A commit pin for the one-off Advanced branch stage: Core 1.17.98 would refuse it. Requested in the same place.
- `refresh=all`: the spec keeps it for troubleshooting, so the page has no button for it. The api helper accepts it.

## Dev-server checklist

Run on tt01 or dev02 with Core 1.17.98 and this UI installed. Open the browser's developer tools, Network tab, filter `updates/online`.

1. **Open System Updates, go to another page, and come back twice.** PASS: every `updates/online` request has `refresh=none`, none has `force`, and the GitHub API line shows remaining / limit, a reset time and AUTHENTICATED or UNAUTHENTICATED. FAIL: any `refresh=branch`, `refresh=release` or `force` without a button press, or the line is missing. Send back: a screenshot of the Network list with the request URLs, and the answer of one request.
2. **On a branch card, press Check for updates once, then again within 20 seconds.** PASS: the first request has `refresh=branch` and Last checked reads "Checked N seconds ago"; the second answer has `refresh.reason` `recently_refreshed` and the card says "GitHub was not asked again". FAIL: a second network check, or the card claims a new check. Send back: both answers (Response tab).
3. **Double-click Check for updates quickly on one card.** PASS: one request for that component, and the button reads Checking… and is off until it ends. FAIL: two requests for the same component at once. Send back: the Network screenshot.
4. **On a branch card, press Refresh stable release.** PASS: the request has `refresh=release`, the Stable release row updates and the STALE pill goes away if it was there. FAIL: `refresh=branch` or `force`, or no request. Send back: the request URL and answer.
5. **Download & inspect on a card that shows a head commit.** PASS: the stage request body has `commit` equal to the full head SHA (or release commit) the card showed, and the inspection card shows the same commit. FAIL: no `commit`, or a different one. Send back: the request body (Payload tab) and a screenshot of the card.
6. **Branch moved: check a branch, push a new commit to it (or wait until it moves), then press Download & inspect without checking again.** PASS: the stage answers 409, the card shows "The branch moved after your last check, so nothing was downloaded" with Refresh the check, and no package is staged; after Refresh the check the new head shows. FAIL: a package for the new head is staged without a new check. Send back: the 409 answer and a screenshot.
7. **Rate limit (only if it happens, or on a server without a token after many checks).** PASS: the card keeps its data, Last checked shows STALE, the yellow note names the reset time, both buttons are off until then, and no request repeats on its own. FAIL: a red error, empty card, or repeated requests. Send back: the `github_rate_limit_error` part of the answer and a screenshot.
8. **Start a System Update and watch the job.** PASS: while the job polls, no `updates/online` request appears. FAIL: an `updates/online` request during polling. Send back: the Network screenshot filtered on `updates/`.
