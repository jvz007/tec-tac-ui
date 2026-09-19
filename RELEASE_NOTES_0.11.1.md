# Tec-Tac UI 0.11.1

## Script language modes and diagnostics

- Extends the Core-owned `codeEditor` contract with `powershell`, `bat`, `python`, `shell`, and `typescript` language IDs.
- Bundles the Monaco TypeScript contribution and worker through Tec-Tac/Vite-owned assets.
- Adds module-scoped `codeEditor.registerDiagnosticsProvider(language, provider)`.
- Core translates plain diagnostic objects into Monaco markers while keeping Monaco private.
- Diagnostics support `error`, `warning`, `info`, and `hint` severities plus source/code metadata.
- Validation runs on matching model creation, language changes, and debounced content changes.
- Async diagnostics are model-version guarded so stale validator results are discarded.
- Provider markers/listeners are namespaced and removed on provider disposal or module-scope cleanup.
- The code editor reference module now exercises diagnostics and script-language switching.

No framework update is required for this UI release.
