# Tec-Tac UI 0.12.58

## Native Backup & Restore (D2 / D3)

- Added Administration > Backup & Restore for effective superusers.
- Lists only server-registered backup destinations and their recovery bundles.
- Requires a non-destructive restore validation before the destructive Restore action becomes available.
- Displays source server name, installation ID, recovery signer key and SHA-256 fingerprint from Core validation.
- Displays the exact current-to-restored Core version transition and an explicit “This puts Core back to X” warning before a downgrade restore is confirmed.
- Restore starts only after an explicit destructive confirmation modal.
- Added behavior coverage for restore readiness, recovery identity display data and downgrade warning state.
