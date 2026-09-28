# Tec-Tac UI 0.12.53

## Summary

Prevents out-of-order Tactical role requests from replacing a newer role selection in the Access editor.

## Changes

- Added `role-selection-loader.js`, using the existing latest-request generation gate.
- `RolesPanel.vue` now commits role details and extension permissions only when the request still belongs to the current selection.
- Errors from an older role request are ignored after a newer role has been selected.
- Unmounting the role editor invalidates any in-flight selection request.
- Added a behavioral regression that forces role A to complete after role B and verifies role A is treated as stale.

## Compatibility

No backend contract or route changes.
