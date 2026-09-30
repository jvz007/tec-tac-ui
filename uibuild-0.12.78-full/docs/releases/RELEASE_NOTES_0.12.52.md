# Tec-Tac UI 0.12.52

## Help drawer request ordering

- Context Help drawer article loads now use the same latest-request generation pattern as the full Knowledge Base view.
- A slower earlier article request can no longer publish its error or clear the loading indicator after the user selects a newer article.
- Closing the drawer and unmounting the component invalidate the active article request.
- Added regression coverage for article switches, drawer-close invalidation, stale error/loading suppression, and unmount cleanup.
