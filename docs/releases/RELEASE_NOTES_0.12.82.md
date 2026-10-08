# UI 0.12.82

Released 8 October 2026. Requires Core 1.17.2 or later. Against an older Core the shell still works. System Updates then behaves as before: no remembered source, and Download always asks for the release.

## What changes for you

- System Updates remembers where each component updates from. Pick Release or a branch such as `dev`, press Save, and the page shows that source the next time it opens. No unlock needed.
- Check for updates and Download & inspect use the saved source. For a branch, the page shows the branch head (short commit and date) next to the installed commit.
- A change you have not saved blocks both buttons, so you cannot download from a source you did not mean to use.
- Superusers, and holders of `core.privileged_operations` or `core.runtime_settings.manage`, now see the edit forms for the module start-up limit (Modules) and the update source. The backend still decides who can save.
- The Tec-Tac pages served through nginx send `X-Content-Type-Options: nosniff` again (details below).

### Reading the branch comparison

- SAME: the installed commit is the branch head.
- DIFFERS: the commits differ. This does not mean the branch is newer.
- UNKNOWN: the component has not been installed yet with Core 1.17.2 or later. Stage and install once, and the comparison works from then on.

### One known gap

In Core 1.17.2 the System Updates page, its status call, the online check and the branch list all need `core.privileged_operations`. A user who holds only `core.runtime_settings.manage` can edit the time limit on Modules, but cannot open the page that carries the update-source control. We have not worked around this. The question is with Johan (`reviews/questions/ui.md`).

## For module authors

No module API changes. Two items tighten what a module can reach, and one item closes a documentation gap.

- **`removeNavigation` no longer reaches modules.** It was handed to every module in `register(context)` by accident in 0.12.81. The contract lists only `addNavigation`, and no module under `modules/*/package/extensions/*/ui` uses `removeNavigation`. Core still removes the navigation of a module whose `register()` fails or times out. The context still carries the other Core members (`app`, `state` and the api helpers). Narrowing that is a separate, larger change.
- **Hidden when denied is now tested everywhere.** 0.12.81 said denied entries are hidden. That was true in the code, but the test covered only context actions, interactions and quick actions. It now also covers resource views, header items (every code must be held, and nothing shows without a backend context) and dashboard widgets (`list()`, `snapshot()` and `get(id)`). No source change was needed.
- **`docs/module-runtime-api.md` now documents** the module router (guarded `addRoute`, `meta.dynamicModule`, removers, the abandoned rule), `hasPermission(code)` and `codeEditor.languages`. A test keeps the language list in the doc equal to `src/code-editor.js`. The Core 1.17.2 contract rows point to these sections.

## Fixed from the 0.12.81 review

- **nosniff dropped by the CSP header (Medium).** nginx only inherits a server-level `add_header` into a location that has none. Tactical's frontend server block sets `nosniff`, so the 0.12.81 `add_header` lines in the Tec-Tac locations hid it. `scripts/repair-nginx.sh` now repeats `add_header X-Content-Type-Options nosniff always;` in `/tec-tac/index.html`, `/tec-tac/modules/modules.json` and `/tec-tac/`, in every CSP mode, including `TEC_TAC_CSP_MODE=off` and when no CSP line is written. The `modules.json` location had already lost it before 0.12.81 because of its `Cache-Control` headers. The two locations that only `return` have no `add_header` and keep inheriting. `tec-tac-csp.sh` is unchanged.
- **`removeNavigation` leaked to every module (Medium).** See above.
- **Hidden-when-denied test gap (Low).** See above.

## Details

- New `src/update-source.js` (`getUpdateSource`, `saveUpdateSource`, `normalizeUpdateSources`, `validateBranchName`, `sourceDraftState`, `branchComparison`, `describeUpdateSource`). It calls `apiFetch` only.
- `stageOnlineSystemUpdate(component, sourceType = null, ref = null)` sends only the component when no source is given, so Core stages the saved source. An explicit source still wins.
- The branch list loads without the Advanced unlock. If it fails (403 or offline), a text box validated by the same rule as Core takes over. A saved branch that is missing from the list stays selectable and is flagged.
- Advanced source stays, as a one-off: stage a different branch once, not saved.
- The release cache is never shown as a finished branch check. The branch block waits for the online check of the saved branch.
- `tec_tac_package.json` requires `tec-tac-framework` `>=1.17.2,<2.0.0`.
- New fixture `tests/fixtures/core-http-routes-1.17.2.json`: the 1.15.168 list plus the four routes `urls.py` in Core 1.17.2 adds (`saved-views`, `saved-views/<id>`, `system/runtime-settings/`, `system/update-source/`). Taken by reading `repos/core` only.
- 0.12.81 release notes moved to `docs/releases/`.

## What could not run

- `nginx -t` and a live header check. No nginx on this PC. After install on the dev server, please run `curl -I` against `/tec-tac/index.html`, `/tec-tac/modules/modules.json` and one `/tec-tac/assets/*.js`, and confirm `X-Content-Type-Options: nosniff` (plus the Content-Security-Policy on the first and last).
- A real browser mount of System Updates. There is no DOM here, so the view is covered by helper tests, source assertions and a compile of the component. After install, save `dev` for the UI, reload, and confirm `BRANCH dev` is still shown.
- `tests/release-integrity.sh` needs `python3`, which does not start on this Windows PC.
- `npm run build` was not run in this step.
