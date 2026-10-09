# Modules

Module Manager controls installed Tec-Tac extensions, package intake, updates, runtime state, visibility, repositories and managed hotfixes.

The module start-up time limit now lives on **System Configuration** (Administration menu).

## Enabled and visible are different

**Enabled** controls whether a module is active. **Visible** controls whether its normal navigation entry appears. An enabled hidden module can still provide capabilities or be opened directly when it has a usable route.

## Category

Every module belongs to a category. The **Category** column and the module panel show it.

- **Core** modules wrap one part of Tactical RMM's own API.
- **Server** modules look after the Tec-Tac or Tactical server itself.
- **Premium** modules add things Tactical RMM does not have.
- **Test** modules are for development.

A module that does not state a category shows **Not stated, treated as Test**. The module panel then shows the note Core sends, which says what Core does with it on this server. Use the category list next to the search box to show one kind of module. **Not stated** lists the modules that still need a category in their next release. The search box also matches the category name.

## Package inspection

Uploaded packages and bundles are inspected before installation. Bundles can contain multiple modules and the inspection plan shows each module and the action Core intends to perform.

## Open

When an enabled module has loaded its authenticated UI successfully, the small blue **Open** button in Module Detail takes you directly to its main page, even if its navigation entry is globally hidden.

## Dependencies

Hard dependencies and dependants are shown in Module Detail. Core resolves install/update plans before lifecycle execution.
