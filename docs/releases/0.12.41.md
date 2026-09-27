# Tec-Tac UI 0.12.41

## Account Protection failed-save workflow

- U3: a failed save from the global unsaved-change dialog now keeps the operator on the Account Protection page.
- The requested checkbox value is preserved after failure so the operator can retry or deliberately discard it.
- The save error is rethrown to the global unsaved-change workflow, which keeps the dialog open and displays the failure instead of navigating away.

## Regression coverage

- Added `tests/account-security-policy-save-flow.mjs`, which behaviorally exercises a failed policy save through the shared unsaved-change workflow and asserts that navigation does not occur, dirty state remains set, the dialog remains open, the error is shown, and the requested value is unchanged.
