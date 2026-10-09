# UI 0.12.89

Released 9 October 2026. Needs Core 1.17.11 or later.

## What changes for you

- **You are asked before a replacement switches a module off.** When enabling or installing a module would switch another module off (AD-20), Modules now says so first. It names each module. For example: "Enabling X will switch off Y. Y stays installed. X takes over its routes and contracts. You can switch Y back on later by disabling X first." Nothing is switched off until you confirm.
- **Install asks too.** After you inspect packages, Install shows the same notice, built from the plan. It says which package switches off which module. You confirm in a dialog before anything runs.
- **If the list changes while you read it,** we tell you in one sentence and ask again with the new list. If nothing needs switching off any more, you can confirm without a list.
- **Clearer replacement details.** A dependency that a replacement covers reads "met by X (it replaces Y)". If both modules were enabled, the panel says: "Both were enabled. Core kept Y and is switching X off." Two reason lines are corrected to match Core 1.17.11: a replacement is no longer blocked just because the other module is enabled, and a replaced module can be a core or a server module.
- **The Stable release row stays after you save an update source.** Switching from the stable release to a branch no longer hides the last known stable release. If the follow-up check fails, the row still shows, marked "not refreshed".
- **Older Cores.** When Core sends no `will_disable` list, nothing changes. The requests are exactly as before.

## For module authors

- **The `tacticalOperation` boundary is tighter.** The shell now takes one snapshot of every module's replaced id before any `register()` runs. A module that registers earlier can no longer change a later module's replaced id by editing its descriptor or the shared `module_status` row.
- **`api`, `apiRaw`, `apiBlob` and `apiText` are scoped for tactical-operations paths.** The copies your module receives refuse a path to `/api/tfd/tactical-operations/<id>/...` when the id is not your own or the one you replace. The check decodes the path, resolves dot segments and ignores case, so encoded, double-encoded, upper-case and `../` forms are refused too. The refusal has `status` 0, `payload` null and `code` null, as for `tacticalOperation`. Every other path passes through unchanged, with the same arguments and return value.
- **What this guard is, and is not.** It stops a module using the shared helpers to name another module. It is not a sandbox against a module that calls `fetch` itself. Core's own permission, scope and honoured-replacement checks stay the authority.
- Checked against `modules/`: Agents, Reports Manager and Checks pass their own id, so they keep working. Every other module's paths are untouched. Public modules (`registerPublic`) are unchanged.
- `docs/module-runtime-api.md` says all of this.

## Requirements

Core 1.17.11 or later. The package now requires `tec-tac-framework >=1.17.11,<2.0.0` (UI Q16 in `reviews/questions/ui.md`). That covers the earlier open questions Q13 and Q15, which asked the same thing.

## Under the hood

- `src/module-loader.js`: `replacedSnapshot` frozen map, `guardTacticalOperationPath`, per-module transport wrappers. The shared helper built in `main.js` keeps the unwrapped `apiRaw`.
- `src/module-replacement.js` (import-free): `willDisableIds`, `replacementConfirmLines`, `installConfirmSummary`, `confirmationRequired`, `replacementListChangedText`, `satisfiedByLine`, `conflictLine`.
- `src/modules.js`: `setModuleEnabled` and `installModuleArtifact` take an optional `disableReplaced` list and send `disable_replaced` only when it is not empty.
- `src/views/SystemUpdatesView.vue`: no longer clears `cachedStable` on Save; keeps the cached row for any source type.
- Tests: `tests/tactical-operation-binding-0.12.89.mjs`, `tests/module-replacement-confirm-0.12.89.mjs`, `tests/stable-release-cached-0.12.89.mjs`. Updated: `module-replacement-status-0.12.88.mjs` (requirement), `stable-release-not-refreshed-0.12.87.mjs` (no clearing line).
