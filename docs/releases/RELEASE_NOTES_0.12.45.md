# UI 0.12.45

## Review scope

This release closes UI findings L64, L65, L66, L68 and L69.

- Clipboard writes in System Updates, authenticator enrollment and MFA recovery now surface deterministic user-facing errors when clipboard access is unavailable or rejected.
- Failed/lost one-time authenticator enrollment responses now explain that an administrator may need to reset 2FA before another attempt.
- Module and hotfix intake reject duplicate `.sig` and `.release.json` companions instead of silently accepting the last file.
- System Update trust triggers now expose tooltip relationships through `aria-describedby`, close on mouse click, and close with Escape.
- Switching clients with an active site search suppresses the synthetic search watcher and performs exactly one immediate site fetch.

## Tests

- `tests/ui-hygiene-0.12.45.mjs` covers clipboard failure behavior, enrollment recovery guidance and duplicate sidecar rejection.
- `tests/ui-hygiene-0.12.45.sh` verifies the trust-popover accessibility wiring and single-fetch client/site watcher path.
- Existing foundation, MFA-enrollment and trust-popover regressions remain green.
