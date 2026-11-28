# UI 0.13.10

Date: 28 November 2026. Requires Core 1.18.59 or later (was 1.18.58).

## What changes for you

- **Engineer Console web address accepts a bare host.** Type `rmm.tcrm.techxflow.net.za` and the card adds `https://` for you. A line under the field shows what will be saved. Before this, Core refused a bare host and nothing was stored.
  - Text that starts with `http://` is refused in the card with "The web address must start with https://". Nothing is sent.
  - Text that starts with `https://` goes through as typed.
  - Text with any other scheme (for example `ftp://`) goes to Core as typed, and Core refuses it.
  - Core keeps every other address rule (path, user name, query, fragment). If Core refuses an address, you see its message.
  - After Save, the card reloads and shows the value Core stored.
  - Empty text and Reset to default still reset the address.

## For module developers

No registry, runtime helper or `api()` change. No module uses these files.

## Assumptions

- Only the scheme step is done in the card. Core stays the authority for all other address rules, so the card never guesses a path or host.
- The 300-character limit is checked after `https://` is added.
- `tests/console-ui-url-0.13.9.mjs` changes by design: `http://` is now invalid in the card, the 300-character boundary cases now start with `https://` (the limit counts the added prefix), and a bare host is now saved with `https://` in front. No other assertion was relaxed.
- The Console certificate list hint was already shipped in 0.13.8 (`AUDIT_HINT`, tested by `tests/console-certificates-hint-0.13.8.mjs`). Nothing new was built for it.

## Checks

`npm test` and `npm run build` results are in the release report. New test: `tests/console-ui-url-bare-host-0.13.10.mjs`. The release test is `tests/release-0.13.10.mjs`. The 0.13.9 notes moved to `docs/releases/`.

## Dev-server checklist

1. Enter `rmm.tcrm.techxflow.net.za`. PASS: a line shows "Will be saved as https://rmm.tcrm.techxflow.net.za". After Save and the reload, the value is `https://rmm.tcrm.techxflow.net.za/tec-tac/`. FAIL: an error, or another value. Send back: the text shown.
2. Enter `http://x`. PASS: the card shows "The web address must start with https://", Save is disabled and nothing is sent. FAIL: it saves or Core answers.
3. Enter `https://host/other-path` and Save. PASS: Core's refusal shows as sent and nothing is saved. FAIL: it saves. Send back: the text.
4. Clear the field and Save, or press Reset to default. PASS: the address resets. FAIL: the old value stays.
