# Tec-Tac UI 0.12.70

Tracker closure batch: **F1 only on UI**. Companion Core release: **1.15.177**.

## F1 — My Account password validation error contract

- Added an executable browser-side regression for Core's HTTP 400 `{detail}` password-validation response.
- The production `apiFetch` + `changeMyPassword` + `changePasswordWorkflow` path is exercised directly.
- The test proves the exact server validation detail is surfaced to My Account rather than replaced by a generic failure message.
- No production UI behavior or visual layout changed in this release.

## Validation

The complete existing UI regression suite plus `tests/f1-password-error-0.12.70.mjs` passes.

This release is unsigned.
