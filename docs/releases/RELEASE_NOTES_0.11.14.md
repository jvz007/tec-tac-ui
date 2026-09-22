# Tec-Tac UI 0.11.14

## Quick Actions contract correction

Quick Actions are now exclusively executable actions owned by the module that provides the function. Core owns the top-bar surface, per-user persistence, ordering, availability/permission checks, invocation shell and diagnostics; it does not turn navigation links into Quick Actions.

- removed page/navigation shortcuts from the Quick Actions manager and navigation context menu;
- existing 0.11.13 route pins are ignored after upgrade and no longer appear in the top bar;
- module actions continue to register through the module-scoped `quickActions` runtime contract;
- modules may pin configured action instances with safe preset parameters, for example a specific probe scan or report;
- invoking a Quick Action executes the owning module's registered handler, allowing that module to open its own modal/workflow or call its normal authenticated backend API;
- Core continues to enforce registered-action ownership, permission visibility, bounded parameters and provider lifecycle cleanup.

This release intentionally contains no performance optimization work; responsiveness changes are deferred to the next dedicated build.
