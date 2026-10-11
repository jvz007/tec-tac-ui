# UI 0.12.95

Date: 11 October 2026. Requires Core 1.17.20 or later (raised from 1.17.17).

## What changes for you

- **Drop several packages at once, and they go in one request.** Every package that passes its checks goes to Core together, with its own `.sig` and `.release.json`. Core checks each package with its own signature, plans the installs for all of them at once, and stages them as one batch. Packages that need each other install in the right order. Before, each signed package waited for its own request, and the sets installed one after another.
- **A release file that does not match its package is caught before anything is sent.** A browser can rename a copy to `agents-0.5.0 (1).zip`. The release file still names `agents-0.5.0.zip`, so the page marks that package with a plain message: rename the file back and add it again. The other packages in the drop still go ahead. A release file that is not valid JSON, or is too large to be one, is marked the same way.
- **Every package in a batch shows its own trust.** Before, an unsigned batch showed "NOT REPORTED" for every row. Each signed package keeps its SIGNED badge, each unsigned package shows UNSIGNED, and a bundle's modules show the trust of the bundle they came from.
- **Install and Cancel / discard wait for the install request.** A second click on Install no longer sends a second install. Discard cannot remove the upload an install is still using. The buttons come back as soon as the request answers.
- **A cancelled chained confirmation keeps the reload hint.** If an earlier set has already installed and you cancel the question for a later set, the page still says to reload Tec-Tac, and names the sets that did not run. Cancelling the first set's question shows nothing, as before.
- **Popup window for a module page (new).** A module can open one of its pages in its own window with no Tec-Tac chrome, at `/tec-tac/#/popup/<module>/<route>`. The window loads only that module and its hard dependencies. It shows no brand bar, top bar, navigation, notices, help or dashboard. It keeps the notification toasts, the unsaved-changes prompt, the theme and text size, and the session. A window that cannot open shows a plain message. Modules opt in with `meta: { popup: true }` and `context.popupHref(path)`. The module that opens the window still calls `window.open` itself.

## What you do not get yet

- Take Control and Remote Background still open their own windows and load every module. They adopt the popup window in their own releases.
- Several earlier requests stay open: the header popover layer, the navigation gate by Tactical flag, the shell confirm dialog for context actions, and the background job follow.

## For module developers

- `context.popupHref(path)` returns the popup address for one of your routes, or `''` when the path cannot be built safely. It always names your own module. It needs UI 0.12.95 and no Core change.
- A route opens in a popup only when it declares `meta: { popup: true }`. It may also declare `permission` or `permissions` (Tec-Tac codes). Without the code the person sees a refusal before your page renders.
- Hard dependencies in `tec_tac.json` now reach `modules.json` as `dependencies`, through `scripts/sync-modules.sh`. A popup loads them with your module. Optional dependencies are not loaded: check `modules.isActive(id)`.
- Full details are in `docs/module-runtime-api.md`, section "Popup mode".

## For the maintainer

- `src/popup-mode.js` (new, pure): `parsePopupHash`, `popupHref`, `popupAliasPath`, `popupModuleSet` (owner and hard dependencies, dependencies first, with a cycle cut and a depth guard), `popupRoutePermitted`.
- `src/views/PopupPendingView.vue` (new): the loading state and the refusal. Registered in `src/router.js` before the core catch-all.
- `src/main.js`: reads the popup hash before mounting. In popup mode it skips the public modules, loads only the popup set, and refuses a popup whose module did not load or whose route is missing. `popupHref` and `popupMode` join the runtime.
- `src/module-loader.js`: the guarded module router adds `/popup/<id><path>` as an alias, and a permission guard, only for the owning module's routes with `meta.popup === true`. Outside popup mode nothing changes. `bindPopupHref` binds the helper to the module. The file still has no relative imports.
- `src/App.vue`: `popupLayout` hides the chrome, the notice and help drawers and the quick actions. Notice polling does not start in a popup. `src/state.js` gets `popup`.
- `src/styles.css`: the `.popup-shell` block, on existing tokens.
- `scripts/sync-modules.sh`: writes `dependencies` (hard dependency ids) into each descriptor.
- `src/modules.js`: `inspectModulePackages(files)` sends every file in one request: `packages`, `signatures` and `metadata_files` as repeated fields. The old single `signature` and `metadata` fields are not sent by intake. `inspectIntakeSets(sets, post)` sends every clean set in one request. A failed request marks every sent set with Core's message and sends nothing else. There is no per-set retry. `inspectModuleHotfix` is unchanged.
- `src/module-intake.js`: `checkIntakeMetadata(sets, readText)` checks each release file against its package and signature before sending. It reads each file with a size cap.
- `src/views/ModulesView.vue`: `stagedRowsOf` reads each row's trust from the row, or from the artifact it came from (`source_upload_id`). The `installing` flag guards Install, the confirmation and discard. `installConfirm.partial` carries the reload hint through a cancel or a failed confirmed install. A single group that is a batch is labelled "Multiple packages". The composite and chained install code is still here, unused by intake (see `reviews/questions/ui.md`, Q21).
- Pinned tests updated: `tests/module-intake-sets-0.12.94.mjs` (one request now), `tests/ui-hygiene-0.12.45.mjs` (several signatures no longer refused for normal intake), `tests/foundation.sh` (the new field names and `trustFieldsOf`), and the requirement pins in `tests/*.mjs` (1.17.20).
- New tests, appended to the `test` script: `tests/popup-mode-0.12.95.mjs`, `tests/module-intake-batch-0.12.95.mjs`, `tests/module-install-guard-0.12.95.mjs`.
- `RELEASE_NOTES_0.12.94.md` moved to `docs/releases/`, as earlier releases were. `package-lock.json` root version is 0.12.95.

## Checks and gaps

- `npm test` runs the whole chain. `python3` must resolve for `tests/foundation.sh`; on this PC a shim outside the repo was used for the run.
- The popup boot is covered by unit tests with a fake router and fake module entries. No browser run was made, so the boot cost and the real window behaviour are not measured. Expect the popup to load its own bundle and its dependencies, not the whole shell.
- A route's own permission is known only after the module has registered it. A person who may not open that route still loads the owning module's bundle, but sees the refusal and no page.
- The install guard is covered by running the real install functions against stubs. The modules view was not mounted in a browser.
