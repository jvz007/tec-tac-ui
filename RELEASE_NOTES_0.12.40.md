# Tec-Tac UI 0.12.40

## Session retention policy

- Adds the Core-owned session history retention control to Access > Session security.
- Validates 1-3650 days and participates in the existing unsaved-change guard.
- Explains that revoked trust tombstones remain while the underlying credential could still authenticate.
- Session diagnostics now show the effective Core retention value.
- Requires Tec-Tac Core 1.15.90 or later for the `history_retention_days` policy field.
