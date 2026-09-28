# UI 0.12.43

## D5 completion

- Scheduler Configuration now derives the existing AuthorizationRevoked warning state through a reusable pure helper.
- Added behavioral coverage for zero-count, visible-warning, schedule-name, and schedule-id fallback states.
- No visual design or operator workflow was changed.

## Tests

- `tests/d5-scope-health.mjs` executes the presentation-state helper with real payload shapes.
- Existing D5 wiring/navigation regression remains in the full UI suite.
