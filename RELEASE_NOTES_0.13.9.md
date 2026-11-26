# UI 0.13.9

Date: 26 November 2026. Requires Core 1.18.58 or later (was 1.18.57).

## What changes for you

- **Engineer Console web address.** System Configuration has a new card next to the Engineer Console certificate validity card. It shows the Tec-Tac web address the Engineer Console opens for its sign-in. A superuser can set it or reset it. Everyone else sees the value and a note that only a superuser can change it.
  - The address must use https. It cannot hold a user name, a query or a fragment. The path must be empty, `/`, `/tec-tac` or `/tec-tac/`. Core stores it with `/tec-tac/` added.
  - Empty text, or Reset to default, clears it. Core then uses the single https address in Tactical's CORS settings.
  - If Core refuses an address, you see Core's message as sent and nothing is saved.
  - An older Core without this setting does not show the card.
- **Single sign-on after an abandoned Console sign-in.** If you opened an Engineer Console link, started single sign-on, backed out at the provider and later signed in from the plain sign-in page, you could land on a stale Console page. You now land on the dashboards. A Console link that goes through single sign-on still ends on the Console page.

## For module developers

No registry, runtime helper or `api()` change. No module uses these files.

## Assumptions

- The card is shown to a superuser only (display only). Core refuses everyone else with 403.
- The setting is sent alone in its own PATCH, because Core 1.18.58 refuses a mixed body whole for a non-superuser.
- The UI checks only the 300-character limit. Core stays the authority for the address rules, and its 400 text is shown as sent.
- Empty or blank text is sent as null, which Core treats as a reset.
- `savePendingConsoleRoute` now also removes an older saved route when the new hash is not a Console route (or saving is not possible), so every caller gets the guarantee. Storage stays one short-lived `sessionStorage` entry with no token, code or credential.

## Checks

`npm test` and `npm run build` results are in the release report. New tests: `tests/console-ui-url-0.13.9.mjs`, `tests/console-sign-in-route-0.13.9.mjs`. The release test is `tests/release-0.13.9.mjs`. The 0.13.8 notes moved to `docs/releases/`.

## Dev-server checklist

1. As a superuser open System Configuration on Core 1.18.58. PASS: the "Engineer Console web address" card shows, the value is empty or the stored address, the default is "Not set". FAIL: the card is missing. Send back: your Core version and a screenshot.
2. Save `https://example.org`. PASS: after the reload the value is `https://example.org/tec-tac/` and Core's audit log has a row for the change. FAIL: another value, an error, or no audit row.
3. Save `https://example.org/tec-tac`. PASS: the same stored value as step 2. FAIL: any other value. Send back: what shows.
4. Press Reset to default (or save empty text). PASS: the card shows "Not set: Core uses the single https address in Tactical's CORS settings". FAIL: the old value stays. Send back: the message shown.
5. Save `http://example.org`, then `https://example.org/other/`. PASS: each shows Core's 400 text as sent and nothing is saved. FAIL: either one saves, or the message is not Core's. Send back: the text.
6. Sign in as a person who may manage runtime settings but is not a superuser. PASS: the value shows read-only with "Only a superuser can change this." and no form. FAIL: a form shows.
7. On an older Core without the setting. PASS: the card is absent and nothing else changes. FAIL: an empty or broken card.
8. Open an Engineer Console sign-in link, start single sign-on, abandon it at the provider, return to the plain sign-in page and sign in with single sign-on. PASS: you land on the dashboards. FAIL: you land on a Console page. Then open a Console link that goes through single sign-on. PASS: it ends on the Console page. FAIL: it ends on the dashboards. Send back: which step and whether the browser blocks site data.
