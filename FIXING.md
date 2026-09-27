# FIXING.md — UI 0.12.42

## Review scope

This is the UI/test half of the final D1 hardening pass.

### L87 — account-protection UI regression was mostly grep-based
- Added `tests/account-security-policy-api.mjs` to execute the policy GET/PUT helpers and verify endpoint, method and boolean payload behavior.
- Kept `tests/account-security-policy-save-flow.mjs` as the behavioral unsaved-navigation regression that catches the U3 lifecycle bug.
- Reduced `tests/account-security-policy-ui.sh` to behavioral test execution plus only minimal wiring checks that require a mounted Vue/browser harness to exercise fully.

## Explicitly not in this release
- No production Account Protection UI behavior change.
- U1, U2 and U4 remain for later tracker passes.
- No unrelated UI Low items.

## Primary files to inspect
- `tests/account-security-policy-api.mjs`
- `tests/account-security-policy-save-flow.mjs`
- `tests/account-security-policy-ui.sh`
