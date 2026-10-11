# UI 0.12.93

Released 10 October 2026. Requires Core 1.17.17 or later.

## What changes for you

- **Modules can add columns to the Endpoints grid.** A module that owns a piece of endpoint data, such as failing checks or pending patches, can now offer it as a grid column. The module answers for a whole page of endpoints in one call, so the grid stays quick. If a column is slow or fails, the cell shows a quiet dash and the other columns carry on. You only see a column when your role allows it. Endpoints shows these columns in its own next release. Until then nothing changes on the grid.
- **Modules can read your client and site scope.** Core 1.17.17 tells the UI whether your Tactical role covers everything, whole clients, single sites, a mix, or nothing. Modules get this as counts only, never as lists of clients. They use it for hints such as "you see part of the estate". It never grants or removes access. Tactical and Core still decide every call.
- **The Endpoints placement names are documented.** A module that adds a tab or a summary to the endpoint page now has the exact placement ids, the data it receives and how to read the agent id.

## For module developers

- `resourceViews.register()` accepts a column at `endpoint.grid-columns` with a `load(agentIds, { resource, placement, context, signal })` function instead of a component. Every other placement is unchanged and still needs `component`.
- Host methods on the module-scoped `resourceViews`: `gridColumns({ resource, ids, context })` and `loadGridColumns({ columns, agentIds, context, signal })`. At most 100 agent ids per call. A failed or late loader gives `failed` or `timeout` with no values. The time limit is the module register time limit.
- `context.tacticalScope()` returns `{ mode, unrestricted, whole_client_count, site_count }` as a fresh copy. An older Core gives `mode: 'none'`. `context.context.tactical_scope` carries the same value.
- See `docs/module-resource-views.md` (placement table, Grid columns) and `docs/module-runtime-api.md` (`tacticalScope()`).

## For the maintainer

- `src/resource-views.js`: grid column registration, `gridColumns`, `loadGridColumns`, and a `timeoutSeconds` getter option. The file stays import-free.
- `src/runtime-context.js`: `normalizeTacticalScope`. It fails closed: an unknown mode, a bad count, or an `unrestricted` flag that disagrees with the mode gives the `none` default. Any id list is dropped.
- `src/main.js`: passes the timeout getter to the registry and `tacticalScope` to modules, right after `hasTacticalPermission`.
- `tec_tac_package.json` now requires `tec-tac-framework` `>=1.17.17,<2.0.0`.
- Tests: `tests/endpoint-grid-columns-0.12.93.mjs`, `tests/tactical-scope-context-0.12.93.mjs`. Earlier tests that pinned the Core requirement now expect `>=1.17.17,<2.0.0`.
- `RELEASE_NOTES_0.12.92.md` moved to `docs/releases/`, as earlier releases were.
- Core's browser contract rows for `gridColumns`, `loadGridColumns` and `tactical_scope` are Core's to add (request in `reviews/requests/core.md`).
