# UI 0.12.94

Date: 11 October 2026. Requires Core 1.17.17 or later (no change to the Core requirement).

## What changes for you

- **Drop several packages at once.** Each package pairs with the `.sig` and `.release.json` that share its file name. A browser copy such as `agents-0.5.0(1).zip` still pairs with its files. Before, the page refused a second signature or release file and you had to add one package at a time.
- **Unsigned packages still go together.** They are checked as one batch, so they share one dependency plan, as before.
- **Each signed package is checked on its own.** Core takes one signature per request today, so a signed package and its files are checked together, and the next signed package follows. The sets install one after another. The page reloads once, after the last set is in.
- **A failed set does not stop the others.** The set that failed shows its own message and stays in the file list. The sets that passed stay staged. If an install fails part way, the sets that have not started stay staged, and the page names them. The sets that already installed stay installed. Reload Tec-Tac after a partial install to load them.
- **Problems show next to the set that causes them.** A package with only a `.sig` or only a `.release.json` shows "Needs both the .sig and the .release.json". A file with no package shows "No package for this signature / release file". Duplicate names are flagged. Inspect waits until every set is clean.
- **Packages that depend on each other in one drop are refused for now.** Core checks each signed set against the modules already installed, not against the other sets in the same drop. A package that needs another package from the same drop is refused until Core accepts one batch with a signature per package (request filed in `reviews/requests/core.md`).
- **Discard removes every staged package.** Cancel / discard now releases every upload in the staged group, not only the first.
- **Header popups are no longer covered by page content.** The Alerts list, and any other popup inside the top bar, now draws above sticky page bars. Dialogs, drawers and the help panel still open above the top bar.

## For module developers

- No API change. Header contributions render in the shell's top bar layer, above page content and below shell dialogs. `docs/module-header.md` says so.

## For the maintainer

- `src/module-intake.js` (new): `pairIntakeFiles(files)` returns `{ sets, problems }`. Each set has `key`, `label`, `pkg`, `sig`, `meta` and `problems`. The pairing key lower-cases the name and drops every `(n)` copy marker. `orderGroupsByDependency(groups)` orders staged groups, and keeps upload order on a cycle. `pairingInfo(file)` classifies one file.
- `src/modules.js`: `inspectIntakeSets(sets, post)` sends the unsigned sets in one request and each signed set in its own request, one at a time. It returns one `{ set, staged }` or `{ set, error }` per set. `inspectModulePackages` and `inspectModuleHotfix` are unchanged.
- `src/views/ModulesView.vue`: the composite view is `{ composite: true, groups, plan }`. Each group keeps its own payload, and each row carries its own trust (`intake_trust`, `intake_trust_label`, `intake_trust_class`). A single package or an unsigned batch still uses the old single path. `poll()` starts the next group before it calls `scheduleReload()`, and `clearStaged()` discards every upload. Moves across set boundaries are refused.
- `src/styles.css`: `.topbar` gets `position: relative; z-index: 100`. The page's sticky layers use 6 to 80, and the shell's dialogs, drawers and toasts use 920 and above.
- `src/views/ModulesView.vue` `intakeFileType` and its regexes are unchanged.
- Known gaps: the file list drops `x.tar(1).gz`, because `intakeFileType` does not accept the copy marker before `.gz`. The pairing helper does handle it. The z-order is checked by the CSS test and by reading the rules; no browser check was run.
- Tests: `tests/module-intake-sets-0.12.94.mjs`, `tests/topbar-stacking-0.12.94.mjs`. Both are appended to the `test` script.
- `RELEASE_NOTES_0.12.93.md` moved to `docs/releases/`, as earlier releases were.
- Pinned tests updated, behaviour unchanged: `tests/foundation.sh` checks the per-row trust names (`intake_trust`, `row.intake_trust_label`); `tests/module-replacement-confirm-0.12.89.mjs` checks the install call's shape (group upload, order, confirmed list); `tests/tactical-scope-context-0.12.93.mjs` accepts 0.12.93 or any later patch. `package-lock.json` root version is 0.12.94.
- `stagedHash` is kept only for the foundation SHA guard. The rows read `intake_sha256`.
- Questions for Johan (Q19, Q20) are in `reviews/questions/ui.md`.
