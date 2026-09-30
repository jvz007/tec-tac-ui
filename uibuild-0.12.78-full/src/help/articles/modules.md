# Modules

Module Manager controls installed Tec-Tac extensions, package intake, updates, runtime state, visibility, repositories and managed hotfixes.

## Enabled and visible are different

**Enabled** controls whether a module is active. **Visible** controls whether its normal navigation entry appears. An enabled hidden module can still provide capabilities or be opened directly when it has a usable route.

## Package inspection

Uploaded packages and bundles are inspected before installation. Bundles can contain multiple modules and the inspection plan shows each module and the action Core intends to perform.

## Open

When an enabled module has loaded its authenticated UI successfully, the small blue **Open** button in Module Detail takes you directly to its main page, even if its navigation entry is globally hidden.

## Dependencies

Hard dependencies and dependants are shown in Module Detail. Core resolves install/update plans before lifecycle execution.
