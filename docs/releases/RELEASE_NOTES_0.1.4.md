# Tec-Tac UI 0.1.4

## Focus

Role-editing continuity and unsaved-change protection.

## Changes

- Newly created Tactical roles are refreshed from Tactical, automatically selected, and scrolled into view.
- The Roles editor tracks a clean baseline for the selected role across native Tactical permissions and Tec-Tac extension permissions.
- Any role-name, superuser, Tactical-permission, or extension-permission change marks the editor as dirty.
- A persistent warning banner appears while changes are unsaved and provides **Save now** and **Discard** actions.
- The role header also shows an **UNSAVED** state.
- The primary Save action is disabled while there are no changes to save.
- Switching roles while dirty is guarded.
- Switching Access tabs, navigating to another Tec-Tac workspace, opening Tactical, or signing out while dirty opens a three-way decision dialog:
  - Save & continue
  - Discard & continue
  - Stay here
- Browser refresh/close receives the browser's native unsaved-changes warning while the role editor is dirty.
- Selected roles have a stronger visual focus treatment.

## Scope

No backend/framework change is required for this release. Tec-Tac backend 1.1.0 remains the paired RBAC backend baseline.
