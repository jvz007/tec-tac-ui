Version **0.10.11** extends the authenticated dynamic-module runtime with Core-owned `apiRaw`, `apiBlob`, and `apiText` helpers for downloads, uploads, binary responses, and other non-JSON operations. Modules must not read Tactical tokens or browser auth storage directly. See `docs/module-runtime-api.md`.

Version **0.10.9** adds lifecycle progress bars and a five-second post-success reload delay.

Version **0.10.7** hardens dynamic module cache coherency and route ownership. The canonical runtime module manifest is `/tec-tac/modules/modules.json` (filesystem: `/var/lib/tec-tac/ui/tec-tac/modules/modules.json`).

Version **0.10.5** keeps UI source installs Git-clean by suppressing npm lockfile generation during deployment.

# Tec-Tac UI

Version **0.10.4** fixes UI installer source-path handling after the Tec-Tac source/runtime layout separation.

Version **0.10.1** adds persistent whole-rail and per-category navigation collapse controls while preserving dynamic extension navigation.

Version **0.10.0** adds Scheduler configuration, diagnostics, self-tests, richer run history and dangerous-action confirmation for Framework 1.11.0.

Version **0.9.3** adds shell-wide Tactical session-expiry handling: authenticated `401` responses immediately clear the stale session and expose the existing login gate without changing the current hash route. `403` remains an RBAC error. Version 0.9.2 fixes Public Contracts Markdown/Text downloads against the Framework 1.10.2 export endpoint.

Version **0.8.0** adds Operations → Schedules for Framework 1.8.0.

Historical release notes are archived under `docs/releases/`; only the current release note remains at repository root.

Version **0.7.1** deploys runtime version metadata and hardens Module Manager job-status polling.
Version **0.6.2** fixes navigation visibility precedence so an operator Show/Hide override wins over a module package default.
**Version:** 0.5.0


## 0.5.0 focus: drag/drop package queue

0.5.0 replaces the single file-picker-first Modules workflow with a drag-and-drop package intake and ordered installation queue. Multiple package files can be staged together, inspected, and reordered before installation. Required dependency sequencing is enforced in the UI and revalidated by Tec-Tac Framework 1.5.0; only otherwise-independent packages can be rearranged. The release also removes the hardcoded footer version and injects the package version at build time.

## 0.3.0 focus: system updates and navigation categories

0.3.0 adds a dedicated System → Updates workspace backed by Tec-Tac Framework 1.3.0. Framework and UI updates can be staged from stable GitHub releases, explicitly unlocked repository branches/custom builds, or offline repository archives. The page exposes package inspection, version/update classification, downgrade confirmation, lifecycle logs, rollback state, update history, and an explicit reload after UI replacement.

The left rail is now grouped by navigation category. Workspace/extension pages are kept separate from Administration, while Configuration is reserved as a first-class section for future settings pages. Dynamic extensions retain ownership of their `navigation.section`.


## 0.2.5 focus: clearer authenticator enrollment

0.2.5 changes the TOTP enrollment area from two columns to two stacked rows. The locally generated QR code is now larger and centered as the primary enrollment path, with the manual setup key moved below it as a fallback. Authentication behavior is unchanged.

Tec-Tac UI is the standalone Vue frontend for Tec-Tac. It is intentionally kept in a separate repository from the Tec-Tac backend/framework (`tac-net-rep`). The UI is installed below Tactical's existing frontend at `/tec-tac/`.

## 0.2.4 focus: local authenticator QR code

0.2.4 adds the missing QR code to Tec-Tac's first-login TOTP enrollment screen. After Tactical creates the user's TOTP secret, the UI requests `GET /api/tfd/auth/totp/qr/` from Tec-Tac framework 1.2.5 and displays the returned SVG locally. The manual key remains available as a fallback. No external QR service receives the TOTP provisioning URI or secret.

## 0.2.3 focus: Tactical-native TOTP enrollment

