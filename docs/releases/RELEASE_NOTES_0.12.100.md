# UI 0.12.100

Date: 14 October 2026. Requires Core 1.17.28 or later (raised from 1.17.25).

## What changes for you

- **Manage Tactical API keys in Access.** Access > API keys lists every key with its name, owner and expiry. Create a key for a script or tool. Edit its name, owner or expiry. Delete a key you no longer need. Anything that uses a deleted key stops working.
- **Copy a new key once.** Tactical makes the key value itself, so Tec-Tac shows it in one dialog right after you create it. Copy it then. You can read it again later in the list.
- **Show and copy an existing key.** Keys stay hidden in the list until you choose Show. Copy puts the value on your clipboard. Only a role with Manage API keys can show or copy a key value.
- **See sign-in providers in Access.** Access > Single sign-on lists each provider with its client ID, server URL, role and callback URL. Everyone who can list accounts can read it. Only a Tec-Tac superuser sees the client secret.
- **Add, edit and delete sign-in providers.** A superuser adds a provider in a two-part form. The Provider tab holds the name, client ID, secret and server URL. The Sign-in role tab sets the role a new account gets when it first signs in through that provider.
- **Turn single sign-on on or off, and block local sign-in.** A superuser saves the two settings. Before local sign-in is blocked, you confirm once. Everyone must then sign in through single sign-on. A local superuser account can still sign in with a password.
- **Core stops a lock-out.** Core will not block local sign-in while no provider exists. It will not delete the last provider while blocking is on. If it refuses, its sentence shows on the page and nothing changes.
- **Disconnect one linked sign-in.** Open a user in Access > Users. A superuser sees Single sign-on accounts at the bottom of the form, with a Disconnect button for each linked account. The Tactical account stays.
- **Access shows for API keys alone.** A role that can list API keys, but has no other access right, now sees the Access item.
- **Clearer tables.** The Users, API keys and sign-in provider tables have a header that stays in view while you scroll, and a highlight on the row under the pointer. In the API keys and sign-in provider tables, long values are cut short, and the full text shows on hover.

## What hides, and for whom

- **API keys tab:** shown only when your Tactical role can list API keys. Add, Edit and Delete, and Show and Copy, need Manage API keys. Without it, the key column says the value is shown to people who can manage API keys.
- **Single sign-on tab:** shown when your Tactical role can list accounts. Add, Edit, Delete, the two settings, Save and Disconnect show only to a Tec-Tac superuser. Everyone else sees the settings and the list read-only, with the secret shown as [REDACTED].
- **Protected owners:** when account protection hides a key from you, the key shows as "Hidden by account protection", with no Show or Copy.

## What stays as it was

- Core and Tactical decide every change. A hidden control is never the only protection. Core and Tactical still refuse a call that the person is not allowed to make.
- Sign-in with single sign-on is unchanged. The sign-in page and its routes are not touched.
- Confirmations are one plain Yes or No question. No name or number is typed.
- Tables and dialogs in modules look as they did. A module keeps its current look until it chooses the new styles.

## What you do not get yet

- The Endpoints Edit agent popup and the Remote Background table do not use the new tabs and table style yet. They adopt it in their own releases.
- A role that can manage API keys but cannot list them has no API keys page. Tactical does not let that role see the list.
- A role that cannot list Tactical users cannot pick another owner for a key. The key belongs to that person's own account.
- The browser contract export lists the two shell rows for `tacticalPermission` and `popupPublishers` only when Core writes them. This release documents the exact contract.

## For module developers

- New opt-in styles: `.tablewrap.table-clean`, `.modal-panel.modal-wide` and `.dialog-tabs`. They are documented in `docs/ui-design-standards.md` (sections 5, 8.2 and 17). Do not restyle them.
- `docs/module-runtime-api.md` has a Contract export note under "Navigation permissions" (`tacticalPermission`, UI 0.12.99) and under "Popup mode" (`popupPublishers`, UI 0.12.97).
- Nothing changes in `api()`, the registries, context actions or the module loader.

## For the maintainer

- New files: `src/api-keys.js`, `src/sso-admin.js`, `src/dialog-tabs.js`, `src/components/access/ApiKeysPanel.vue`, `src/components/access/SsoAdminPanel.vue`, `src/help/articles/api-keys-sso.md`.
- Changed: `src/access.js` (new calls only), `src/views/AccessView.vue`, `src/core-navigation.js`, `src/components/access/UsersPanel.vue`, `src/help/core-articles.js`, `src/styles.css` (new classes only; the base table, dialog and tab rules are unchanged).
- New tests: `api-keys-page-0.12.100`, `sso-admin-page-0.12.100`, `table-dialog-tabs-0.12.100`, `contract-docs-0.12.100`.
- `RELEASE_NOTES_0.12.99.md` moved to `docs/releases/`, so the root holds only this note.
