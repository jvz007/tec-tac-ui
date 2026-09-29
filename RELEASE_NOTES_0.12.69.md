# Tec-Tac UI 0.12.69

## Tracker closure: F9 + F10

- **F9 — module header slot:** a header contribution that omits an explicit permission now inherits the authenticated module descriptor's declared permissions. The header registry also fails closed unless the current authenticated context is confirmed as backend-supplied. A module can no longer omit `permission` and accidentally expose a top-bar component to users outside the module's permission boundary.
- **F10 — Clients & Sites module context actions:** site context-menu actions now receive both the selected `site` and its parent `client`, matching the Core Public Contract. Listing and execution use the same context shape; client actions retain the existing client context.

## Regression coverage

- Added `tests/f9-f10-production-closure-0.12.69.mjs`.
- The F9 regression loads a real module through `loadUiModules`, registers a header component without an explicit permission, proves descriptor-permission inheritance, proves permission revocation hides it, and proves non-backend context provenance hides it.
- The F10 regression proves site action listing and execution receive the same site/client context and verifies the live Clients & Sites consumer passes the selected parent client.

Requires Tec-Tac Core `>=1.15.175,<2.0.0`.
