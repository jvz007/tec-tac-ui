# UI 0.12.87

Released 9 October 2026. Needs Core 1.17.7 or later.

## What changes for you

- **The stable release row stays visible after a branch switch.** After you save a move from one branch to another, the Stable release row used to vanish if the check that follows failed. It now shows the last known stable release, marked "Last known stable release, not refreshed". The release is not specific to a branch, so the number is still useful. A successful check removes the mark. Superusers keep the Use stable release button.
- **No old errors under the new branch.** The row never copies the other branch's lookup error or STALE pill.

## For module authors

Two new helpers in `register(context)`. Both are additive. No existing registry, helper or `api()` behaviour changes, and no module under `modules/` uses these names today.

- **`context.tacticalOperation(moduleId, operationId, { params, body, signal })`** runs a Tactical operation through Core's server-side route (`POST /api/tfd/tactical-operations/<module>/<operation>/`, AD-19). It sends `{ params, body }`, relays Tactical's status and body, keeps a file answer's `Content-Type` and `Content-Disposition`, and reads the `X-Tec-Tac-Audit` header as `audit` and `auditRecorded`. It builds the URL from the two ids only, refuses a bad id, `params` or `body` before any request, accepts no headers and sends no audit outcome. A failed call throws the same error `apiRaw` throws, with `status`, `payload` and `code`. Public modules do not get it.
- **`context.hasTacticalPermission(flag)`** reads Core's `tactical_permissions` (new in `register(context).context.tactical_permissions`). It is true only when the flag is exactly `true`. It is a display hint: Tactical still decides every call. `hasPermission(code)` is unchanged.
- **Failures carry `headers`.** An error thrown by `apiRaw`, `apiBlob`, `apiText` or `api()` for an HTTP failure now has a non-enumerable `headers` property, so a page can read `X-Tec-Tac-Audit` on a 5xx. The error keys (`status`, `payload`, `code`) do not change.
- If the API is served from a different origin than the page, the proxy must expose `X-Tec-Tac-Audit` and `Content-Disposition`. Same-origin installs are unaffected.

Both helpers are documented in `docs/module-runtime-api.md`.

## Requirements

Core 1.17.7 or later. The package now requires `tec-tac-framework >=1.17.7,<2.0.0`.

## Under the hood

- New `src/tactical-operations.js`, import-free, with the transport injected from `main.js`.
- `normalizeBackendRuntimeContext()` keeps `tactical_permissions` as a plain object of `can_*` keys with boolean values. `emptyRuntimeContext()` gives `{}`.
- `stableRelease()` returns the last known row with `notRefreshed: true` when no result for the saved branch carries the release. `applySource()` clears the first-load cached row after a successful save.

## Tests

New: `tactical-operations-0.12.87.mjs`, `tactical-permissions-context-0.12.87.mjs`, `stable-release-not-refreshed-0.12.87.mjs`. Amended: `stable-release-branch-switch-0.12.86.mjs` (an online result for another branch now gives a not-refreshed row, and its error and stale flag still never leak), `update-source-superuser-0.12.86.mjs` (framework requirement) and `module-runtime-docs-0.12.82.mjs` (two new sections), `stable-release-0.12.85.mjs` (other-source cache now gives a not-refreshed row, and a save drops the cached row) and `api-contract-routes-0.12.58-1.mjs` (the Tactical operations route, from Core 1.17.7).
