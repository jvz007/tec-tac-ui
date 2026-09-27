# Tec-Tac UI 0.12.39

- Scheduler Configuration now surfaces `AuthorizationRevoked` skips from the last 24 hours and identifies the latest affected schedule.
- Updated Scheduler help to explain runtime authorization-revocation visibility.
- Clients & Sites navigation is now hidden unless the current Tactical context has `can_list_clients` (effective superusers remain visible through Core capability resolution).
- Requires Tec-Tac Framework 1.15.88 or newer for the unified scope/health contract.