0.2.3 keeps first-time authenticator enrollment inside Tec-Tac. Accounts without a Tactical TOTP secret now use Tactical's short-lived credential-check token to call `POST /accounts/users/setup_totp/`, display the returned setup key and provisioning URI, and verify the generated code through Tactical's normal `POST /v2/login/` flow. No redirect to Tactical's frontend is required.

The short-lived setup token is explicitly marked as enrollment-only and is never accepted as a normal Tec-Tac session. If the browser reloads mid-enrollment, Tec-Tac clears that token and starts sign-in again rather than exposing the operational shell.


## 0.2.0 focus: module discovery and lifecycle

0.2.0 turns the Modules workspace into an operational catalog for installed Tec-Tac extension/ReportSet pairs. With backend/framework 1.2.0 it can inspect an uploaded `.zip`, `.tar.gz`, or `.tgz` package before installation, show extension/ReportSet/UI metadata, install a new pair, explicitly replace an installed pair, remove module code while preserving data, and follow the asynchronous lifecycle job while Tactical services restart.

Module installation is a trusted-code operation. The UI requires the backend `manage_modules` capability, which maps to Tactical's native `can_do_server_maint` permission (or effective superuser). Package inspection validates archive paths, the paired registry contract, optional UI manifest paths, and UI permission references before the privileged worker is dispatched.

After a successful lifecycle job, the backend worker runs the deployed UI module synchronizer when available. Reload Tec-Tac to load a newly installed runtime UI module into the current browser application.

The 0.1.4 role editing safeguards remain in place. The floating role action bar now also shows the role name, role ID, and SAVED/UNSAVED state while scrolling long permission lists.

## 0.1.2 focus: Tactical-native sign-in

0.1.2 adds a Tec-Tac login surface that authenticates directly against Tactical's existing authentication API. Tec-Tac does **not** maintain a second user database and does not validate passwords itself.

Authentication flow:

```text
Tec-Tac username + password
        |
        v
POST /v2/checkcreds/
        |
        +-- TOTP configured --> prompt for authenticator code
        |                         |
        |                         v
        |                    POST /v2/login/
        |                         |
        |                         v
        |                    Tactical token
        |
        +-- TOTP not configured --> Tactical TOTP enrollment required
```

For a normal enrolled account, sign-in remains entirely inside `/tec-tac/`. After Tactical returns a token, Tec-Tac reloads and verifies that token before the operational shell is exposed.

If Tactical reports that the account has no TOTP secret yet, Tec-Tac preserves Tactical's short-lived setup token only long enough to call `POST /accounts/users/setup_totp/`. Tec-Tac then shows the returned manual setup key and authenticator URI inside its own sign-in flow, asks for the newly generated code, and completes authentication through `POST /v2/login/`. The operator is never redirected to Tactical for enrollment. A setup-only token is explicitly marked in browser storage and can never unlock the Tec-Tac operational shell; if the page reloads mid-enrollment the temporary token is discarded and credentials must be entered again.

The password and TOTP code are held only in the Vue component's runtime memory while the authentication requests are performed. They are not written to local storage. Only Tactical's returned session values (`access_token`, `user_name`, and `name`) are persisted, matching Tactical's current frontend behavior.

## Design rules

- Independent Vue 3 application; no Tactical tracked-source edits.
- Deployment path: `/var/lib/tec-tac/ui/tec-tac/`, served by nginx at `/tec-tac/`.
- Browser path: `https://<tactical-frontend>/tec-tac/`.
- Tactical remains the authentication authority.
- Existing Tactical browser tokens are verified before the operational UI is shown.
- New local-login sessions use Tactical's `/v2/checkcreds/` and `/v2/login/` endpoints.
- Sends authenticated API credentials as `Authorization: Token <token>`.
- Backend APIs remain authoritative for authorization.
- Dynamic UI modules are trusted code and can be loaded without rebuilding the shell.
- Hash routing is used so no nginx SPA rewrite is required.
- Dark, light, and high-contrast themes are supported.

## Repository layout

