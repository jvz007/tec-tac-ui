# Tec-Tac UI 0.12.55

## Summary

Tracker-closure release for the remaining UI items in `CORE-UI-REVIEW-1.15.84-0.12.37`. No unrelated UI hardening is included.

## Tracker closure work

- **L64**: behaviorally verifies clipboard rejection/unavailability is surfaced on System Updates, TOTP enrollment and MFA recovery instead of silently failing.
- **L69**: behaviorally verifies changing client while a site search is active performs one immediate site load and consumes the synthetic search reset exactly once.
- **L73**: behaviorally verifies Scheduler history failures update only `historyError` and preserve unrelated Scheduler errors and existing rows.
- **L74**: release-gates the recovered 0.12.32-0.12.35 archive plus canonical clean-version release-note identities.
- Added `tests/ui-tracker-open-closure-0.12.55.mjs` and wired it into `npm test` so all four remaining UI tracker rows are first-class release regressions.

## Compatibility

No backend contract or route changes.
