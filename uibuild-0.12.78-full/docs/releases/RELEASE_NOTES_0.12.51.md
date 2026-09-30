# Tec-Tac UI 0.12.51

## Dashboard request ordering

- Dashboard list refreshes now use a request generation gate.
- A slower earlier refresh can no longer overwrite dashboards returned by a newer request.
- Stale request failures cannot replace the active error state, and stale completions cannot clear the active loading indicator.
- Unmounting the dashboard view invalidates the current generation so a late response cannot mutate a destroyed view.
- Added regression coverage for request ordering, error/loading gating, and unmount invalidation.