```text
tec-tac-ui/
├── VERSION
├── package.json
├── vite.config.js
├── index.html
├── public/
│   └── modules/modules.json
├── src/
│   ├── App.vue
│   ├── api.js
│   ├── main.js
│   ├── module-loader.js
│   ├── router.js
│   ├── state.js
│   ├── styles.css
│   ├── components/
│   │   └── LoginPanel.vue
│   └── views/
├── scripts/
│   ├── install.sh
│   ├── sync-modules.sh
│   └── uninstall.sh
├── tests/
│   └── foundation.sh
└── examples/
    └── reference-module/
```

## Development

```bash
npm install
npm run dev
```

The production build uses Tactical's `/env-config.js` to discover the Tactical API URL.

## Build

```bash
npm install
npm run build
```

Vite builds the UI with the base path `/tec-tac/`.

## Install on a Tactical server

Keep the UI repo separate from the backend repo:

```text
/opt/tec-tac/       backend/framework repo
/opt/tec-tac-ui/    frontend repo
```

Then:

```bash
cd /opt/tec-tac-ui
sudo bash scripts/install.sh
```

The installer builds the Vue application and deploys it to:

```text
/var/lib/tec-tac/ui/tec-tac/
```

It installs `/etc/nginx/snippets/tec-tac.conf` and adds one include to Tactical's frontend nginx server block so `/tec-tac/` is served from this persistent path. It does not edit Tactical tracked source files or the Tec-Tac backend repo. After a Tactical update, `sudo bash scripts/repair-nginx.sh` restores the nginx include if necessary without rebuilding the UI.

## Session verification

On startup Tec-Tac first validates any existing Tactical token. The shell does not trust stale browser identity values by themselves.

- valid token -> continue startup
- missing/invalid token -> show Tec-Tac login
- verification failure other than an authentication failure -> fail closed and show a startup error

After verification the optional `GET /api/tfd/ui/context/` contract is attempted. If that endpoint is not installed and returns `404`, the shell uses the locally generated module manifest for compatibility with the unmodified Tec-Tac backend 1.0.1.

## Session expiry contract

Tec-Tac owns Tactical browser-session invalidation centrally. Authenticated shell and extension requests should use the shell-provided `api()` / `apiFetch()` path. If Tactical returns HTTP `401`, the API layer clears `access_token`, `tec_tac_auth_stage`, `user_name`, and `name`, then emits the shell-wide invalid-session event. The state layer switches to the existing login gate without navigating away from the current hash route. After successful sign-in, the normal reload returns the operator to that route.

HTTP `403` means the authenticated identity lacks permission for the requested operation. It must remain a normal RBAC error and must never clear the Tactical session.

Extension rules:

- do not implement module-specific expiry redirects;
- do not clear Tactical authentication storage from an extension;
- use the authenticated runtime `api` helper for private APIs so `401` participates in the shell contract;
- use `publicApi()` only for deliberately anonymous public routes; it does not attach Tactical authentication and does not participate in Tactical session invalidation.

## Backend context compatibility

1. **Backend context mode** — if `GET /api/tfd/ui/context/` exists, the shell uses the richer user, role, permission, and module context returned by the backend.
2. **Compatibility mode** — if that endpoint returns `404`, the shell uses verified Tactical browser identity plus the locally generated module manifest.

Role, superuser state, and effective Tec-Tac permissions are not guessed by the UI when the richer backend context endpoint is unavailable.

## Cross-module UI contribution contracts

Tec-Tac Core owns two browser-runtime contribution registries for authenticated modules:

- `contextActions` for commands contributed to shared resource surfaces such as context menus.
- `contextInteractions` for drag/drop relationships between shared resource types and surfaces.

Modules receive module-scoped registry objects through `register(context)`. Provider IDs must be namespaced to the module, Core enforces declared permissions, and consumers query/execute contributions without importing another module's UI internals. See `docs/context-actions.md` and `docs/context-interactions.md`.

## Dynamic UI modules

### Canonical runtime manifest

The canonical browser URL for dynamic module discovery is:

```text
/tec-tac/modules/modules.json
```

The deployed filesystem path is:

```text
/var/lib/tec-tac/ui/tec-tac/modules/modules.json
```

