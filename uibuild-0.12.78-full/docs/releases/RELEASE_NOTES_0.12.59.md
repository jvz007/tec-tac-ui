# Tec-Tac UI 0.12.59

## Final D2 / D3 behavioral closure

- Backup & Restore now renders source server name, installation ID, recovery signer key/fingerprint and the exact Core downgrade headline from the same tested `restoreConfirmationState()` review model.
- The downgrade confirmation headline is generated behaviorally as `This puts Core back to X.` from Core's validated restored version.
- Added a behavioral D2/D3 regression that asserts the exact review model consumed by the view instead of treating source greps as the primary proof.

## Compatibility

Requires Tec-Tac Framework `>=1.15.162,<2.0.0`.
