# Tec-Tac UI 0.12.58

## Review rebuild: Backup & Restore Core contract requirement

- Raises the Tec-Tac Framework requirement to `>=1.15.162,<2.0.0`, the Core release that introduces the native Backup & Restore endpoints.
- Adds contract-route regression coverage for every Backup & Restore URL used by `src/api.js`.
- The matching Core 1.15.162-1 rebuild publishes those endpoint request/response and authorization shapes in the live public contract catalogue.

No Backup & Restore workflow behavior changed from UI 0.12.58.
