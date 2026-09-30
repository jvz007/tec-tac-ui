# Tec-Tac UI 0.12.7

## Core audit runtime

- exposes module-scoped `audit.record(event)` through authenticated `register(context)`;
- binds the calling module ID in Core rather than accepting it from module event data;
- rejects module attempts to supply actor/provenance fields such as username, module version, source or correlation ID;
- uses the Framework `POST /api/tfd/audit/record/` contract;
- keeps audit transport failures non-fatal for already-successful UI actions and logs them to the browser console;
- documents the runtime and publishes it in Public Contracts.
