# UI 0.12.120

Date: 20 October 2026. Requires Core 1.17.67 or later (the newest signed Core this UI was tested against). It uses three routes that only Core 1.17.67 has.

**Install Core 1.17.67 before this UI.** On an older Core the update refuses by the Core requirement.

## What changes for you

You asked (Q83) for a way to open and download the System Updates and server-maintenance logs. UI 0.12.119 could open them but could not download. Core 1.17.67 now serves the log files, so this release turns Download on.

- **System Updates.** Open log now reads the full log from Core, not the last 80 lines. Download saves it as `system-update-<component>-<date>.log`.
- **Server maintenance.** Open shows the whole log as one text with three headed sections (log, output, errors). Download saves it as `server-maintenance-<action>-<date>.log`. There is no part picker: you get the one combined file.
- **A job with no log.** The System Updates window asks Core first whether a log exists. If it does not, the window says "Core kept no log text for this job." and Download is off with that same reason. It does not ask for a log that is not there. A finished update is now found in Core's history too, so the old "Core no longer holds this log" case is gone.
- **History tab, System updates.** It now lists jobs from Core's new job list (the jobs folder and history merged), up to 100 rows, instead of the short status history. When Core has more, the footer reads "N of TOTAL finished update jobs". There is no paging control yet.
- **Plain answers when Core refuses.** No rights: "You need module management rights to see this". No log or no such job: Core's own sentence. Core could not record the read: "Core could not record this read, so the log was not shown."
- **Fixed, held from the 0.12.119 review (Low):** the job id in the System Updates detail read is now encoded in the address.

The same rights apply as before (module management). Logs are shown as text, never as HTML, and no token is ever in an address. Nothing was restyled.

## For module authors

No contract changed. No module uses these routes or the helpers that changed (checked by searching `modules/`; none of it is exposed through `register(context)`).

## Decisions to know about

- **Q92 (informational).** The maintenance job list has no `has_log`, so Download is on for every maintenance job. A job with no kept log shows Core's own sentence when opened. See `reviews/questions/ui.md`.
- **Two reads per System Updates open.** The window reads the job first (for `has_log`), then the log.
- **The three new routes are not yet in a signed contract export** (the newest is 1.17.65-0.12.118). The route test names them from Core's `docs/system-update-logs.md`. The signed export row arrives with the next export, which the release manager regenerates.

## Left out, and why

- **Scheduler page: Yes or No for a system action and the groups summary** (Core 1.17.66). A separate flow in the Scheduler editor. Stays in `requests/ui.md`.
- **Universal filters, UI half:** waits for your confirmation after Core 1.17.51.
- **A module without a category shown as refused:** you have not named the release.
- **`correlationId` on `context.tacticalOperation`:** Core's browser route does not accept it yet.
- **A paging control for the System updates History source, and a dedicated maintenance history route:** Core asked only for the log route. One read of up to 100 rows is kept.
- **Q85 (licensing wording) and Q89 (fonts):** unchanged. The product keeps the system font stacks.

## Tests

`tests/system-update-log-download-0.12.120.mjs` checks the new routes through a stub fetch (encoded ids, page size clamped to 100, `?part=` fallback, `?download=1`, token only in the header), the log window rendered with Vite's loader (Download on or off by `has_log`), file names, the 403, 404 and 503 sentences, the text-only source rules, and that History reads the new list. `job-log-access-0.12.119.mjs` and `api-contract-routes-0.12.58-1.mjs` were updated where they asserted the old behaviour (disabled Download, 80-line view). `release-0.12.119.mjs` is replaced by `release-0.12.120.mjs`. The 0.12.119 notes moved to `docs/releases`.

The download click itself (object URL, file name, 30-second keeper) is checked by reading the source and by the keeper test from 0.12.119, not by a browser.

## Check it worked

```bash
cd workspace/ui && npm test && npm run build
```

Both should finish without an error. `npm test` ends with "All 194 test entries passed." (see the note in the hand-off if one entry fails for a reason outside this release).

## What could not run

- The dev-server steps below were **not run here**. No browser session against a real Core 1.17.67.
- No click on Download in a real browser. The file save is tested through stubs.

## Dev-server checklist (for Johan)

Do these on dev02 with Core 1.17.67 installed. Each step says what you should see (PASS), what is a FAIL, and what to send back.

1. **System Updates, Open log.** Open System Updates, then Open log on a finished update that has a log.
   PASS: the log text shows and Download is on.
   FAIL: it says "Core no longer holds this log", or shows nothing.
   Send back: a screenshot and the job's time.
2. **System Updates, Download.** Click Download in that window.
   PASS: a file named `system-update-<component>-<date>.log` is saved and its text matches the window.
   FAIL: no file, or the file name is blank.
   Send back: the file name and the first lines of the file.
3. **Server maintenance.** Module Manager, History, Log source "Server maintenance", open a job.
   PASS: the log, output and errors show under headed sections. Download saves `server-maintenance-<action>-<date>.log`.
   FAIL: an empty window for a job that ran, or no file.
   Send back: a screenshot and the action name.
4. **History, System updates.** Module Manager, History, Log source "System updates".
   PASS: it lists jobs from Core's new list, with more than 12 rows when they exist. The footer reads "N of TOTAL finished update jobs" when Core has more than are shown.
   FAIL: the list is empty while updates exist, or it still stops at 12.
   Send back: a screenshot of the list and footer.
5. **A job with no log.** Open a job that has no log.
   PASS: the window shows "Core kept no log text for this job." (or Core's own sentence). Download is off or the sentence shows. Nothing crashes.
   FAIL: a raw error, a blank page, or a Download that saves an empty file.
   Send back: a screenshot.
6. **Rights.** Sign in as a person without module management rights.
   PASS: no History tab, and no log content. A direct log read would show "You need module management rights to see this".
   FAIL: the tab or any log text shows.
   Send back: the person's role and a screenshot.
7. **Core requirement.** Try to install this UI on a server with Core 1.17.66.
   PASS: the update refuses by the Core requirement and nothing changes.
   FAIL: 0.12.120 installs on 1.17.66.
   Send back: the refusal text.
