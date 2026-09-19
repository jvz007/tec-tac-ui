# Tec-Tac UI 0.9.3

Corrective release for Tactical browser-session expiry handling.

- Any authenticated `apiFetch()` response with HTTP `401` now clears the Tactical browser session and raises one shell-wide invalid-session event.
- The existing state layer consumes that event and immediately switches Tec-Tac to the existing login gate without changing the current hash route.
- HTTP `403` remains an RBAC/permission failure and does not sign the operator out.
- Authenticated direct-fetch helpers (TOTP QR and Public Contracts export) participate in the same invalidation path on `401`.
- Public extension requests remain isolated: `publicApiFetch()` attaches no Tactical token and does not invalidate the Tactical session.
- Extensions must use the shell-provided authenticated `api` helper rather than implementing token-expiry redirects or clearing Tactical storage themselves.
- Builds on UI 0.9.2 and retains its Public Contracts export fixes.
- Requires Tec-Tac Framework `>=1.10.2,<2.0.0`.
