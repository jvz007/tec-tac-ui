# Tec-Tac UI 0.4.0

## Module Management v2

Tec-Tac UI 0.4.0 updates the Modules workspace for the dependency-aware lifecycle introduced by Tec-Tac Framework 1.4.0.

### Added

- Installed versus enabled module state in the Modules workspace.
- Enable and disable controls for managed modules.
- Dependency and dependant visibility for the selected module.
- Dependency/version compatibility status.
- Multi-package selection and inspection.
- Bundle package inspection.
- Dependency-ordered installation plan preview before execution.
- Batch/bundle lifecycle job progress and result handling.
- Dependency-safe disable workflow with explicit cascade confirmation when dependants are affected.
- Clear blocked-state messaging when a dependency, dependant, framework version, or UI version prevents an action.
- Disabled browser modules are omitted from the synchronized runtime module manifest.

### Behaviour changes

- Module installation is now plan-first: Tec-Tac shows what will be installed or replaced and in which order before starting the lifecycle job.
- Disabling a module hides its runtime navigation/UI without uninstalling its files or deleting module data.
- Existing modules remain enabled by default after upgrading.

### Compatibility

- Requires Tec-Tac Framework `>=1.4.0,<2.0.0`.
- The Open Tactical fallback remains available and unchanged until Tec-Tac replacement parity is proven.
