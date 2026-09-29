# Tec-Tac UI 0.12.68

## Tracker closure: D3 + F4

- **D3 — seamless restore:** Backup & Restore now exposes the recovery signer trust step for a valid but untrusted bundle. The operator sees the source server, installation ID, signer key, SHA-256 fingerprint and signing time, explicitly confirms trust, waits for the Core trust job, and the UI re-validates the same backup before restore can continue. Backup inventory also shows the recovery signer fingerprint.
- **F4 — Tactical UI preferences:** saving My Account Tactical UI preferences now updates the existing authenticated runtime context **in place**. Already-loaded modules holding `register(ctx).context` therefore see the new `agent_dblclick_action` and `url_action_id` immediately without a browser reload.

## Validation

- Added `tests/d3-f4-production-closure-0.12.68.mjs` for exact recovery-signer trust identity/polling and the in-place runtime-context update contract.
- Existing UI regression suite remains the release gate.

Requires Tec-Tac Core `>=1.15.173,<2.0.0`. Tested with Core `1.15.174-2`.
