# UI 0.13.6

Date: 25 November 2026. Requires Core 1.18.52 or later (was 1.18.45).

## What changes for you

Engineers can now enrol their own PC for the Engineer Console from the browser. Administrators can allow it, see who has a certificate and revoke one. A certificate is a small signed file that tells Core which engineer's PC is asking. Core 1.18.52 issues them but does not check them yet, so nothing stops working if you have none.

**For engineers (My Account).** A new Console certificate card sits after the Tactical UI card.
- With no certificate and no permission yet, it says: Ask your administrator to issue you a Console certificate.
- Once an administrator allows you, **Enrol this PC** shows a one-time code with a countdown, a link that opens the Engineer Console, and **Copy code**. The code works once. It is never kept in the browser. It disappears when the countdown ends or when you leave the page.
- Your certificates show the PC name, the last 8 characters of the serial, when it was issued and when it ends, and a state: active, expiring, expired or revoked.
- You can revoke your own certificate. You pick a reason (lost, left, admin, other) and answer Yes or No. Nothing is typed.
- **Manage my certificates** opens the new page.

**For administrators (Administration, Console certificates).** A new page at `/access/console-certificates`.
- Everyone sees their own rows. People with `core.console_certificates.view` or `.manage` see every row, filter by engineer and state, and page through 50 at a time. The open enrolments sit in a second table.
- **Manage** also gets **Allow to enrol** (pick an engineer), **Cancel** on an open enrolment, and **Revoke** on any row.
- The certificate authority (CA) panel shows the server id, dates and counts. It warns when the authority ends within a year or when Core cannot read its master key.
- **Replace CA** is for a superuser only. A Yes or No dialog says that every active certificate is revoked, every open enrolment is cancelled, and engineers must be allowed and enrol again.
- Core's own refusal text is shown as sent for every 400, 403, 409, 429 and 503.

**System Configuration** has a new card, Engineer Console certificate validity: whole days from 1 to 730, 365 by default. It affects new certificates only. Only a superuser can change it.

**Roles.** Core 1.18.52 serves a new Console certificates group (`core.console_certificates.view` and `.manage`). The Roles editor shows it without a UI change.

**Help.** A new article, Engineer Console certificates.

## Wording rule

Revoke and Replace CA do not end a session that is already open. Ending one arrives with Core 1.18.53. Every dialog says so. No text promises that a revoke ends a tunnel.

## For module developers

No registry, runtime helper or `api()` change. This release adds one route, one menu entry, two cards and new helper files. No module uses any of it.

## Assumptions

- The menu entry shows only for a superuser and for holders of the view or manage permission. Everyone else reaches their own rows through the Manage my certificates link on My Account. The alternative was an entry for everyone.
- **Copy code** copies the one-time code itself. The `tectac-console://enrol` link is the clickable offer, and it is built only when the host is a plain host name and the code has 43 allowed characters.
- Engineers who revoke their own certificate also pick a reason.
- Replace CA is shown to a superuser only.
- Last used shows a dash until Core 1.18.53.
- The held shell check for the custom-scheme link (request from networkprobe 0.2.21) is not taken. If the browser blocks the link, Copy code still works.
- Enrolment codes can be made with a Tactical API key, which skips MFA. That is a Medium finding in Core 1.18.52, and Core's to fix. The UI relies on Core refusing it.
- The plan said the touched files use CRLF. They use LF, so LF is kept.

## Checks

`npm test` and `npm run build` ran on this PC (results in the release report). New tests: `tests/console-certificates-0.13.6.mjs`, `tests/console-certificates-page-0.13.6.mjs`, `tests/console-certificate-validity-0.13.6.mjs`. The release test is now `tests/release-0.13.6.mjs`. The routes of Core 1.18.52 are added by name to `tests/api-contract-routes-0.12.58-1.mjs`. The 0.13.5 notes moved to `docs/releases/`. The U1 request is removed from `reviews/requests/ui.md` with this release (the release manager does this).

## Dev-server checklist

Use one administrator account and one ordinary engineer account.

1. **Card, no certificate.** Sign in as the engineer. Open My Account. PASS: the Console certificate card says "Ask your administrator to issue you a Console certificate." and has no Enrol button. FAIL: an Enrol button shows, or the card is missing. Send back: a screenshot.
2. **Allow, then enrol.** As the administrator, open Console certificates, pick the engineer, press **Allow to enrol**. As the engineer, reload My Account and press **Enrol this PC**. PASS: a code, a countdown and an Open the Engineer Console link show, plus Copy code. FAIL: no code, or an error. Send back: a screenshot and the message.
3. **Code is gone.** Wait for the countdown to end, or open another page and come back. PASS: the code is gone. In the browser developer tools, Application, check Local storage, Session storage and IndexedDB: the code is in none of them, and not in the address bar. FAIL: the code stays or is stored. Send back: a screenshot.
4. **Own revoke.** After the Console enrols, press **Revoke** on your row, choose a reason, answer Yes. PASS: a plain Yes or No dialog with no text box, the sentence "This does not end a session that is already open", and the row turns Revoked. FAIL: you must type, the sentence is missing, or the row stays active. Send back: a screenshot.
5. **Administrator page.** Open Administration, Console certificates. Use the engineer and state filters. Allow another engineer, then Cancel that enrolment with Yes. Revoke any row with a reason. PASS: each action works and the lists refresh. FAIL: a filter shows the wrong rows or an action fails. Send back: a screenshot and the message.
6. **Ordinary engineer.** As the engineer, open the page from Manage my certificates. PASS: only their own rows, with Revoke, no Allow, Cancel or CA panel, and no menu entry. FAIL: other people's rows or any admin control. Send back: a screenshot.
7. **View-only holder.** Give a role only `core.console_certificates.view`. Sign in as that person. PASS: every row and the CA panel show, with no Allow, Cancel or Revoke on other people's rows. FAIL: any write button shows. Send back: a screenshot.
8. **CA panel and Replace.** As a superuser, read the CA panel. PASS: server id, dates and counts show, and **Replace CA** shows only for the superuser. Press it and answer **No**: nothing changes. Do not answer Yes unless you accept that every engineer must enrol again. FAIL: the button shows for a non-superuser, or No still replaces. Send back: a screenshot.
9. **Validity setting.** Open System Configuration. PASS: the Engineer Console certificate validity card shows the value, range 1 to 730, default 365 and who last changed it. As a superuser, save 30. A non-superuser sees the value and "Only a superuser can change this." FAIL: 0 or 731 saves, or a non-superuser sees the form. Send back: a screenshot and the message.
10. **Roles editor.** Open Access, Roles, expand a role's Tec-Tac permissions. PASS: a Console certificates group with view and manage rows. FAIL: the group is missing. Send back: a screenshot.
