# UI 0.12.88

Released 9 October 2026. Needs Core 1.17.10 or later (Core 1.17.9 for the replacement fields, 1.17.10 for `registered_mismatch`).

## What changes for you

- **Modules shows replacement state in plain English.** When a module replaces a core module (AD-20), its row says "replaces <module>" and the detail panel has a Replacement section. It tells you whether the replacement is active, and if not, why in a short sentence. It lists any capability that does not match. When the replacement is active but some contracts are not registered yet, it says so calmly and notes that other modules calling them may see them as unavailable.
- **A capability registered at the wrong version is explained.** If the replacement registered a capability at a different major version, or a lower version, than it declares, Core refuses it. The panel says which capability, which versions, and that it stays unavailable until the module is fixed and Tec-Tac restarts.
- **The replaced core module says so too.** Its row says "replaced by <module>". The detail panel explains that the replacement serves its routes and contracts while active, and that Core never runs both.
- **Clear sentences instead of problem codes.** In an install plan, a blocked replacement shows Core's own sentence and what to do ("Disable <module> first, then try again", or the capabilities to fix). An enable that Core refuses shows Core's sentence as it is.
- **Older Cores.** A field an older Core does not send shows nothing. Nothing breaks.

Not in this release: the prompt that asks you to confirm before a replacement disables a module. Core 1.17.10 never disables a module for you, so there is nothing to confirm yet. It follows the Core change.

## For module authors

- **`context.tacticalOperation` is now bound to your module.** The signature is the same: `tacticalOperation(moduleId, operationId, options)`. Core checks the module id in the URL, but cannot tell which module's code made the call. The shell now refuses another module's id before any request, with an error whose `status` is 0 and a message naming your module and the ids it may use. A module that replaces a core module under AD-20 may also use that core module's id. The shell reads it from `descriptor.replaces`, else from the `replaces` field of the module's `module_status` row. Core does not send that field yet, so until it does, a replacement can pass only its own id. After a failed or timed-out `register()`, every call is refused with the same "was abandoned" error as the other registries.
- Validation order: id syntax, then scope, then `params` and `body`, then the request.
- No module under `modules/` uses `tacticalOperation` today, so nothing breaks. Checks and Agents pass their own id when they switch.
- `docs/module-runtime-api.md` now states what Core checks, what the shell checks, and shows the replaced-module case.

## Requirements

Core 1.17.10 or later. The package now requires `tec-tac-framework >=1.17.10,<2.0.0` (UI Q15 in `reviews/questions/ui.md`).

## Under the hood

- New `src/module-replacement.js`, import-free: `replacementSummary(row)`, `replacementProblemText(problem)`, `registeredMismatchText(item)` and label helpers. `ModulesView.vue` renders them through text bindings only.
- `bindTacticalOperation(operation, { moduleId, replaces, isAbandoned })` lives in `src/module-loader.js`, not `src/tactical-operations.js`, because the loader is loaded by older tests as a data: URL and may not gain relative imports. `main.js` still passes the one shared helper to the loader.
- Tests: `tests/tactical-operation-scope-0.12.88.mjs` and `tests/module-replacement-status-0.12.88.mjs`.
