# UI 0.12.116

Date: 17 October 2026. Requires Core 1.17.50 or later (raised from 1.17.49, the newest signed Core on dev). This release adds the shared filter editor for module lists. It is a patch release, not 0.13.0. **Nothing in this release was tested on the dev server.** The checks ran in node with a fake api, in shell tests, and in the build. No screenshot was taken.

## What changes for you

- **One filter editor for every module list.** A module page can now mount `context.components.FilterEditor`. The person picks a field, how to compare it, and a value. Rules group with Match ALL or ANY, and groups nest three levels deep. Every field, operator and value list comes from Core, so the editor works the same in every module and never offers something Core would refuse.
- **Value pickers that search.** For Equals and Does not equal the person types to search Core's value list, 25 a page, with the next page loading as they scroll. A short fixed list filters on the spot. Contains, Starts with and the other text operators use a plain box. A yes or no field shows a Yes or No choice.
- **If the value list cannot load, the person can still type.** That picker turns into a plain box and says "The list of values could not load. Type the value instead." It does not read anything else.
- **Saved sets that only you can use.** The person can save the rules on screen under a name, rename the set, replace its rules, and delete it. Delete asks one plain Yes or No. A set saved here lists you as its only reader. If your user id is missing, Save is off and says to reload or sign in again.
- **Sets from other people are listed, not drawn.** A set shared with you shows a Shared badge and its owner's name. Choosing it applies it by its id. This release does not draw its rule values.
- **Core's refusals show as Core sent them.** The panel stays open and keeps what the person typed.
- **The docs say the 0.12.112 rows are in the export.** The export `tec-tac-public-contract 1.17.50-0.12.115` lists the dialogs, sign-in landing and row menu rows and the SearchSelect server mode. The docs for those rows now say so.

## For module authors

- `context.components` is now each module's own frozen object: the six members you already had (`SearchSelect`, `TagEditor`, `DataTable`, `FormRow`, `EditorWindow`, `Stepper`) are the same objects as before, plus `FilterEditor`. Nothing you use changes.
- `FilterEditor` is **bound to your module**. There is no module id prop, and the editor only ever uses your module's own id. This is not a sandbox: the shared api helpers still reach Core's filter routes, and Core, not the editor, decides what the signed-in person may read for any module id (corrected in 0.12.117). A replacement module gets its own filters, the same as `modulePreferences`.
- Props: `viewKey` (required), `modelValue`, `disabled`. Events: `update:modelValue` and `apply`. `apply` sends `{ definition, filterSetId }` with exactly one set. Both `null` means no filter: never send an empty definition, because Core matches nothing for a filter with no rules.
- `registerPublic` still gets no components. Full description: `docs/module-filters.md`.
- **The surface is not yet in the export.** Core lists it in the public contract export after its next export of Core and UI. A module adopts the editor at its own release. Endpoints and Groups already have requests for it. Nothing in `modules/` changes in this release.

## Check it worked

```bash
cd workspace/ui && npm test && npm run build
```

Both should finish without an error. On a dev server, open a module page that mounts the editor, add a rule, search for a value, save a set, reload and choose it. None of that was run for this release, and no module mounts the editor yet.

## Left out, and why

- **The Shared choice, its warning, and drawing other people's rule values.** On Core 1.17.50 a shared set shows every rule value to everyone it is shared with. Core 1.17.51 hides the values a reader may not see, but it is built and not yet signed. Johan asked to leave this until 1.17.51 is signed, installed and exported. The follow-up UI release raises the requirement to Core 1.17.51, adds the Shared choice with a plain warning that a set's name stays visible, draws a hidden rule as Core sent it, and shows another person's rules read-only.
- **Save as my copy, per-person reader lists, number and date operators.** Not asked for. Core's vocabulary has no range operators yet.
- **Levels of groups.** The top group counts as level 1, so a filter has the top group plus two nested levels. Core's limit of 3 is worded the same way in its docs. If Core counts the top group differently, the editor is stricter than Core, never looser.
- **Scheduler event jobs panel** (request from Core 1.17.45). A separate feature.
- **`correlationId` on `context.tacticalOperation`** (request from checks 0.16.1). It needs a Core change on the browser route first.
- **The held installer and README Lows from the 0.12.113-1 and 0.12.115 reviews.** Installer and README work, a fix round of its own.
- **The other "not yet in the export" sentences** (websocket, terminal, modulePreferences, the 0.12.111 and 0.12.114 components). The request names only the 0.12.112 rows.
- **Q64 (TagEditor `commaAdds` default).** Johan has not agreed to the recommendation. Not changed.
- **A test runner for the `test` script.** The script line is now about 8040 characters and Windows stops a command at 8191. This release adds its six tests as one entry, `tests/filter-editor-0.12.116.sh`. A later release should move the whole list into a runner file.
- **UI 0.13.0 and Core 1.18.0.** Johan holds them until the core modules are complete and tested.

The 0.12.115 notes moved to `docs/releases/`. Earlier notes are kept.
