# Fixing / review notes — UI 0.12.66

Tracker done-when evidence: dedicated production-boundary regressions for F1/F2/F4-F10 while retaining the 0.12.65 D2/D3 production restore workflow coverage.


Tracker acceptance closure: preserves `tactical_ui` in runtime context, exposes direct `register(context).context`, and exercises F1/F2/F4-F10 plus D2/D3 through the actual production API/workflow/module-loader boundaries. Regressions: `tests/tracker-final-closure-0.12.65.mjs`, `tests/backup-restore-final-closure-0.12.65.mjs`.

Module-development readiness: Public Contracts now renders Core's static browser/UI runtime catalog separately from live provider registrations, with behavioral filtering coverage. Regression: `tests/browser-contract-catalog-0.12.64.mjs`.

Tracker closure focus: D2, D3 and F1-F10. Replaces remaining source-wiring assertions with production workflow/consumer behavior tests and raises the Core floor to 1.15.169 for module-readable Tactical UI context.
# Fixing 0.12.61

- Final D2/D3 behavioral closure: the Backup & Restore view consumes the tested recovery review model for identity and downgrade confirmation copy.

# Fixing 0.12.57-2

- Blocking review fix: ResourcesView imported the old site-search helpers but used `createResourceSiteSearchCoordinator` without importing it.
- Added direct SFC import regression.

# Fixing — UI 0.12.55

Module hotfix history is now protected from out-of-order module-selection requests.

Regression: `tests/ui-0.12.55.mjs`.


## 0.12.62

Feature completion: F8 public SSO provider hooks, F9 module header contributions, and F10 Clients & Sites context actions. Regression: `tests/extension-hooks-0.12.62.mjs`.

## 0.12.58-1

Tracker closure focus: D2 and D3. Added the missing native Backup & Restore page, exact source identity/signer display, Core-version transition warning, and validation-gated destructive confirmation.
