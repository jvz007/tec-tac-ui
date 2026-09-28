# Tec-Tac UI 0.12.50

## Help request lifecycle hardening

- Help article hydration/loading now uses the shared latest-request gate.
- A slower request for an article selected earlier can no longer publish an error or loading completion into a newer selection.
- Returning to the Help index invalidates in-flight article requests, and unmounting the view invalidates the active generation.

## Regression coverage

- Added `tests/ui-0.12.50.mjs` / `tests/ui-0.12.50.sh` to verify request generations and the real HelpView wiring.
