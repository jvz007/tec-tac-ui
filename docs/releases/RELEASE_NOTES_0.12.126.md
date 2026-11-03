# UI 0.12.126

Date: 3 November 2026. Requires Core 1.17.107 or later (raised from 1.17.104).

## What changes for you

System Update no longer offers an old saved branch head as the update, and a downgrade always asks you first. You can also set the release channel of the licensed module source. This closes two requests in `reviews/requests/ui.md`: "From Core 1.17.106 (3 November 2026): System Update must not offer a stale branch head" and "From core 1.17.103 (3 November 2026): a channel field for the licensed repository source" (AD-58 D6).

**1. A stale branch head is not offered.**

- When Core marks the saved head old (`branch.head_stale: true`, or `refresh.reason: "not_refreshed"`), the card says "Last checked <time>; refresh to see the latest", with a Refresh button. The time is `branch.head_checked_at`.
- While the head is stale, the Download & inspect button is off and does not name the old commit. Its tooltip says to refresh first.
- After a Refresh brings a head that is not stale, the button works again.
- **Choice made:** the page does not refresh by itself on load. You press Refresh. Core 1.17.106 chose to add no GitHub request to page loads, and its `refresh=none` answer already sends one conditional request when the head is old. A second automatic request would add load for no new information. Recorded in `reviews/questions/ui.md` (Q97).

**2. Out-of-date parts are named.** When `refresh.stale` lists anything, Last checked reads "Saved check. Out of date: branch head, stable release" instead of "Saved check, less than 5 minutes old". An unknown reason still reads "Saved check".

**3. "dev has moved to …" is shown as Core wrote it.** A 409 `stale_candidate` from staging now shows Core's text, for example "dev has moved to 28e1396; the check showed 45cbf36. Refresh the check and try again.", with the Refresh the check button, as before. An older Core's generic text keeps the page's own sentence.

**4. A downgrade is confirmed on its own.**

- The inspection card reads DOWNGRADE whenever `preview.downgrade` is true, `confirmation_required` is `downgrade`, or `operation` is `downgrade`. It never reads UPDATE for a downgrade.
- Core's `downgrade_warning` shows on the card, and the button reads "Install downgrade".
- Pressing it asks a plain Yes/No: "Downgrade Tec-Tac Framework from 1.17.105 to 1.17.99?", with Core's warning under it. Only Yes sends `allow_downgrade: true`. No sends nothing.
- The old tick box ("I understand this installs an older system component …") is gone; the Yes/No dialog replaces it.

**5. The Channel field on the licensed module source.**

- On Settings → Modules → Repositories, the source with `kind: "licensing"` shows a Channel field. Empty means the licence's own channel. Otherwise 1 to 32 lower case letters, digits, `-` or `_`, starting with a letter. The page checks this as you type; Core checks it again.
- Its address is shown as text ("Set by the server"); the address and Trust fields are hidden for this source. Name, Priority, Enabled and Channel stay editable.
- Save sends only `name`, `priority`, `enabled` and `channel` with the existing `PATCH /api/tfd/modules/repositories/<id>/`. Index repositories send what they always sent, with no channel.
- When `sync.licensing_state` is not `ok`, the editor shows Core's sentence from `sync.error` (or a plain sentence for the state when Core sent none).

## For module developers

- No registry, runtime helper or `api()` behaviour changes. A grep of `modules/*/package/extensions/*/ui/` found no module that uses the System Update or repository routes.
- All calls go through `src/api.js` and `src/modules.js` as before. Nothing is kept in browser storage.

## Assumptions

Recorded as information in `reviews/questions/ui.md` (Q97):

- No automatic refresh on page load (item 1 above).
- Stage stays off only for a stale branch head. A release source stages as before; Core 1.17.106 left a release-source stage unchanged.
- The downgrade tick box is replaced by the Yes/No dialog, so there is one confirmation, not two.
- The channel is checked in the page with Core's own pattern, and Save stays off for a value Core would refuse.

## Checks

