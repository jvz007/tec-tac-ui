# Tec-Tac UI 0.12.63

Tracker closure release for D2/D3 and F1–F10. Requires Core 1.15.169.

## Behavioral closure
- My Account actions now run through shared production workflow functions used by the real view; tests execute password change, 2FA reset/re-enrol, other-session revocation and Tactical UI preference save behavior directly.
- Clients & Sites deletion/relocation and custom-field edits now run through shared production workflow functions used by the real resource view; tests exercise pagination, relocation, delete payloads and field saves directly.
- Login SSO, top-bar module contributions and Clients & Sites context-menu actions now use shared production consumer functions; F8–F10 tests execute those functions rather than reading Vue source text.
- Backup & Restore now derives identity tiles and the restore-enabled decision from exported production helpers, removing the last D2/D3 source-text assertions.

## Core compatibility
- Minimum Core is `>=1.15.169,<2.0.0` so authenticated modules can rely on `state.context.tactical_ui`.

## Regression coverage
- `tests/feature-closure-0.12.63.mjs`
- strengthened `tests/extension-hooks-0.12.62.mjs`
- strengthened `tests/ui-backup-restore-d2-d3-0.12.59.mjs`