`/tec-tac/modules.json` is not a valid Tec-Tac module-manifest location. `scripts/sync-modules.sh` owns generation of the canonical manifest and the shell loads that exact URL with `cache: no-store`. Module entry URLs in the manifest include a content-derived cache key so replacement module code is fetched as a new ES module.


An installed backend extension may optionally contain:

```text
extensions/<id>/
├── tec_tac_ui.json
└── ui/
    └── index.js
```

Example `tec_tac_ui.json`:

```json
{
  "id": "networkprobe",
  "version": "0.1.0",
  "entry": "ui/index.js",
  "navigation": {
    "label": "Network Probe",
    "section": "Extensions",
    "icon": "◇",
    "order": 100
  },
  "permissions": [
    "networkprobe.device.list"
  ]
}
```

The UI repo's module synchronizer reads these manifests from `/opt/tec-tac/extensions` by default and copies only their UI bundles into the persistent Tec-Tac deployment:

```bash
sudo bash scripts/sync-modules.sh
```

This is a read-only integration with the backend repo. No backend files are changed.

## Module runtime contract

The shell exposes the following trusted-module context:

```text
Vue
app
router
state
addNavigation(item)
api(path, options)
hasPermission(codename)
descriptor
```

Backend authorization must still be enforced by every backend API. Hiding a route or button is not a security control.

## Test

```bash
bash tests/foundation.sh
npm install
npm run build
```

## Uninstall

```bash
sudo bash scripts/uninstall.sh
```

The current deployment is renamed to a timestamped backup instead of being permanently deleted.


## Role editing safeguards in 0.1.4

The role editor now keeps the newly created role selected and protects unsaved role/permission changes. A dirty role shows a persistent warning banner, and attempts to switch roles, switch Access sections, navigate elsewhere, open Tactical, or sign out are intercepted with Save / Discard / Stay choices. Browser refresh/close also receives a native unsaved-change warning.

Tec-Tac backend 1.2.1 is required for the 0.2.1 public-module contract and retains the 1.2.0 lifecycle API. The earlier 0.1.4 role-editing behavior remains compatible with that backend.

## Access management in 0.1.3

The Access workspace now manages Tactical users and roles using Tactical's native authenticated APIs. Native role permissions stay authoritative in Tactical. Tec-Tac extension permissions are attached to the same Tactical role IDs through the paired backend 1.1.0 access API. See `docs/releases/RELEASE_NOTES_0.1.3.md` for the release scope.

## Public extension UI in 0.2.1

A module may expose an anonymous browser surface in addition to, or instead of, its authenticated Tec-Tac UI.

```json
{
  "id": "statusportal",
  "version": "1.0.0",
  "entry": "ui/index.js",
  "public": {
    "entry": "ui/public.js",
    "base_path": "/public/statusportal"
  },
  "permissions": ["statusportal.manage"]
}
```

The public entry exports `registerPublic(context)` and is loaded before Tactical authentication is required. The public runtime intentionally exposes only Vue, app, descriptor, `addPublicRoute(route)`, and `publicApi(path, options)`. Routes are constrained to `/public/<extension-id>` and descendants. `publicApi()` never attaches the Tactical browser token; any backend endpoint intended for anonymous use must explicitly permit that access server-side.


## Persistent deployment in 0.2.2

Tactical replaces `/var/www/rmm/dist` during upgrades. Tec-Tac therefore no longer stores its built application or extension UI modules inside that tree. The persistent default is `/var/lib/tec-tac/ui/tec-tac`. `scripts/repair-nginx.sh` owns the small nginx integration required to expose that directory at `/tec-tac/`.

The repair script validates nginx before reloading it and restores the previous frontend config if validation fails.

## Readability in 0.2.2

Text sizes are approximately 10% larger while retaining the existing compact SHTF/Tec-Tac layout and three-theme model.

## Module Management v2 (0.4.0)

UI 0.4.0 switches the Modules surface to the Framework 1.4.x v2 APIs. Operators can inspect installed state, dependencies, dependants and runtime requirements; enable or disable modules; request cascade disable when required; inspect one or more packages or a bundle; review the resolved installation order and blockers; and follow lifecycle job status.

