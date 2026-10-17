# UI 0.12.117

Date: 17 October 2026. Requires Core 1.17.52 or later (raised from 1.17.50, the newest signed Core on dev; Core 1.17.52 carries 1.17.51). The shared filter editor now handles date and number fields. It also fixes two small findings from 0.12.116 and moves the test list into a runner file. It is a patch release, not 0.13.0. **Nothing in this release was tested on the dev server.** The checks ran in node with a fake api, in shell tests, and in the build. No screenshot was taken.

**Install Core 1.17.52 before this UI.** The Core requirement is raised, so the UI will not install on an older Core.

## What changes for you

- **Date fields in a filter.** When a module list declares a date field (for example "Last seen"), the person gets the operators Core sends for it. A single day uses the browser's date box. Between uses two date boxes, From and To. "In the last" and "Not in the last" use an amount and a unit (minutes, hours or days, as Core lists them), starting on days.
- **Number fields in a filter.** The person types a number. A field that takes whole numbers steps by 1. A field with a minimum or maximum shows both limits. Between uses two number boxes. Zero and negative numbers are good values.
- **Clear refusals.** If a day is not real (30 February), outside 1970 to 2100, a number is too big, a decimal is typed into a whole-number field, or From comes after To, the editor says so in one sentence that names the field and the limit. Apply stays off until every rule is complete.
- **Help text under the rule.** For day rules the editor says that days are UTC days: "17 October" means 17 October 00:00 to 24:00 UTC, not South African time. For every date and number rule it says that a row with no value never matches the rule, except the field's own "not equals" and (for dates) "not in the last" operators. Those names are quoted from what Core sends.
- **Saved sets with date and number rules are drawn back as they were saved**, including a number of 0 or a negative number.
- **Changing the list no longer shows the old list's saved filters.** If the view key changes while the saved sets are still loading, the old answer is dropped and the old request is stopped. A person can no longer pick a set from the previous list and apply it to the new one.

## For module authors

- **No module may declare a date or number field before this release is installed.** An older editor drops a field kind it does not know, so the person would see no filter for it. Declare such a field only with `requires.framework` of `>=1.17.52`, and only after UI 0.12.117 is installed.
- The editor takes everything from Core's fields answer: each field's own `operators`, its `constraints` (`integer`, `minimum`, `maximum`) and the top-level `relative_units`. It never assumes an operator or a unit. If `relative_units` is missing, the two "in the last" operators are left out of date fields. An operator the editor cannot draw is left out of that field.
- What `apply` and `update:modelValue` send for these fields is exactly what Core validates: a day as `"2026-10-17"`, a range as `{ "from", "to" }`, a relative rule as `{ "amount": 7, "unit": "days" }`, and a number as a JSON number, never text. Full description: the "Date and number fields" section of `docs/module-filters.md`.
- **Docs wording fixed.** 0.12.116 said that a module was kept from reading other modules' filter data. That promised more than the editor does. The editor only ever uses your module's own id and has no module id prop. It is not a sandbox: the shared api helpers still reach Core's filter routes, and Core, not the editor, decides what the signed-in person may read for any module id. A guard in the transport was not added, because changing or deleting a set goes by its id and carries no module id, so a guard would be a partial boundary that looks complete. The 0.12.116 notes in `docs/releases/` carry the corrected sentence.
- **The surface is not yet in the export.** The newest export in `docs/contracts` is 1.17.50-0.12.115. It does not list `core.filter_sets` 1.1.0 or the new editor behaviour. Johan exports after installing Core 1.17.52 and this UI. No module mounts the editor yet, and Agents 0.13.0 declares text, id and bool fields only. Agents 0.14.0 (last seen and the pending-actions count) waits for this release to be installed and needs Core 1.17.52 to work. Nothing in `modules/` changes in this release.

## The test list

`npm test` was one line of 8043 characters, and npm on Windows stops a command at 8191. The whole list now lives in `tests/run-all.mjs` and `package.json` says `node tests/run-all.mjs`. The runner runs each entry in order from the package root, stops at the first failure, names it and exits with an error, and prints how many ran. **176 existing entries kept, 4 new.** One of the 176, the Core requirement test, is replaced by its 0.12.117 version (`tests/core-requirement-0.12.117.mjs`). A new test checks the list against the old script. From now on a new test is added to `tests/run-all.mjs`. Three older tests that read the old script now read the runner's list with the same checks.

## Check it worked

```bash
cd workspace/ui && npm test && npm run build
```

Both should finish without an error, and `npm test` ends with "All 180 test entries passed." On a dev server with Core 1.17.52, open a module list that declares a date field, pick "between", type two days, and check that Apply sends the two days. None of that was run for this release, because no module declares such a field yet.

## Left out, and why

- **The Shared choice, the withheld marker and the optional `scope_kind`.** They need Core 1.17.51, which Johan has not installed or exported. They wait for the release after that. Another person's saved set is still listed and applied by its id, but its rules are not drawn.
- **Scheduler event jobs panel** (request from Core 1.17.45). A separate feature, not part of the filter editor.
- **`correlationId` on `context.tacticalOperation`** (request from checks 0.16.1). Core must accept it on the browser route first.
- **Showing a module without a category as refused in production.** Johan has not named the release.
- **The installer refusal's suggested fix** (the 0.12.115 Low). Installer code, a separate fix.
- **UI 0.13.0.** Not requested.

The 0.12.116 notes moved to `docs/releases/`. Earlier notes are kept.
