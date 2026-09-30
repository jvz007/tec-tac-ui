# Tec-Tac UI 0.12.35

## Bounded operational history views

- Module lifecycle history now consumes 50-row server-side pages instead of requesting a fixed 250-row history block.
- Module history displays the API total/page state with Previous/Next navigation and keeps populated data visible during refresh.
- Core Session Security audit now consumes 50-row server-side pages instead of a user-selected fixed limit up to 1000 rows.
- Session audit displays total/page state and Previous/Next navigation while preserving the existing username and event-type filters.
- Added UI regression coverage for both pagination contracts.

## Compatibility

No route or permission change. This UI expects the additive pagination metadata introduced by Core 1.15.82 while retaining safe fallbacks for count-only responses.
