# Review scope: Tec-Tac UI 0.12.41

This release is intentionally narrow. Review only the tracker item below unless a regression is directly caused by this change.

## Tracker item in this release

### U3 - failed Account Protection save navigates away

Expected result:
- A rejected Account Protection policy save must reject back into the shared unsaved-change workflow.
- The pending navigation action must not run.
- Dirty state and the unsaved-change dialog must remain active.
- The operator's requested checkbox value must not be reset on failure.
- The failure message must be shown by the unsaved-change dialog.

Primary files:
- `src/components/access/AccountSecurityPanel.vue`
- `src/account-security-policy-save.js`
- `src/unsaved.js` (unchanged shared mechanism, exercised by regression)
- `tests/account-security-policy-save-flow.mjs`
- `tests/account-security-policy-ui.sh`

## Explicitly not in this release

- No other UI Medium or Low tracker items are addressed.
- No visual redesign was made; the existing Access > Account Protection surface is preserved.
