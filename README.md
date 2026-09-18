# Tec-Tac UI

**Version:** 0.1.4

Tec-Tac UI is the standalone Vue frontend for Tec-Tac. It is intentionally kept in a separate repository from the Tec-Tac backend/framework (`tac-net-rep`). The UI is installed below Tactical's existing frontend at `/tec-tac/`.

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

If Tactical reports that the account has no TOTP secret yet, Tec-Tac preserves Tactical's short-lived setup token but **does not** grant Tec-Tac access. The operator is sent to Tactical's own `/totp_setup` route to complete first-time enrollment. This mirrors Tactical's native security flow rather than bypassing it.

The password and TOTP code are held only in the Vue component's runtime memory while the authentication requests are performed. They are not written to local storage. Only Tactical's returned session values (`access_token`, `user_name`, and `name`) are persisted, matching Tactical's current frontend behavior.

## Design rules

- Independent Vue 3 application; no Tactical tracked-source edits.
- Deployment path: `/var/www/rmm/dist/tec-tac/`.
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
/var/www/rmm/dist/tec-tac/
```

It does not edit Tactical source files or the Tec-Tac backend repo.

## Session verification

On startup Tec-Tac first validates any existing Tactical token. The shell does not trust stale browser identity values by themselves.

- valid token -> continue startup
- missing/invalid token -> show Tec-Tac login
- verification failure other than an authentication failure -> fail closed and show a startup error

After verification the optional `GET /api/tfd/ui/context/` contract is attempted. If that endpoint is not installed and returns `404`, the shell uses the locally generated module manifest for compatibility with the unmodified Tec-Tac backend 1.0.1.

## Backend context compatibility

1. **Backend context mode** — if `GET /api/tfd/ui/context/` exists, the shell uses the richer user, role, permission, and module context returned by the backend.
2. **Compatibility mode** — if that endpoint returns `404`, the shell uses verified Tactical browser identity plus the locally generated module manifest.

Role, superuser state, and effective Tec-Tac permissions are not guessed by the UI when the richer backend context endpoint is unavailable.

## Dynamic UI modules

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

The UI repo's module synchronizer reads these manifests from `/opt/tec-tac/extensions` by default and copies only their UI bundles into the deployed frontend:

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

Tec-Tac backend 1.1.0 remains the paired backend for this UI release; no backend changes are required for 0.1.4.

## Access management in 0.1.3

The Access workspace now manages Tactical users and roles using Tactical's native authenticated APIs. Native role permissions stay authoritative in Tactical. Tec-Tac extension permissions are attached to the same Tactical role IDs through the paired backend 1.1.0 access API. See `RELEASE_NOTES_0.1.3.md` for the release scope.
