# Tec-Tac UI 0.12.49

## Summary

Prevents stale System Update requests from overwriting newer release/branch state or clearing the busy indicator for a newer request.

## Changes

- Added a small keyed latest-request gate for independent Framework and UI request streams.
- System Update online-release checks now commit results, errors, and busy-state changes only when their request is still current.
- Branch discovery uses the same current-request rule, so a slower earlier response cannot replace a newer branch list or selected branch.
- Active request generations are invalidated when the view unmounts.

## Regression coverage

- `tests/latest-request-gate.mjs` verifies stale/current semantics, per-component isolation, and invalidation.
- `tests/ui-0.12.49.sh` verifies the real System Updates view is wired through both release and branch request gates.
