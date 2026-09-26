# Tec-Tac UI 0.12.37

## Scheduler history scale pass

- Scheduler run history now loads in 50-row server pages instead of truncating a locally loaded history set.
- User and module history are loaded only when their history tab is opened; normal Scheduler page startup no longer fetches run history.
- Run-history search is server-side and debounced by 300 ms.
- Added real total/page state and Previous/Next navigation.
- Existing history rows stay visible during background refresh.
- Search request races are ignored so stale responses cannot replace newer results.
- Added timer cleanup when the Scheduler view is destroyed.
- Requires Tec-Tac Framework 1.15.84 or newer for the paged Scheduler history contract.
