# Tec-Tac UI 0.12.75

## Tracker closure

- F1: password validation failures are now rendered inside the Change password form as an accessible `role=alert`, preserving Core/Tactical validation detail.
- F8: strengthened end-to-end SSO acceptance proving public modules only initiate SSO, never receive the Tactical token, while Core-owned callback completion exchanges the cookie/CSRF session, verifies the token, and crosses the normal UI-context/session-security boundary.

## Tests

- Added `tests/f1-f8-tracker-closure-0.12.75.mjs`.

Unsigned build.
