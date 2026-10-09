# UI 0.12.90

Released 9 October 2026. Requires Core 1.17.12 or later.

## What changes for you

- **Enabling a replaced module asks twice.** Say a replacement is running and you enable the module it replaces. Modules now warns you first. It names the replacement that will be switched off, says it stays installed, and says the replaced module takes its routes and contracts back. You type the module id as before. Then a second step appears with a red warning, a checkbox ("I understand pm will be switched off") and a separate button ("Switch pm off and enable patching"). Only that button sends the second confirmation. Cancel at either step sends nothing.
- **Disabling a replacement tells you what comes back.** The disable dialog and the module panel say: "Disabling pm switches patching back on in the same job." There is no second confirmation for this direction. If Core refuses because the replaced module cannot come back, you see Core's own reason.
- **Job records show what moved.** Active jobs and the history record list "Switched off", "Switched on" and "Conflict resolved" modules once Core has filled them in.
- **If the list changed while you read it,** the dialog shows Core's fresh list. A new second-confirmation requirement moves you to the second step. A changed first list takes you back to the first step.
- **Older Cores.** A row without `second_confirmation_required` or `will_enable` behaves as in 0.12.89.

## For module authors

- **The tactical-operations path guard is stricter** (held Medium from the 0.12.89 review). `api`, `apiRaw`, `apiBlob` and `apiText` now remove tab, CR, LF, every other control character, zero-width characters and line separators before they check the path. Before, a path such as `/api/tfd/tac<tab>tical-operations/agents/list/` slipped past the check, because the browser's URL parser later removes the tab. The guard now also runs on any path that contained such a character or names `tfd`. It still refuses only another module's tactical-operations path. Paths without hidden characters behave exactly as before.
- Checked against `modules/`: Agents, Checks, Licensing and Reports Manager name their own id and keep working. No module calls `GET /api/tfd/modules/v2/` or `setModuleEnabled`, so the Modules page changes touch no module.

## Requirements

Core 1.17.12 or later. The package now requires `tec-tac-framework >=1.17.12,<2.0.0`. The second confirmation, `will_enable` and the job fields exist only from Core 1.17.12.

The Core 1.17.12 contract export is not yet refreshed in `docs/contracts`. Johan runs it once the dev server runs 1.17.12. This release is built to the Core 1.17.12 release notes and `contracts.py`.

## Under the hood

- `src/modules.js`: `setModuleEnabled(moduleId, enabled, cascade, disableReplaced, confirmSwitch)` adds `confirm_replacement_switch: true` only when `confirmSwitch === true`. Install never sends it.
- `src/module-replacement.js`: `secondConfirmationRequired`, `handBackEnableLines`, `secondConfirmationText`, `secondConfirmationRequiredPayload`, `willEnableIds`, `handBackDisableLines`, `jobSwitchLines`; `replacementSummary` adds a line for an enabled replacement with `will_enable`.
- `src/views/ModulesView.vue`: two-step enable dialog. Step one sends nothing; the second step's button sends `disable_replaced` and the confirmation together in one request.
- `src/module-loader.js`: one `stripJunk` helper feeds the mention check and `operationTargets`.
- Tests: `tests/module-replacement-handback-0.12.90.mjs`; hidden-character cases added to `tests/tactical-operation-binding-0.12.89.mjs`.

## Not in this release

- The Install dialog keeps its single confirmation. Core's notes give only the enable route a second flag.
- Disabling a replacement needs no confirmation (Core's assumption CQ36).
