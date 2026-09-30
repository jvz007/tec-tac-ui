# Tec-Tac UI 0.12.61

## Clients & Sites lifecycle and custom fields (F5-F7)

- Adds Delete actions for clients and sites with explicit agent-relocation destination selection and destructive confirmation.
- Site deletion offers only same-client relocation sites; client deletion offers sites outside the client being removed.
- Adds client/site Custom Fields dialogs backed by Core's `core.resources` contract rather than Tactical HTTP endpoints.
- Supports Tactical text, number, single-select, multi-select, checkbox, and datetime custom-field values.
- Keeps relocation-site discovery bounded and paginated; no 500-row Resource Directory fetches are reintroduced.
- Requires Tec-Tac Framework `>=1.15.168,<2.0.0`.

Regression: `tests/resource-features-0.12.61.mjs` plus the full inherited UI suite.
