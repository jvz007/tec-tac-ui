# Tec-Tac UI

**Version:** 0.1.0

Tec-Tac UI is the standalone Vue frontend for Tec-Tac. It is intentionally kept in a separate repository from the Tec-Tac backend/framework (`tac-net-rep`). The UI is installed below Tactical's existing frontend at `/tec-tac/` and reuses Tactical's browser authentication state.

## Design rules

- Independent Vue 3 application; no Tactical tracked-source edits.
- Deployment path: `/var/www/rmm/dist/tec-tac/`.
- Browser path: `https://<tactical-frontend>/tec-tac/`.
- Uses Tactical's existing `access_token`, `user_name`, and `name` browser storage values.
- Sends API credentials the same way as Tactical's current frontend: `Authorization: Token <token>`.
- Backend APIs remain authoritative for authorization.
- Dynamic UI modules are trusted code and can be loaded without rebuilding the shell.
- Hash routing is used in 0.1.0 so no nginx SPA rewrite is required.
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

The development browser still needs access to a Tactical API and a valid Tactical browser token. The production build uses `/env-config.js` from the Tactical frontend to discover the API URL.

## Build

```bash
npm install
npm run build
```

Vite builds the UI with the base path `/tec-tac/`.

## Install on a Tactical server

Clone the UI repository separately from the backend repository, for example:

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

## Tactical authentication

Tactical's current Vue frontend stores the logged-in browser token as `access_token`. Tec-Tac UI reads that same token and sends it to the Tactical/Tec-Tac API using the `Token` authorization scheme. The shell does not implement a second login system.

If the token is missing, the UI shows an authentication-required state and sends the operator back to Tactical.

## Backend context compatibility

0.1.0 supports two modes:

1. **Backend context mode** — if `GET /api/tfd/ui/context/` exists, the shell uses the richer user, role, permission, and module context returned by the backend.
2. **Compatibility mode** — if that endpoint does not exist, the shell continues to work with the unmodified Tec-Tac 1.0.1 backend. It uses Tactical browser identity plus the locally generated module manifest.

This means Tec-Tac UI 0.1.0 does not require modifying the 1.0.1 backend just to load the shell.

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

This is a **read-only integration with the backend repo**. No backend files are changed.

A module exports a `register()` function. See `examples/reference-module/` for a minimal working example.

## Module runtime contract

The shell currently exposes the following trusted-module context:

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

## Reference module

`examples/reference-module/` is deliberately kept outside the production `public/modules` tree. It documents the module contract without automatically enabling a fake production module.

To test it manually, copy the example into an extension or into the deployed modules directory and add a matching entry to `modules/modules.json`.

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
