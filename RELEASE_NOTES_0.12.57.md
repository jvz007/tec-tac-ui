# Tec-Tac UI 0.12.57

## Blocking review fix

- Fixes the Clients & Sites client-change flow so an active site search is cleared before the immediate site reload for the newly selected client.
- `createResourceSiteSearchCoordinator()` now owns the ordering boundary: cancel pending search work, arm one-shot suppression when needed, clear the visible search through the injected callback, then load the new client's sites.
- The `selectedClientId` watcher delegates directly to the coordinator instead of assigning a returned search value after the load has already started.

## Regression coverage

- `tests/ui-l69-resource-search-0.12.57.mjs` records the live search value at `loadImmediate()` time and requires it to be empty while also proving exactly one load occurs.
- `tests/ui-0.12.57-1.mjs` verifies the real `ResourcesView.vue` import and coordinator wiring.
- `tests/ui-0.12.57.mjs` locks the clear-before-load ordering in the production coordinator.
