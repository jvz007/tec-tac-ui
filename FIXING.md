# FIXING.md — UI 0.12.44

## Review scope

This release is limited to the remaining UI lifecycle/navigation/Scheduler-history findings:

- U3 / L87: Account Security failed-save unsaved-navigation lifecycle.
- L67: Clients & Sites navigation visibility follows `list_clients` / superuser context.
- L71: history tabs do not claim `0 runs` before first successful history load.
- L72: background refresh preserves visible content and history pagination recovers to the last valid page.
- L73: Scheduler history errors are isolated from unrelated page errors.

## Expected outcome

The real Account Security panel uses the tested lifecycle helper, and Scheduler history refresh/search state stays stable under failures and paging changes.

## Explicitly out of scope

- Other UI low findings.
- Core changes.
- Unrelated visual redesign.
