# User preferences

Tec-Tac UI 0.10.16 and Framework 1.13.9 introduce a Core-owned per-user preference profile.

## Ownership

Preferences belong to the authenticated Tactical user. The backend record is authoritative after sign-in. Browser storage is retained only as an early-startup cache and as a one-time migration source for settings created by older UI releases.

The authenticated endpoint is:

- `GET /api/tfd/ui/preferences/` — return the current user's normalized preferences.
- `PUT /api/tfd/ui/preferences/` — replace the current user's preferences.
- `DELETE /api/tfd/ui/preferences/` — reset the current user's preferences to Core defaults.

The current UI context also includes `preferences`, `preferences_initialized`, and `preferences_updated_at` so startup does not require an additional read request.

## Current preference sections

- `appearance.theme`
- `navigation.order`
- `navigation.favorites`
- `navigation.collapsed_sections`
- `navigation.rail_collapsed`
- `dashboard.default_dashboard_id` (reserved for the Dashboard framework)
- `dashboard.restore_last_dashboard`
- `extensions` (reserved namespace for future module-specific preferences)

Modules should not write directly to browser storage for durable user settings. Future module-specific preference contracts should use the Core-owned `extensions` namespace/API rather than creating independent persistence mechanisms.

## Dashboard preferences

Dashboard composition uses the server-backed preference profile:

- `dashboard.default_dashboard_id` selects the user's preferred visible dashboard.
- `dashboard.last_dashboard_id` tracks the most recently opened dashboard.
- `dashboard.restore_last_dashboard` controls whether the last dashboard takes priority over the default when opening the Dashboard workspace.

If a saved dashboard ID is no longer visible (for example a shared dashboard became private), Core safely falls back to another visible dashboard.

## Menu Layout (0.12.3)

`/preferences/menu-layout` is the canonical per-user menu arrangement surface. It persists `navigation.section_order` for category ordering and continues to use `navigation.order` for item ordering within each category. Category ownership is not editable: Core/module pages stay in the category assigned by their owner. Favorites remain a separate user shortcut layer and are not treated as an owned navigation category.

The shell resolves category order as: Favorites (when present), the user's saved section order, Core's default section order, then any newly introduced categories not yet present in the saved preference. This lets later Core/module releases add categories without invalidating existing user layouts.
