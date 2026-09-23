# Tec-Tac UI 0.12.0

## Cross-module resource views

Tec-Tac now exposes a Core-owned `resourceViews` registry to authenticated modules. Provider modules can contribute visual components to stable resource/placement surfaces owned by another module without direct UI imports or hard dependencies.

The contract is module-scoped, permission-aware, ordered, cleaned up on failed module registration, visible in Public Contracts, and designed to degrade cleanly when optional providers are disabled or absent.

See `docs/module-resource-views.md`.

## Navigation search clear

The left-navigation search now displays a small clear button whenever a query is present. Pressing Escape while the search field is focused also clears the query.
