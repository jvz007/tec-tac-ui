# UI 0.12.99

Date: 14 October 2026. Requires Core 1.17.25 or later (raised from 1.17.24).

## What changes for you

- **Right-click menus on Clients & sites.** Right-click a client row or a site row to open a menu. The menu key and Shift+F10 open it too. A right-click on a client row selects that client first. The client menu offers **Add site**, **Edit client**, **Edit fields** and **Delete client**. The site menu offers **Edit site**, **Edit fields** and **Delete site**. You only see the entries your role allows. Below a divider you get every action other modules add for a client or a site, such as **Run all checks** from Checks and **Send command** from Remote Background. They run exactly as the **Extensions** button runs them. An action that cannot run now stays in the menu with its reason. An action that changes things asks one Yes or No question first. Escape, a click elsewhere, scrolling, resizing the window or moving to another page closes the menu. The arrow keys move through it. The row buttons and **Extensions** stay as they were. A right-click on a text field keeps the browser's own menu.
- **Move a site to any client Core lists.** Core 1.17.25 follows Tactical's rule: the destination client needs no grant of its own. The **Move to client** list shows the clients Core returns, with no filter on our side. Core decides who may move a site. If Core refuses, its message stays in the Edit site dialog, and your changes stay too. A missing destination now comes back as a 400 and a name clash as a 409. The dialog says the agents on the site move with it.
- **End all sessions still signs you out too.** The button never asks Core to keep your own session. The question reads "End every login session for every user? Everyone is signed out, you included. You will need to sign in again." If Core refuses with a 403 or a 400, its message shows on the page and the list stays.
- **Clearer sign-in errors.** Each sign-in step now names only what it asked for. A wrong password on the two-factor set-up step reads "The password was not accepted. Enter your current password again." It no longer mentions a username or a code. The code steps name the code. The backup code step names the backup code. The first step says the username or password was not accepted.
- **Save preferences no longer shows a false error.** If Core cannot end your header theme choice after your preferences saved, the page still says the save worked. It adds a line: "Core could not end your header theme choice. It may come back when you refresh the page."

## What stays as it was

- Permissions, scope and audit do not change. A hidden menu entry is never the authority. Core and Tactical decide every call.
- Add site still lists the selected client only. Add client, delete and custom fields work as before.

## What you do not get yet

- The Endpoints Scope pane has its own right-click menu. That is Endpoints' code, and Endpoints 0.6.0 already lists the contributed client and site actions there.
- Table style, dialog tabs and the popup layout for long forms (CO10, EP19) wait for a contract.
- A role that can list sites but not clients has no client list to pick from. The Move to client list is then built from the sites that role can read, so it offers only clients the person already sees (assumption, in `reviews/questions/ui.md`).

## For module developers

- **New, additive: `tacticalPermission` on `addNavigation`.** Give an item one Tactical flag name, or a list in which every flag must be true. The shell hides the item until `context.tactical_permissions[flag]` is strictly `true`, the same test as `context.hasTacticalPermission(flag)`. It follows the context live. A superuser gets no shortcut. Outside a backend context a gated item is hidden. It combines with `permission` and `permissions`. An item without it behaves exactly as before, so no module has to change. Agents can move its Pending actions gate onto it.
- `client.context-menu` and `site.context-menu` are now also shown in the right-click menu on Clients & sites. The context passed to your action is the same as before. Nothing changes for providers.
- Details: `docs/module-runtime-api.md` ("Navigation permissions") and `docs/context-actions.md`.

## For the maintainer

- New files: `src/components/ResourceContextMenu.vue`, `src/resource-context-menu.js`, `tests/fixtures/core-http-routes-1.17.25.json`.
- The route test now reads `/api/tfd/access/sessions/revoke-all/` and `/api/tfd/session/theme/` from a fixture taken from the signed export `tec-tac-public-contract 1.17.25-0.12.98`. The version whitelist is gone.
- New tests: `revoke-all-sessions-0.12.99`, `site-move-follows-tactical-0.12.99`, `resource-context-menu-0.12.99`, `signin-step-wording-0.12.99`, `nav-tactical-permission-0.12.99`, `session-theme-clear-0.12.99`. The earlier Core range pins moved to 1.17.25, and `site-move-0.12.98` now expects a 400 for a missing destination.
- The earlier release notes are kept in `docs/releases`.
