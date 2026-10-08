# Troubleshooting & Diagnostics

Troubleshooting & Diagnostics is the Core-owned, read-only system health page for Tec-Tac administrators.

It checks Framework/UI version discovery, Django system checks, migration state, Tactical/Tec-Tac services, Scheduler health, privileged helpers, module dependency/runtime state, capabilities, Public Contracts, the Audit write contract and runtime storage.

## Status meanings

- **PASS** — no action is required.
- **WARNING** — the system or feature can continue operating, but an issue should be corrected.
- **FAIL** — a required component or contract is not functioning correctly.

The normal page uses metadata-only capability discovery. **Live capability checks** explicitly run provider health callbacks and can take longer when an external service is slow or offline.

Diagnostics are read-only. Repair actions are intentionally not performed from this page.

## Browser security policy

Your browser enforces a Content Security Policy (CSP) for Tec-Tac. It is a list of places the page may load scripts, images and data from. It stops injected scripts and scripts from other sites.

By default the policy runs in **report-only** mode. Report-only blocks nothing. The page works as normal, and the browser notes anything the policy would have blocked.

To read a report-only line, open the browser console (F12). A line looks like `[Report Only] Refused to connect to 'https://x.example' because it violates the following Content Security Policy directive: "connect-src ..."`. Three parts matter:

- The **directive** (`connect-src`, `img-src`, `frame-src` and so on) says what kind of load it was.
- The **blocked address** says where the page tried to go.
- The page you were on says which screen needs the address.

The **Recent browser policy blocks** card on this page lists the same events, newest first, with a Copy button. It keeps the last 20 different ones in memory only. Nothing is stored and nothing is sent anywhere. Reloading the page clears it.

To switch to **enforce**, load every installed module page first and check that no `[Report Only]` lines appear. Then an administrator sets `TEC_TAC_CSP_MODE=enforce` in `/opt/tec-tac/etc/tec-tac.conf` and runs `sudo bash scripts/repair-nginx.sh` on the server. In enforce mode the browser blocks what the policy does not allow. Set the value back to `report-only` to undo it.
