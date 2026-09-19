# Tec-Tac UI 0.11.0

## Core dashboard system

- Replaces the static Overview page with the Core Dashboard workspace.
- Adds private and shared dashboards backed by Framework 1.14.0.
- Adds grouped My Dashboards / Shared Dashboards selection.
- Adds create, edit, delete and owner-controlled private/shared switching.
- Adds per-user default dashboard and last-dashboard restore behavior.
- Adds drag reordering and width/height resizing for dashboard widget instances.
- Preserves unavailable/permission-gated widget instances in saved layouts without rendering provider content.
- Adds Core Session, Module Runtime and Access Summary widgets so dashboards are usable immediately.

## Dashboard module contract

- Adds the authenticated module-scoped `dashboardWidgets` capability.
- Widget IDs are provider-namespaced.
- Optional widget permissions are enforced by Core.
- Failed module registration clears partially registered dashboard widgets.
- Public Contracts enumerates currently available dashboard widget contributions.
- Adds `docs/module-dashboard-widgets.md`.

## Navigation

- Moves the existing Search modules field from the top bar into a sticky search block at the top of the left navigation rail.
