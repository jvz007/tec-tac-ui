# UI 0.12.86

Released 9 October 2026. Needs Core 1.17.5 or later.

## What changes for you

- **Only a superuser sees the update-source controls.** The Source and Branch form, the Save button and the Use stable release button now show for superusers only. If you are not a superuser, you still see where updates come from, with the line "Only a superuser can change the update source."
- **Core enforces the same rule.** Core 1.17.5 refuses the save for anyone else. Hiding the controls is a convenience, not the protection.
- **Nothing else moves.** Check for updates, Stage, Install and the one-off Advanced source stay with the privileged operations permission. System Configuration and its time-limit form stay with the runtime settings permission.
- **The stable release row is more accurate after you switch branches.** After you save a move from one branch to another, the row under the new branch no longer shows the old branch's lookup error or STALE pill.

## Requirements

Core 1.17.5 or later. The package now requires `tec-tac-framework >=1.17.5,<2.0.0`.

## For module authors

No registry, runtime helper or `api()` behaviour changes. No module is affected: nothing under `modules/` uses the System Updates routes.

## Under the hood

- New helper `canChangeUpdateSource()` in `src/runtime-settings.js`. `canEditRuntimeSettings()` is unchanged.
- `stableRelease()` uses an online result only when it is for the saved branch, the same guard as `discoveredVersion()`.

## Tests

New: `update-source-superuser-0.12.86.mjs` and `stable-release-branch-switch-0.12.86.mjs`. Amended: `update-source-0.12.82.mjs` (the view now uses the new helper) and `stable-release-0.12.85.mjs` (version-independent metadata checks).
