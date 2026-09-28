# Tec-Tac UI 0.12.42

## D1 completion — L87

- Replaced most grep-only Account Protection regression coverage with executable behavior tests.
- Added direct account-security-policy API helper tests for GET/PUT endpoint, method and boolean payload semantics.
- Retained the executable failed-save/unsaved-navigation lifecycle regression that catches the U3 class of bug.
- Reduced the shell test to behavioral execution plus minimal component wiring assertions.
