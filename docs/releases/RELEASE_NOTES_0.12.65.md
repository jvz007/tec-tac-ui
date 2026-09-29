# Tec-Tac UI 0.12.65

Tracker acceptance closure release. Requires Core 1.15.171.

## F4 — module-readable Tactical UI preferences
- Backend `tactical_ui` data is no longer dropped while normalizing `/api/tfd/ui/context/`.
- Authenticated modules receive the current Core context directly as `register(context).context`; `state.context` remains available for compatibility.
- Modules can read `context.tactical_ui.agent_dblclick_action`, `url_action_id` and `can_run_url_actions` without another account API call.

## F1/F2/F5-F10 acceptance workflows
- Adds an end-to-end regression that runs the actual My Account workflows over the actual account API helpers.
- Runs client/site relocation and custom-field workflows over the actual Resource API helpers.
- Runs the real public module loader with a Global Settings SSO provider.
- Runs the real authenticated module loader with an Alerts header contribution and client/site context actions.

## D2 / D3 restore UX
- Backup & Restore validation and destructive restore dispatch now use shared production workflow functions.
- Regression executes the real restore API helpers through validate -> completed validation job -> identity/version confirmation -> validation-bound restore request.

## Regression coverage
- `tests/tracker-final-closure-0.12.65.mjs`
- `tests/backup-restore-final-closure-0.12.65.mjs`
- complete inherited `npm test` suite
