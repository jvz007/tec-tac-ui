# Tec-Tac UI 0.12.3

## Menu Layout

- Adds `/preferences/menu-layout` for per-user navigation arrangement.
- Users can reorder navigation categories and reorder items inside their owning category.
- Category ownership remains authoritative; pages cannot be moved between categories.
- Drag/drop and explicit up/down controls are both supported.
- Layout is stored in the existing server-backed preference profile.
- Reset affects navigation preferences only.

## Module Manager Open action

- Enabled modules with a successfully loaded authenticated UI and registered navigation route expose a small blue **Open** button next to the ENABLED status pill.
- Hidden-but-enabled modules keep their navigation contribution registered internally, so Module Manager can still deep-link to them without exposing them in the left rail.
- Disabled, failed, permission-skipped, or non-standalone modules do not expose Open.

## Compatibility

Requires Tec-Tac Framework 1.15.28 or newer for `navigation.section_order` persistence.
