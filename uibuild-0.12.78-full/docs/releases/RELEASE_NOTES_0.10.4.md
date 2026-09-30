# Tec-Tac UI 0.10.4

- Fixes the post-layout-migration installer path collision where sourcing `/opt/tec-tac/etc/tec-tac.conf` overwrote the UI repository root with the framework runtime `REPO_ROOT`.
- Uses a UI-specific `UI_SOURCE_ROOT` for build and deployment source files so `npm install`, Vite build, metadata copy, module sync and nginx repair always execute from `/opt/tec-tac-src/ui` (or the actual UI checkout).
- Adds regression coverage for central-config variable collisions.
