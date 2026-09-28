# Tec-Tac UI 0.12.46

## Review closures

### U1 — deterministic installer dependencies

- `scripts/install.sh` now uses `npm ci` instead of `npm install --no-package-lock`.
- The production server installer therefore consumes the committed npm v3 lock file exactly, matching the release workflow.
- Regression coverage verifies the installer command and the root dependency/version alignment between `package.json` and `package-lock.json`.

### L70 — Admin Sessions ordering and current-session warning

- Active-session loads now use a latest-request gate. Older search/page/refresh responses cannot replace rows, pagination, errors, or loading state after a newer request starts.
- Revoking the row marked `current` explicitly warns that the operator will be signed out immediately.
- Revoking all sessions for a user from the current row explicitly warns that the current session is included.

### L74 — release-note archive recovery

- Restored the authoritative 0.12.32, 0.12.33, 0.12.34, and 0.12.35 release notes from their historical full-source bundles.
- The accepted 0.12.34 rebuild is archived under the clean `0.12.34` identity while retaining its rebuild detail inside the note.
- Added executable archive regression coverage so these recovered notes cannot silently disappear again.

## Tests

- `tests/install-lockfile-u1.mjs`
- `tests/admin-sessions-l70.mjs`
- `tests/release-notes-l74.mjs`
- `tests/ui-0.12.46.sh`
