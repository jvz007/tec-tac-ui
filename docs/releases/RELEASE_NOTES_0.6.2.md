# Tec-Tac UI 0.6.2

## Fixes

- Fixes module navigation remaining hidden after an operator selects **Show** when the module package or module `register()` supplies `visible: false`.
- The resolved module visibility descriptor is now authoritative at runtime.
- Module-supplied navigation visibility is treated only as a package default and cannot override persisted Module Manager state.

## Visibility precedence

1. Operator override in Module Manager / `module-state.json`
2. Package-declared default visibility
3. Visible by default

Framework 1.6.1 or newer is required.
