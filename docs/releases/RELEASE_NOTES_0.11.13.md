# Tec-Tac UI 0.11.13

## Quick Actions

- Adds a Core-owned per-user Quick Actions bar to the authenticated top bar.
- Navigation pages can be pinned from the navigation context menu or Quick Actions manager.
- Authenticated modules receive a module-scoped `quickActions` registry for safe, named browser actions.
- Supports preset/parameterized shortcuts such as a specific report or a probe scan for a selected target without storing arbitrary executable code.
- Quick Actions continue to enforce the provider's current UI permission/availability state and normal backend authorization.
- Pins are stored in the existing server-backed user preference profile under `extensions.core.quick_actions`.
- Adds reordering/removal, compact overflow handling, missing-provider diagnostics and Public Contracts discovery.

This release intentionally does not include the planned UI performance optimization pass; responsiveness work will follow after Quick Actions has been tested in production.
