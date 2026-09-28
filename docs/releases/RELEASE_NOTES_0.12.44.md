# Tec-Tac UI 0.12.44

## Access and Scheduler lifecycle hardening

- Account Security policy state/save/unsaved-navigation behavior now lives in a directly testable composable used by the real panel.
- Failed policy saves preserve the requested value, dirty state, unsaved dialog, and pending navigation.
- Clients & Sites navigation visibility has behavioral coverage for allowed, denied, and superuser contexts.
- Scheduler history tabs no longer show `0 runs` before history has loaded.
- Background Scheduler refresh keeps populated content visible.
- Scheduler history errors no longer clear or overwrite unrelated Scheduler errors.
- If a refresh requests a history page beyond the new last page, the UI re-requests the last valid page.

## Regression coverage

- `tests/account-security-policy-panel-lifecycle.mjs`
- `tests/core-navigation-resources.mjs`
- `tests/scheduler-history-state.mjs`
