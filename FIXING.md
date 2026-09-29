# Fixing / review notes — UI 0.12.62

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
