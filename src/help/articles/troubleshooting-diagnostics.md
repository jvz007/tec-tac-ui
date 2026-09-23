# Troubleshooting & Diagnostics

Troubleshooting & Diagnostics is the Core-owned, read-only system health page for Tec-Tac administrators.

It checks Framework/UI version discovery, Django system checks, migration state, Tactical/Tec-Tac services, Scheduler health, privileged helpers, module dependency/runtime state, capabilities, Public Contracts, the Audit write contract and runtime storage.

## Status meanings

- **PASS** — no action is required.
- **WARNING** — the system or feature can continue operating, but an issue should be corrected.
- **FAIL** — a required component or contract is not functioning correctly.

The normal page uses metadata-only capability discovery. **Live capability checks** explicitly run provider health callbacks and can take longer when an external service is slow or offline.

Diagnostics are read-only. Repair actions are intentionally not performed from this page.
