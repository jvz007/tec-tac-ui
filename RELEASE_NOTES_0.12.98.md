# UI 0.12.98

Date: 13 October 2026. Requires Core 1.17.24 or later (raised from 1.17.23).

## What changes for you

- **Move a site to another client.** Edit site now has a **Move to client** control. The current client is selected, and you can search for another one with **Find client to move to**. The list holds only clients you can already see. Save sends the move and any rename together, and only the parts that changed. If nothing changed, the dialog closes and nothing is sent. The notice says **Site moved to <client>.** or **Site updated.**
- **Core's messages stay in the dialog.** If Core refuses the move, its message shows inside the Edit site dialog, and the dialog stays open. For example, "A client must retain at least one site." or "A site with that name already exists for the selected client." A "not found" answer means you cannot move to that client. Pick another one. Editing the client or the name clears the message. Add site still shows its messages on the page, as before.
- **System name is for a superuser.** Only a superuser can save or reset the system name, because Core now refuses anyone else. Everyone else sees the current name, the default and the length rule, and the line "Only a superuser can change the system name." The upload limit and the module start-up time limit keep their rules.
- **End all sessions for every user.** Login sessions has a red **End all sessions** button for a superuser. It asks one question: "End every login session for every user? Everyone is signed out, you included. You will need to sign in again." Yes ends every session, including yours. Your browser then signs you out and reloads the page. If Core refuses, its message shows on the page and the list stays. The per-session and per-user **Revoke** buttons are unchanged.
- **The header theme is for this session.** Choosing a theme in the header changes the look at once and stays after a page refresh. It is not saved to your profile, so your saved theme does not change. Press **Save preferences** to keep a theme. That save also ends the header choice. **Reset all** ends it too. If Core cannot keep the header choice, it still applies on the page you are on, and nothing is saved.
- **The theme label on Preferences says when it is saved.** The Theme select reads **Theme (saved when you press Save preferences)** and starts at the theme you see.
- **Add client and Add site never wait for the custom fields.** If the custom-field list cannot be loaded, you see one line: "Custom fields could not be loaded. You can add them after, with the Fields button on the row." with a **Retry** button. You can still create the client or site. It is created without custom fields. You can add them afterwards with the **Fields** button on the row. If the list loads and is empty, the create runs as normal.
- **Signing out clears the shared browser cache.** Sign-out and an expired session now also clear the browser's cached theme, text size and menu state. The next person who signs in on the same browser does not inherit them. Your own menu layout is kept for you.

## What stays as it was

- Permissions, scope and audit do not change. A hidden button is never the authority. Core and Tactical decide every call.
- Your saved theme, text size, menu layout and Favorites are saved as before.
- Your own custom-field values on existing rows are edited the same way as before.

## What you do not get yet

- Right-click menus on Clients & sites (CO23, CK10), table style and dialog tabs, and the popup layout for long forms (CO10, EP19) are not in this release.
- Policy fields on Edit client and Edit site wait for Automation. Core stores them; the pickers come with the Automation module.
- End all sessions for every user does not offer a choice about your own session. Johan's answer (CQ76) is that it always ends yours too.

## Assumptions made in this release

- **Save writes the theme you see.** When you press Save on the Preferences page, the theme in the select (the one in effect) is saved. This is the reading of the request, not a separate decision.
- **The custom-field wording names the Fields button.** Johan's wording said "in Edit". On Clients and sites, the custom fields are changed with the **Fields** button on the row, so the message says that.

## For module developers

- Nothing changes for modules. No contract, route or registry changed in this release.
- `register(context).context.session_theme` is new and read-only: `dark`, `light`, `high-contrast` or `null`. It is additive. Modules may read it for display and must not write it.
- Details: `docs/module-runtime-api.md` ("Session theme", "System name") and `docs/user-preferences.md` ("Session theme").

## For the maintainer

- `src/runtime-settings.js`: a stray NUL and other control bytes sat in the invisible-character pattern, so grep and git treated the file as binary. The pattern now uses escape sequences that match the same characters. Behaviour is unchanged. Added `canEditSystemName(context)`.
- `src/components/RuntimeSettingsCard.vue`: the name form follows `canEditSystemName`. The register time limit form still follows `canEditRuntimeSettings`.
- `src/access.js`: `revokeAllLoginSessions(reason)` posts to `/api/tfd/access/sessions/revoke-all/` with `include_current: true`. `src/admin-session-state.js`: `revokeAllSessionsPrompt()`. `src/components/access/AdminSessionsPanel.vue`: the button and `revokeEverything`.
- `src/preferences.js`: `sessionTheme` in `preferenceState`, `effectiveTheme()`, `setSessionTheme()` and `clearSessionTheme()`. `initializeUserPreferences` reads `context.session_theme`. The autosave and the legacy cache keep writing the saved theme only. `src/App.vue` uses the effective theme for the header; `src/views/PreferencesView.vue` clears the session theme on Save and Reset all.
- `src/api.js`: `clearTacticalSession()` also removes `tec_tac_theme`, `tec_tac_font_scale`, `tec_tac_nav_rail_collapsed` and `tec_tac_nav_sections`. The per-user `tec_tac_nav_preferences:<user>` key stays. `updateResourceSite(id, { clientId, name })` sends only the keys given.
- `src/runtime-context.js`: `session_theme` in the empty and normalised context, and `normalizeSessionTheme`.
- `src/views/ResourcesView.vue`: `saveSiteEdit` (move, rename, dialog-level refusal), and `createFieldsPending` removed. `src/components/CustomFieldInputs.vue`: the `error` prop is gone; the error state shows the fixed line and Retry.
- `RELEASE_NOTES_0.12.97.md` moved to `docs/releases/`, as earlier releases were, so the continuous archive check passes.
- `package-lock.json`: the version fields follow `VERSION`, as the lockfile check requires.
- Core range pins in earlier tests moved to `>=1.17.24,<2.0.0`. `tests/api-contract-routes-0.12.58-1.mjs` lists `/api/tfd/access/sessions/revoke-all/` and `/api/tfd/session/theme/` as added in Core 1.17.24.
- Tests added, all `-0.12.98.mjs`, in the `test` script: `site-move`, `system-name-superuser`, `revoke-all-sessions`, `session-theme`, `resource-create-never-blocked`. `system-name-0.12.97.mjs` and `resource-create-custom-fields-0.12.97.mjs` were updated for the two changes above.
- `reviews/questions/ui.md`: Q30 is removed (superseded by Johan's message of 13 October 2026). `reviews/requests/ui.md`: the entries that ship here are removed, and UI 0.12.98 is in the shipped list.

## Checks and gaps

- `npm test` ran to the end with exit code 0. A local `python3` shim pointed at the project's `.venv` Python was used, because the Windows `python3` alias is not installed. The shim is outside the repository.
- `npm run build` was not run. The request for this run said not to build; the build belongs to the release step.
- The changed Vue files were compiled with the Vue SFC compiler. This is not a browser check.
- Nothing was run in a browser. The Edit site save and the session-theme logic are tested with stubs and with the real source. The dialogs and the Login sessions button are checked by source.
