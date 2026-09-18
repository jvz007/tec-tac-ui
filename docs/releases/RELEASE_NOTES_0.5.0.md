# Tec-Tac UI 0.5.0

Modernized Module Management package installation workflow.

## Added

- Drag-and-drop package/bundle intake with multi-file selection.
- Local pre-upload queue with remove and reorder controls.
- Inspected install queue showing package identity, version, action and dependencies.
- Drag and keyboard-friendly move controls for ordering independent packages.
- Required dependency sequencing is enforced: invalid moves are rejected with a specific explanation.
- The selected order is submitted to Framework 1.5.0, which validates it again before privileged execution.
- Cancelled staged uploads are discarded through the v2 staging API.

## Fixed

- The navigation footer UI version is no longer hardcoded; it is injected from package.json at build time.

## Requirements

- Tec-Tac Framework 1.5.0+ for explicit install ordering and staged-artifact cleanup.
