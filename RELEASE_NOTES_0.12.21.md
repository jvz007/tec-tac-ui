# Tec-Tac UI 0.12.21

## Scheduler recovery UX

- A schedule with queued/running work still refuses normal deletion.
- When Core returns `active_runs`, the delete dialog switches to an explicit force-delete recovery flow showing the active-run count.
- Force delete requires typing the schedule name and clearly states that active runs will be failed while execution history is retained.
- Scheduler API client supports the Core `force=true` delete contract.
- Scheduler help now documents stale-run recovery, missed-run history and force deletion.