`npm test` runs 201 test entries. New: `tests/system-update-stale-head-0.12.126.mjs` (the stale flag and `not_refreshed`, the "Last checked …" line, `refresh.stale` names, Core's 409 text and the fallback, the downgrade label, question and warning, Yes before `allow_downgrade`, no tick box, no refresh on page load, the Channel helpers and payload, the licensing state sentence, the editor template, and the version files). The release test is now `tests/release-0.12.126.mjs`. Changed on purpose: `github-rate-limit-0.12.124.mjs` (the 409 now shows Core's text), `repository-sync-schedule-0.12.112.mjs`, `module-manager-brand-board-0.12.118.mjs` and its fixture `fixtures/module-manager-handlers-0.12.118.json` (Save sends the draft through `repositoryPayload`, and the Save button's rule names the Licensing source), and `test-runner-0.12.117.mjs` (the release test name). `npm run build` built.

201 test entries ran on this PC. 200 passed. The one failure is the known failing test below.

## What could not run

The packaged install on tt01 or dev02 was not run here. The page was not tried against a live Core 1.17.107; the tests use the answer shapes in Core 1.17.106's release notes, `system_update.py` and `module_repository.py`. Pack and sign belong to the release manager.

## Known failing test

`tests/theme-tokens-0.12.114.mjs` fails because Report Manager 0.7.4 defines `.tt-win`. That is requested from the core-modules area and is not fixed in this release. It failed before this release too.

## Left out, and why

- An automatic branch refresh on page load: the choice above.
- A Channel column in the repositories table: not asked for; the channel shows in the editor.

## Dev-server checklist

Run on tt01 or dev02 with Core 1.17.107 and this UI installed. Set the Framework or UI update source to the `dev` branch.

1. **Open System Update when the saved head is old** (for example, after a push to `dev` without a refresh, or with GitHub blocked). PASS: the card shows "Last checked <time>; refresh to see the latest" with a Refresh button, and Download & inspect is greyed out with no commit in its label. FAIL: Download & inspect is enabled, or names the old commit. Send back: a screenshot and the HAR of `GET /api/tfd/system/updates/online/`.
2. **Press Refresh in that line.** PASS: the line goes away, Download & inspect is enabled and names the current head. FAIL: the line stays while the answer has `head_stale: false`. Send back: the HAR of the refresh.
3. **Look at Last checked when the answer has `refresh.stale` with entries.** PASS: it reads "Saved check. Out of date: …" with the parts named. FAIL: it reads "Saved check, less than 5 minutes old". Send back: a screenshot and the answer's `refresh` object.
4. **Stage after `dev` has moved without refreshing** (open the page, push to `dev`, wait 5 minutes, then press Download & inspect if it is still enabled). PASS: the message reads "dev has moved to <sha>; the check showed <sha>. Refresh the check and try again." with a Refresh the check button; nothing is staged. FAIL: a generic message, or a package is staged. Send back: a screenshot and the HAR of `POST /online/stage/`.
5. **Set the source to Release and stage an older stable release.** PASS: the inspection card reads DOWNGRADE, shows Core's warning naming both versions, and the button reads "Install downgrade". FAIL: UPDATE anywhere on the card. Send back: a screenshot.
6. **Press Install downgrade, then No.** PASS: a Yes/No dialog names both versions; after No nothing starts and the Network tab shows no install request. FAIL: no dialog, or an install request. Send back: a screenshot and the Network list.
7. **Press Install downgrade again, then Yes.** PASS: the install starts and its request body has `allow_downgrade: true`. FAIL: Core refuses with a downgrade error, or nothing starts. Send back: the HAR of the install request.
8. **Open Settings → Modules → Repositories and edit the Licensing source.** PASS: the address shows as text, no Index URL or Trust field, a Channel field shows; typing `Beta` shows the channel error and greys out Save; an empty value or `beta` saves, and the row's `channel` changes in `GET /api/tfd/modules/repositories/`. FAIL: an Index URL or Trust field, or Save sends `url` or `trust`. Send back: a screenshot and the HAR of the PATCH.
9. **Edit an ordinary index repository.** PASS: the Index URL and Trust fields are there as before and Save works. FAIL: a Channel field, or Core refuses the save with "A channel is set on the Licensing source only". Send back: a screenshot and the HAR of the PATCH.
