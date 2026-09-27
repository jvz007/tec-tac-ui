# FIXING.md — UI 0.12.43

## Review scope

This release is intentionally limited to the **D5 Scheduler health regression gap** from Claude's tracker.

Review that:

1. The existing Scheduler Configuration `AuthorizationRevoked` warning still renders from backend health data.
2. Zero revoked runs hide the warning.
3. Nonzero revoked runs expose the count and latest schedule label.
4. Schedule name falls back to schedule id when needed.
5. The behavior is covered by an executable Node regression rather than only grep assertions.

## Files/areas changed

- `src/scheduler-health.js`
- `src/views/SchedulerSettingsView.vue`
- `tests/d5-scope-health.mjs`
- `package.json` test runner

## Expected outcome

D5's UI health-output coverage is behavioral without changing the established SHTF visual language.

## Explicitly out of scope

- Other Scheduler UI Low findings.
- U1–U4 except previously closed items.
- Historical release-note archive cleanup beyond normal current-release housekeeping.
