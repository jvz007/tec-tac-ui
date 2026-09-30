# Tec-Tac UI 0.11.8

- Fixes Module Manager lifecycle polling when a completed job contains a top-level `error` field.
- Failed module jobs now remain readable as normal 2xx job resources, allowing the UI to stop polling and render the actual terminal failure/log tail.
- Applies the same transport exception to System Update job resources.
- Tactical legacy 2xx error-payload handling remains enabled for normal API actions.
