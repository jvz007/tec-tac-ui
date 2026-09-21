# Tec-Tac UI 0.7.1

Corrective release for Module Repository validation.

- Deploys `VERSION` and `package.json` with the built runtime so framework compatibility checks can resolve the installed UI version.
- Module job polling starts immediately, reports polling failures instead of swallowing them, and refreshes installed/catalog state on every terminal job result.
- Failed module jobs use an explicit danger state rather than remaining visually indistinguishable from queued/running work.
