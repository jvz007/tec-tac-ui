# UI 0.12.127

Date: 3 November 2026. Requires Core 1.17.109 or later (raised from 1.17.107).

## What changes for you

You can now grant Tactical 1.6.1's new file browser permission from the role editor. The Online catalogue also warns you when the Licensing Server has not classified a module. Two small System Update fixes from the 0.12.126 review are included. This works from `docs/planning/tactical-1.6.1/IMPACT-TACTICAL-1.6.1.md` (UI row) and closes two requests in `reviews/requests/ui.md`: "From Core 1.17.109 (3 November 2026): warning chip for an unclassified licensed module" and "Held from UI 0.12.126 (3 November 2026)".

**1. "Use File Browser" in the role editor (Tactical 1.6.1).**

- Settings → Access → Roles → Tactical permissions, Agents group: a new tick box "Use File Browser" (`can_use_file_browser`), right after "Use Mesh".
- It shows only when the role Tactical returns has the field. Tactical 1.6.1 adds it; its migration turns it on for every role that already has `can_use_mesh`.
- On Tactical 1.5.2 the role has no such field, so the tick box does not show and Save never sends it. Save still sends back exactly the fields Tactical returned, as before.
- Remote Background's file browser (a later module release) uses this permission. Granting it here changes nothing else in Tec-Tac today.

**2. Unclassified module warning on the Online catalogue (Core 1.17.109).**

- Settings → Modules → Online catalog: when a module has `category_warning`, a yellow warning chip shows beside its name, with Core's text as sent. Today that is "Unclassified on the Licensing Server: treated as test".
- Download & inspect, Download update and Reinstall work as before. Core decides whether the module can install; the chip only tells you why it may not on a production server.
- No chip when `category_warning` is null, empty or missing (an older Core).

**3. Last checked names out-of-date parts for a release source too.** When Core's `refresh.stale` lists `stable_release` or `latest_release`, the release card reads, for example, "Checked 2 hours ago. Out of date: stable release". Before, only the branch card named them.

**4. Install after the downgrade question checks the stage again.** If the stage check turns blocked while the downgrade Yes/No is open, Yes no longer starts the install. Core refused such an install anyway; now the page never sends it.

## For module developers

- No registry, runtime helper or `api()` behaviour changes. A grep of `modules/*/package/extensions/*/ui/` found no module that uses the role editor's permission list, the Online catalogue cells or the System Update helpers.
- All calls go through `src/api.js` as before. Nothing is kept in browser storage.

## Assumptions

Recorded as information in `reviews/questions/ui.md` (Q98):

- The label is "Use File Browser", from the editor's existing rule (the key without `can_`, words capitalised), like "Use Mesh". Tactical's own label is "Use File Browser".
- The new permission sits in the Agents group next to `can_use_mesh`, as briefed, because the fallback file browser is MeshCentral's. Tactical's own role form lists it after "Use Registry", in the same Agents block.
- The `category` label (core, server, premium) was optional in the request and is left out to keep the table as it is.

## Checks

`npm test` runs 202 test entries. New: `tests/tactical-161-parity-0.12.127.mjs` (the permission is in the Agents group once, right after `can_use_mesh`, label "Use File Browser"; a 1.5.2 role neither shows nor sends it, a 1.6.1 role does both; the chip helper and the drawn chip, no chip for null, empty, missing or non-string values, the action button unchanged; `refresh.stale` on the release path; the post-confirm re-check, including a simulated confirm during which the check turns blocked and no install is sent). The release test is now `tests/release-0.12.127.mjs`. Changed on purpose: `system-update-stale-head-0.12.126.mjs` (its version checks moved to the release test) and `test-runner-0.12.117.mjs` (the release test name). `npm run build` built.

202 test entries ran on this PC. 201 passed. The one failure is the known failing test below.

## What could not run

The packaged install on tt01 or dev02 was not run here. The page was not tried against a live Core 1.17.109 or a live Tactical 1.6.1; the tests use the field names in Core 1.17.109's request and Tactical 1.6.1's `accounts/models.py`. Pack and sign belong to the release manager.

## Known failing test

`tests/theme-tokens-0.12.114.mjs` fails because Report Manager 0.7.4 defines `.tt-win`. That is requested from the core-modules area and is not fixed in this release. It failed before this release too.

## Left out, and why

- The "Not available" list on the Online catalogue (request "From Core 1.17.108"): not part of this brief; it stays in `reviews/requests/ui.md` for its own release.
- A category label on catalogue rows: optional in the request, see Assumptions.

## Dev-server checklist

Run on tt01 or dev02 with Core 1.17.109 and this UI installed.

1. **On Tactical 1.5.2, open Settings → Access → Roles and pick a role.** PASS: the Agents group shows "Use Mesh" and no "Use File Browser". FAIL: a "Use File Browser" tick box shows. Send back: a screenshot and the HAR of `GET /accounts/roles/<id>/`.
2. **On Tactical 1.5.2, change any tick box on that role and press Save.** PASS: the save works and the PUT body has no `can_use_file_browser`. FAIL: an error, or the field is in the body. Send back: the HAR of the PUT.
3. **On Tactical 1.6.1, open a role that has "Use Mesh" ticked.** PASS: "Use File Browser" shows right after "Use Mesh" and is ticked (Tactical's migration copied it). FAIL: missing, or in another group. Send back: a screenshot and the HAR of the GET.
4. **On Tactical 1.6.1, untick "Use File Browser" and press Save, then reload the page.** PASS: it stays unticked after the reload, and the PUT body has `can_use_file_browser: false`. FAIL: it comes back ticked, or Save fails. Send back: the HAR of the PUT and the next GET.
5. **Open Settings → Modules → Online catalog with a module the Licensing Server has not classified.** PASS: a yellow chip "Unclassified on the Licensing Server: treated as test" shows beside the module name; its button looks as before. FAIL: no chip, or the button is missing or greyed out because of the chip. Send back: a screenshot and the HAR of `GET /api/tfd/modules/catalog/online/`.
6. **Look at a classified module on the same tab.** PASS: no chip. FAIL: a chip on a module whose `category_warning` is null. Send back: a screenshot and the HAR.
7. **On System Update with a Release source, when the answer's `refresh.stale` lists `stable_release`.** PASS: Last checked reads "Checked <time>. Out of date: stable release". FAIL: only "Checked <time>". Send back: a screenshot and the answer's `refresh` object.
