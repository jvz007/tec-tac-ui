# UI 0.13.0

Date: 16 November 2026. Requires Core 1.18.0 or later (raised from 1.17.109).

## What changes for you

Nothing you can see. This release marks the production line. It changes no code and no behaviour. Johan asked for a minor version so dev can be promoted to main. The UI you get is the same as 0.12.127, with the new number and a higher Core requirement.

## What changed on dev since main

Main holds Core 1.17.110 and UI 0.12.127. The UI is unchanged. Core moved from 1.17.110 to 1.17.124 (1.18.0 is the same code):

- 1.17.111: a module can start its own scheduled action by delegation.
- 1.17.112: the server maintenance job input channel and a lock fix.
- 1.17.113 and 1.17.114: the module root program with `secret_inputs`, switched off, then on again under AD-62.
- 1.17.115: schedule next-run and the uninstall secrets rule.
- 1.17.116 to 1.17.124: the `core.sandbox` foundation. `SANDBOX_ENABLED` is False, so nothing runs in the sandbox.

## For module developers

No registry, runtime helper or `api()` change. A grep of `modules/*/package/extensions/*/ui/` found nothing affected, because nothing in `src/` changes. All calls still go through `src/api.js`. Nothing is kept in browser storage.

## Assumptions

Recorded as information in `reviews/questions/ui.md`:

- The minor bump is Johan's request of 16 November 2026, not the usual patch.
- The Core requirement is `>=1.18.0,<2.0.0` because Core 1.18.0 is signed on dev.
- Every open request in `reviews/requests/ui.md` waits for a later patch.

## Checks

`npm test` runs 202 test entries. No test was added. The release test is now `tests/release-0.13.0.mjs`; it also checks that `src/` has no changes. Changed on purpose: `test-runner-0.12.117.mjs` and `system-update-stale-head-0.12.126.mjs` (the release test name only), `release-notes-l74.mjs`, and the version and Core requirement patterns in 35 older tests, which pinned 0.12.x and 1.17.x (widened to 0.13 and 1.x.y; no other assertion changed). `npm run build` was run and built.

`npm test` stops at the first failing entry (the known one below), so the entries were run one by one. 202 test entries ran on this PC. 201 passed. The one failure is the known failing test below.

## What could not run

The packaged install on tt01 or dev02 was not run here. The page was not tried against a live Core 1.18.0. Pack and sign belong to the release manager.

## Known failing test

`tests/theme-tokens-0.12.114.mjs` fails because Report Manager and Script Manager define `.tt-win`, which the UI kit owns. That is a request to those two modules, not a UI defect. It failed before this release too. The test is not weakened.

## Left out, and why

This release is a label only, so every open item in `reviews/requests/ui.md` stays there for its own release:

- Universal filters, the UI half (Shared choice, withheld marker).
- Scheduler system-action Yes/No confirmation and groups summary (Core 1.17.66).
- Scheduler monthly nth weekday (Core 1.17.88).
- `context.confirm` tick-box option (wapm 0.4.10).
- `context.tacticalOperation` correlationId (needs Core's half too).
- System Update must not rewrite tracked UI files (waits on a Core entry).
- "Not available" list on the Online catalogue (Core 1.17.108).
- Core private-relay setting switch (AD-30).
- Sandbox status panel: Core has no route or permission for it yet.
- Module without a category shown as refused (AD-21 condition 6): not scheduled.

## Dev-server checklist

Run on tt01 or dev02 with Core 1.18.0 and this UI installed.

1. **Install this UI on a server running Core 1.18.0.** PASS: the install finishes and Core accepts the Core requirement. FAIL: Core refuses the package or the requirement. Send back: the install log and the Core version.
2. **Sign in.** PASS: the sign-in page loads and you reach the home page. FAIL: an error or a blank page. Send back: a screenshot and the HAR of the sign-in.
3. **Open Settings → Modules.** PASS: the Installed table loads. FAIL: an error or an empty page. Send back: a screenshot and the HAR of `GET /api/tfd/modules/`.
4. **Open Help → About.** PASS: it shows UI 0.13.0 and Core 1.18.0. FAIL: another version. Send back: a screenshot.
5. **Open a module page, for example Script Manager.** PASS: the page opens as before. FAIL: an error or a blank page. Send back: a screenshot and the browser console.
6. **Open System Update.** PASS: the page opens and shows the current versions. FAIL: an error or a blank page. Send back: a screenshot and the HAR.
