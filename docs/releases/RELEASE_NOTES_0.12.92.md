# UI 0.12.92

Released 10 October 2026. Requires Core 1.17.15 or later.

## What changes for you

- **A warning before you disable or uninstall a replacement that cannot hand its module back.** Some modules replace a core module (for example, an advanced patching module replaces Windows Patching). If you switch the replacement off, or uninstall it, the module it replaced may not be able to come back on its own. Tec-Tac now shows a warning first. It says which module will stay off, why it cannot come back, and which module it needs. Choose **Disable … and leave … off** or **Uninstall … and leave … off** to go ahead, or **Cancel** to change nothing. Nothing is queued until you choose to go ahead.
- **The warning follows Core's answer.** If the list changes between the first request and your confirmation, the warning shows Core's current list and asks you again.
- **The second confirmation lists dependants.** When you enable a replaced module, Tec-Tac lists any enabled modules that name the replacement as a dependency, and asks you to check that they still work. Core does not switch them off.
- **Notices from Core appear as toasts.** When a module job fails, Core stores a notice for each superuser and for the person who started the job. Tec-Tac checks for new unread notices about every 30 seconds while you are signed in, and shows each new one as a toast. Notices that were already unread when the page first checked are not shown as toasts; they stay in the notice history. A toast can take up to 30 seconds to appear.
- **The upload limit is a setting.** System Configuration has a new **Tactical operation upload limit** section. It shows the current limit, the allowed range (1 to 25 MiB), the default (10 MiB by default) and who last changed the runtime settings. Only a superuser sees the form. A file is held to the smaller of this limit and the operation's own limit. A size limit in the web server (nginx) or in Tactical still applies first, so raising this setting does not change that limit.

## For module authors

- No public contract changes. The Core contracts your module uses are the same.
- `context.tacticalOperation`, `context.hasTacticalPermission` and the other runtime helpers are unchanged.

## Requirements

Core 1.17.15 or later. The package now requires `tec-tac-framework >=1.17.15,<2.0.0`. The hand-back warning, the uninstall warning and the upload limit exist only from Core 1.17.14 and 1.17.15.

## What is not built

- **The production gate** (showing a module with no category as refused). It waits for Johan to name the release.
- **The first request is sometimes refused before the warning appears.** When you disable a replacement and the list says a hand-back is needed, the warning comes before anything is sent. An uninstall has no such mark on the list, so its first request is always sent. Core refuses it and queues nothing, and then the warning appears.
- **Offering to install a missing module.** Core does not offer to install a replaced module that is missing. The warning only names the module it needs.

## Checked against earlier requests

- `hand_back_blocked` and `replacement_has_dependants` (Core 1.17.12 refusals, removed in Core 1.17.14): a search of `workspace/ui` (source, tests and docs) finds neither string. Non-replacement problems already show through the generic "module - type" line, so nothing needed removing. The request entry for these two strings closes with this release.

## Under the hood

- `src/module-replacement.js`: `handBackRequiredPayload`, `handBackWarning`, `handBackUnavailableRows`, `dependantsRows`, `dependantLines`. `secondConfirmationRequiredPayload` adds `dependants` only when Core sends some; its other fields are unchanged.
- `src/modules.js`: `setModuleEnabled` takes an optional sixth argument, `confirmWithoutHandBack`, sent only when it is exactly `true`. `removeModule` takes an optional second argument of the same kind. Without them the request bodies are unchanged.
- `src/views/ModulesView.vue`: the hand-back warning branch of the confirm dialog, the dependants lines in the second confirmation, and the resend with `confirm_without_hand_back`.
- `src/notifications.js`: `pollServerNotices`, `startServerNoticePolling` and `stopServerNoticePolling`. A notice the page stored itself is recorded by id and is not toasted again. A check waits while a notice is being stored.
- `src/App.vue`: starts and stops the notice check with the session, the same way activity tracking is wired.
- `src/runtime-settings.js` and `src/components/RuntimeSettingsCard.vue`: the upload limit section. The timeout section is unchanged.
- Tests: `tests/module-handback-warning-0.12.92.mjs`, `tests/notice-stream-toast-0.12.92.mjs`, `tests/upload-limit-setting-0.12.92.mjs`.
- Earlier tests that pinned the Core requirement now expect `>=1.17.15,<2.0.0` (six files). `tests/module-category-0.12.91.mjs` now checks that the three version files agree instead of pinning 0.12.91.
- `RELEASE_NOTES_0.12.91.md` moved to `docs/releases/`, as earlier releases were.

## Checks

- `npm test` passes (all suites, including the three new tests).
- `npm run build` passes. The large-chunk warning from Monaco was already there.
- The foundation suite calls `python3`. This PC's shell only finds the Windows Store alias, so the run used the project's own `.venv` Python through a shim outside the repository.