Disabled modules remain installed but `scripts/sync-modules.sh` excludes their UI entrypoints from the deployed module manifest.

Native Tactical remains available through the existing **Open Tactical** control while Tec-Tac replacement workflows are still being proven.

See `docs/releases/RELEASE_NOTES_0.4.0.md`.

## Module visibility (planned)

Tec-Tac will separate a module's runtime state from whether it appears as a standalone navigation destination.

| Runtime | Visibility | UI behaviour |
| --- | --- | --- |
| Enabled | Visible | Module loads normally and contributes its declared navigation entry. |
| Enabled | Hidden | Module loads normally, routes remain available, but its normal navigation entry is suppressed. |
| Disabled | Hidden | Module is inactive and contributes no navigation entry. |

This is intended for support-oriented modules such as **Checks** and **Automation**. They can remain enabled for use by Endpoints or other workflows without permanently occupying the left navigation rail.

Important rules:

- hidden modules remain listed in **Modules** administration;
- hiding a module does not affect dependency satisfaction;
- direct/internal links to an enabled hidden module may continue to work;
- hiding is not an RBAC control;
- missing visibility state defaults to **Visible** for backward compatibility;
- disabled modules are always effectively hidden.

The Modules table should expose **Runtime** and **Visibility** as separate columns, and Module Detail should provide a dedicated `Visible / Hidden` control rather than overloading Enable/Disable.


## Module visibility (0.6.0)

The Modules administration view separates runtime state from navigation visibility. Operators can **Hide** or **Show** a managed module without disabling it. Hidden modules still register their authenticated UI routes/components and remain available to internal links; only their top-level `addNavigation()` entries are suppressed. Hidden modules always remain listed in Modules administration so they can be restored.

### Visibility precedence

Module navigation visibility resolves as **operator override > package default > visible**. A module that ships hidden can therefore be shown from Module Manager without changing or rebuilding the module package.


### Visibility runtime precedence

The resolved module descriptor is authoritative at runtime. Module code may declare a default `visible: false`, but once an operator chooses Show or Hide, the persisted Module Manager override wins and the module loader normalizes the navigation item accordingly.



### UI 0.7.0

Module Manager now includes Installed, Online catalog, and Repositories views with multi-repository source management, sync health, compatibility/update reporting, and download-to-existing-inspection workflow.

### UI 0.6.4

The Modules workspace surfaces browser-side module UI load diagnostics (loaded, skipped, failed, and error details) so a broken extension UI cannot masquerade as a visibility/runtime-state issue.

## Module repositories (0.7.0)

The Modules workspace now separates Installed, Online catalog, and Repositories. Repository downloads always enter the existing package inspection/install plan before execution; installed source provenance is shown and source changes are never implicit.

## Installation layout (0.10.3+)

The UI Git checkout lives at `/opt/tec-tac-src/ui`. The compiled UI remains `/var/lib/tec-tac/ui/tec-tac`. Shared paths are read from `/opt/tec-tac/etc/tec-tac.conf`.


## UI context actions (0.10.8)

Authenticated modules receive a Core-owned `contextActions` registry through `register(context)`. Provider modules register actions for shared resources such as endpoints; consumer modules list and execute those actions without importing provider UI code. Action IDs are provider-scoped and backend authorization remains authoritative.

See `docs/context-actions.md` for the public descriptor, placement, selection and lifecycle contract. The live Public Contracts page lists currently registered browser actions separately from backend capabilities.

## Per-user navigation preferences (0.10.12)

Authenticated users can reorder navigation items inside their existing category by dragging them. Ordering is stored browser-locally under the authenticated Tactical username. Category ownership remains authoritative: dragging does not move a module between Workspace, Operations, Extensions, Administration, or Configuration.

A **Favorites** category can contain shortcuts to any currently visible navigation item while leaving the original entry in place. Favorites can be independently reordered. Right-clicking a navigation item exposes **Open in new tab** plus **Add to Favorites / Remove from Favorites**. Dynamic module routes use the same shell router resolution as core routes.
