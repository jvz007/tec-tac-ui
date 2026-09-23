# Tec-Tac UI 0.12.4

## Core Help and Knowledge Base

- Adds a Core-owned top-bar **?** Help button with route-aware contextual guidance.
- Adds the full searchable Knowledge Base at `/help` and deep-linkable `/help/<article-id>` routes.
- Adds a safe Core Markdown renderer for end-user documentation; raw HTML is escaped.
- Adds Core Help articles for the Tec-Tac interface and the first Core workspaces: Dashboards, Schedules, Scheduler Configuration, Modules, Access, System Updates, Storage & Housekeeping, Public Contracts, Preferences/Menu Layout and Help itself.

## Module Help contract

- Authenticated modules receive a module-scoped `help` runtime through `register(context)`.
- Modules can register inline Markdown or a packaged relative `help/*.md` source.
- Module article IDs are provider-scoped, route-aware, searchable and cleaned up automatically if module registration fails.
- `scripts/sync-modules.sh` now deploys an extension's `help/` directory beside its UI bundle.
- Public Contracts lists currently registered Help article contributions.
- Adds `docs/module-help.md` and extends the canonical UI design standards to prohibit private module help systems.

## Compatibility

- No Framework change is required for Help itself.
- Retains the 0.12.3 requirement of Tec-Tac Framework 1.15.28 or newer for server-backed menu section ordering.
