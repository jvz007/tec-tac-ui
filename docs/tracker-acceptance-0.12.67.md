# Tracker acceptance — UI 0.12.67

This is the browser-side companion to Core 1.15.173. It consolidates the already accepted production implementations behind one executable acceptance entrypoint so the tracker does not have to infer one feature from evidence spread across several historical releases.

`tests/tracker-acceptance-0.12.67.mjs` runs the production-boundary regressions for:

- D2/D3 — validate → confirmed identity/version transition → validation-bound restore request;
- F1/F2 — My Account password and TOTP reset/re-enrol workflows over the real account HTTP helpers;
- F4 — backend Tactical UI values survive normalization and reach a loaded module at `register(context).context.tactical_ui`;
- F5/F6/F7 — relocation discovery, site/client delete-and-relocate, and custom-field GET/PATCH over the real Resource HTTP helpers;
- F8 — public module SSO provider registration and invocation;
- F9 — authenticated module header contribution;
- F10 — client/site context-menu registration, discovery and execution.

No new UI feature is introduced in this release.
