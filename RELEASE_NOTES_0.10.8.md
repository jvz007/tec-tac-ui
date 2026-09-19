# Tec-Tac UI 0.10.8

0.10.8 adds the Core-owned browser context-action contract requested by the Endpoints module.

- adds `contextActions.register`, `contextActions.list`, and `contextActions.execute` to authenticated module runtime context;
- context action IDs are provider-scoped (`<module-id>.*`) and duplicate ownership is rejected;
- actions declare resource type, placements, selection limits, permission hints, grouping/order, visibility/availability predicates and dangerous-operation metadata;
- providers own execution; consumers never import another module's UI internals;
- partial action registrations are removed if module registration fails;
- the registry is provided to the shell as `tecTacContextActions` for shared UI consumers;
- Public Contracts now includes a live **UI runtime context actions** section populated from the browser registry;
- adds `docs/context-actions.md` as the module-developer contract.

This release retains 0.10.7 lifecycle cache invalidation and 0.10.6 content-hashed module entry/route-ownership protections.
