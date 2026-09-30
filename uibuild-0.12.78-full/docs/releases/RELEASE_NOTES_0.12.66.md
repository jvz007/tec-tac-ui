# Tec-Tac UI 0.12.66

Tracker done-when evidence release. Requires Core 1.15.172.

## F1 / F2 — My Account
- Dedicated acceptance regression executes the production My Account workflows over the production account HTTP helpers.
- The same test verifies the real My Account screen wires its password and reset/re-enrol controls to those workflows.

## F4 — module-readable Tactical UI context
- Dedicated acceptance regression proves `tactical_ui` survives backend-context normalization and reaches an actually loaded authenticated module at `register(context).context.tactical_ui`.

## F5 / F6 / F7 — Clients & Sites
- Dedicated acceptance regression executes paginated relocation discovery, site/client delete-and-relocate and custom-field save over the production Resource API helpers.
- The real Resources view is verified to use those production workflows.

## F8 / F9 / F10 — extension surfaces
- Runs the real public module loader with a Global Settings SSO provider.
- Runs the real authenticated module loader with an Alerts header contribution and client/site context actions.
- Executes the same login/header/resource consumer functions used by the application surfaces.

## D2 / D3
- Inherits the 0.12.65 production validate -> result -> confirmation -> validation-bound restore workflow regression.

## Regression coverage
- `tests/f1-f2-my-account-done-when-0.12.66.mjs`
- `tests/f4-runtime-context-done-when-0.12.66.mjs`
- `tests/f5-f7-resources-done-when-0.12.66.mjs`
- `tests/f8-f10-extension-surfaces-done-when-0.12.66.mjs`
- inherited `tests/backup-restore-final-closure-0.12.65.mjs`
