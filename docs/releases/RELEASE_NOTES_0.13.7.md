# UI 0.13.7

Date: 25 November 2026. Requires Core 1.18.53 or later (was 1.18.52).

## What changes for you

Two small fixes on the Engineer Console certificate card in My Account.

- **Copy enrol link.** The copy button now copies the whole `tectac-console://enrol?host=<host>&code=<code>` link, not the bare code. The Engineer Console needs the host as well as the code, and it refuses a bare code. Paste the link into `tectac-console enrol`. The one-time code still shows on screen. If the host is not a plain host name, there is no valid link, so the button is hidden and the card tells you to enter the host and code by hand.
- **Short serial.** The short serial is the first 8 characters of the serial, the same as Core and the Console show. The revoke dialog now names a certificate with no PC name by that fragment, so it matches the tables. (The 0.13.6 notes said "last 8". That was wrong.)

## Core 1.18.53

- Core now fills Last used for a certificate, at most once an hour. It stays empty until the first use. The card and the Console certificates page already show it, with a dash when empty. Nothing to build.
- Core now refuses a Tactical API key on the enrolment code, issue and replace CA routes (`403 interactive_session_required`). The browser shell uses a Knox session, so nothing changes here.

## For module developers

No registry, runtime helper or `api()` change. No module uses the card, the helper or the revoke component.

## Assumptions

- With no valid link, the button is hidden and the hand-entry hint stays, because a bare code would only lead to a refusal in the Console.
- The link is built from the issued code only and is never kept in browser storage. It clears with the code.
- The shell check for the custom-scheme link (request from networkprobe 0.2.21) stays open until the dev02 test decides it.

## Checks

`npm test` and `npm run build` ran on this PC (results in the release report). New test: `tests/console-certificates-enrol-link-0.13.7.mjs`. The release test is now `tests/release-0.13.7.mjs`. The 0.13.6 notes moved to `docs/releases/`.

## Dev-server checklist

1. **Enrol.** Sign in as an engineer who is allowed to enrol. Open My Account, Engineer Console card, press **Enrol this PC**. PASS: a 43-character code shows, the button reads **Copy enrol link**, and **Open the Engineer Console** shows. FAIL: the button reads Copy code, or no code appears. Send back: a screenshot.
2. **Copy.** Press **Copy enrol link**, paste into a text field. PASS: `tectac-console://enrol?host=<dev02 host>&code=<the same code>` and the notice "Enrol link copied." FAIL: only the bare 43 characters, or the host is missing. Send back: the pasted text with the code blanked, and the notice.
3. **Console.** Give the link to `tectac-console enrol` in the Engineer Console. PASS: enrolment accepted. FAIL: refused as a bare code, or the host is not pinned. Send back: the Console's message.
4. **Short serial.** Enrol, then revoke a certificate whose PC name is empty (or read the dialog target). PASS: the dialog names the first 8 characters, matching the Serial column on the card, on `/access/console-certificates` and in the Console's status. FAIL: the fragment differs. Send back: both.
5. **Last used.** After a Console connection, reload the card. PASS: Last used shows a time for that certificate, and a dash before first use. FAIL: always a dash after use. Send back: the row (a Core issue, not UI).
6. **Countdown.** Wait out the countdown. PASS: the code and the button disappear. FAIL: the code stays. Send back: a screenshot.
