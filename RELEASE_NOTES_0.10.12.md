# Tec-Tac UI 0.10.12

## Per-user navigation workspace

- Adds per-user navigation ordering stored by Tactical username.
- Navigation entries can be dragged to reorder them inside their existing category.
- New or newly visible module entries append naturally when no saved position exists.
- Adds a Favorites category that can contain shortcuts to any currently visible navigation item without moving the original entry.
- Favorites have their own independent saved order.
- Adds a navigation context menu with **Open in new tab** and **Add to Favorites / Remove from Favorites**.
- New-tab navigation uses Vue Router route resolution so core and dynamic module hash routes open correctly.
- Search mode preserves navigation order and disables drag reordering to avoid saving filtered layouts accidentally.

Preferences remain browser-local but are namespaced by authenticated Tactical username so users sharing a workstation do not inherit each other's layout.
