# Tec-Tac UI 0.6.3

## System Updates package intake consistency

- Replaces the header-only offline package file picker with the same Package Intake pattern used by Module Manager.
- Adds drag-and-drop for offline Framework/UI update packages.
- Keeps a Browse files fallback for keyboard and conventional file selection.
- Shows the selected package in a compact queue row before upload/inspection.
- Requires an explicit Inspect package action before staging the update.
- Keeps System Updates intentionally single-package; framework/UI updates remain bounded system operations rather than module-style multi-package plans.
- Reuses the existing package inspection, downgrade acknowledgement, install, rollback, and history workflow after inspection.

Framework compatibility: 1.6.1+
