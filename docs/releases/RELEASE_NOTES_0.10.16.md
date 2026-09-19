# Tec-Tac UI 0.10.16

## User preferences

- Adds a Core-owned `/preferences` page accessible from the authenticated user controls.
- Moves theme, navigation order, Favorites, collapsed categories and rail state onto the server-backed per-user preference profile provided by Framework 1.13.9.
- Migrates existing browser-local navigation/theme settings into the server profile on first sign-in when no server profile exists.
- Keeps a browser cache only for early startup rendering/fallback; authenticated server preferences remain authoritative.
- Adds dashboard preference placeholders (`default_dashboard_id` and `restore_last_dashboard`) so the upcoming shared/private dashboard system has a stable home.
- Adds reset-navigation and reset-all preference controls.
