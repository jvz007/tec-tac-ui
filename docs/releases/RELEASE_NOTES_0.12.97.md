# UI 0.12.97

Date: 13 October 2026. Requires Core 1.17.23 or later (raised from 1.17.22).

## What changes for you

- **The endpoint window opens again.** Opening an endpoint in its own window showed "This page cannot open in its own window." Now it opens the endpoint, with or without an agent id in the address. The cause was in the shell: it refused a route path that contained the `?` of an optional part (`/endpoints/:agentId?`), so no window address was ever built. Take Control and Remote Background were not affected.
- **Sign-in set-up reads as a step, not an error.** The first time you sign in, or after a two-factor reset, the page that asks for your password again now says "Set up two-factor sign-in. Enter your password again to show your authenticator code." It no longer looks like a warning. The button reads "Show my authenticator code". The rule has not changed: you enter your password again before the code and QR image appear. After the code appears, the page tells you the name your authenticator lists the account as.
- **My Account explains the reset.** The Reset two-factor card says it signs out every session, that you set up two-factor again at your next sign-in, and which name your authenticator will show.
- **System name.** System Configuration has a new System name card. It is the name an authenticator app shows beside your account (default Tec-Tac). A superuser, or a role with the `core.runtime_settings.manage` permission, can save a new name or reset it to the default. Core checks it: 1 to 60 characters, no colon, no hidden characters. If Core refuses, you see its message as sent. People who already set up two-factor keep their entry. Only a new set-up shows the new name. The sign-in screen no longer builds that name from the server address.
- **Custom fields in Add client and Add site.** Both dialogs now read the custom-field definitions when they open and show the fields, filled with each default. The values go in the same request that creates the client or site. The extra **Edit fields** step after creating is gone. The **Fields** buttons on existing clients and sites stay. While the fields load, Save waits. If the read fails (for example you lack permission), the dialog shows Core's message and a **Retry** button, and Save stays off. We never create a client without the form Core asked for. This is Johan's call to confirm (Q30).
- **Role form: Retry.** If the Clients & sites list on the role form fails to load, the tab shows Core's message with a Retry button. Opening the tab again also tries again. Before, a failed read was not retried until you reloaded the page.

## What stays as it was

- Permissions, scope and audit do not change. Hiding or showing a button is never authorisation. Core and Tactical decide every call.
- Take Control and Remote Background windows load exactly what they loaded before.
- Your own custom-field values on existing rows are edited the same way as before.

## What you do not get yet

- The endpoint window shows the tabs other modules add (Checks, Alerts, Tasks and so on) only after Endpoints ships its next release. This UI half is ready and does nothing until then.
- Right-click menus on Clients & sites, the session theme choice, End all sessions for all users, the popup and table layout, API keys and the SSO admin page are not in this release.
- Modules keep their own confirmation dialogs until each adopts the shell dialog.

## For module developers

- **Popup route paths may use an optional parameter.** `/endpoints/:agentId?` now gets its popup alias. Any other `?`, `#`, whitespace, `..`, a backslash, control and zero-width characters still give no alias. The route's `beforeEnter` permission guard and the reserved `/popup/` prefix are unchanged.
- **A route that asks for a popup and cannot get one now warns** in the browser console (module id, path and reason). In a popup window, a hash that still lands on the pending page, or an owner module that did not load, also warns, with the hash, module id, parsed path and the registered popup aliases.
- **`meta.popupPublishers`** is new. `true` loads every other enabled module the person may use that has an authenticated entry. An array of module ids loads just those. The shell loads the owner and its hard dependencies, reads the flag from the matched route, loads the extra set (each with its own hard dependencies first), and only then replays the popup address, so the page mounts with every tab registered. The extra modules get no popup alias, keep every loader guard, and a failure in one never refuses the popup. Routes without the flag load exactly what they loaded before. Each extra module is one more bundle request, so leave it off when you do not need it. Endpoints is expected to set it in its next release.
- **`forModule(moduleId, { isAbandoned })` for context actions.** A context action handler's `context.confirm` is now refused (it rejects) after the owning module was abandoned by a failed or timed-out `register()`. A working module sees no change.
- **`context.system_name`** (string or `null`) is in the runtime context. Display only.
- **`createResourceSite` and `createResourceClient`** send a `custom_fields` row only when `field_id` is a positive whole number. Core 1.17.23 refuses anything else with 400.
- Details: `docs/module-runtime-api.md` ("Popup mode", "System name"), `docs/context-actions.md`.

## Also in this release

- UI design standards section 8.1 now describes the Yes or No dialog from AD-27: one plain question through `context.confirm`, no typed text, and the four system-breaking actions (Restore a backup, Purge storage, Delete a client or a site, the hand-back step on Modules) keep their stricter confirmation. This closes the Medium finding of the 0.12.96 review, which pointed at the old typed-confirmation wording.

## For the maintainer

- New files: `src/components/CustomFieldInputs.vue` (one input list for the Add dialogs and the Edit fields dialog).
- `src/popup-mode.js`: `popupRoutePathProblem` (one route-path rule, also repeated in `src/module-loader.js`, which cannot import), `popupMissDetails`, `popupPublishersChoice`, `popupPublisherSet`. `src/main.js` runs two load phases in a popup. Both reuse one runtime object and the same `moduleIsAllowed` gate.
- `src/api.js`: `listResourceCustomFieldDefinitions(type)` (`GET /api/tfd/resources/custom-fields/?resource_type=client|site`, refuses any other type before a request) and a colon-free `tecTacTotpIssuer({ answer, context })` (answer issuer, then context system name, then Tec-Tac). `setupTacticalTotp` still sends `ui_url` for older Cores.
- `src/runtime-settings.js`: system name read, validate, save and reset. `src/runtime-context.js` carries `system_name`.
- A create dialog does not send a custom field that is empty (no value, empty text, empty selection). An unticked checkbox and a number of 0 are values and are sent.
- Tests added: `popup-optional-param`, `popup-publishers`, `signin-setup-wording`, `system-name`, `resource-create-custom-fields`, `ui-design-standards-8-1`, `roles-scope-retry`, `context-action-confirm-abandoned` (all `-0.12.97.mjs`), in the `test` script. `resource-create-fields-0.12.96.mjs` now asserts the Edit fields notice and its sentence are gone. The Core requirement pins in earlier tests moved to 1.17.23. `RELEASE_NOTES_0.12.96.md` moved to `docs/releases/`.

## Checks and gaps

- Results of `npm test` and `npm run build` are in the commit report.
- Nothing was run in a browser. The popup fix is tested with the real vue-router and the real loader. The dialogs and cards are covered by unit and source checks, not by a mounted page.
- The popup publishers need a signed Endpoints release that sets the flag before anyone sees the extra tabs.
