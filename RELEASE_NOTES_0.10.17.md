# Tec-Tac UI 0.10.17

## Shared Core Monaco editor runtime

- Added `monaco-editor` as a Tec-Tac-owned UI dependency; no CDN and no Tactical `/dist` editor dependency.
- Added Vite-managed editor, HTML, CSS and JSON workers emitted beneath the `/tec-tac/` build base.
- Added authenticated module runtime `codeEditor` capability instead of exposing raw Monaco.
- Added editor wrapper operations for value, focus, selection, insert/replace, language, read-only, undo/redo, layout, model switching and disposal.
- Added `onChange`, `onSelectionChange` and `onCursorChange` disposable event contracts.
- Added module-namespaced models with independent content/undo history and editor view-state restoration while switching.
- Added HTML, Markdown, plaintext, CSS, YAML and JSON public language IDs. YAML highlighting/configuration is Core-owned.
- Added completion and hover provider abstractions with module-scoped cleanup.
- Added automatic Monaco theme synchronization for Tec-Tac dark, light and high-contrast themes.
- Added Public Contracts visibility for the shared editor capability.
- Added `docs/module-code-editor.md` and a code-editor reference module with HTML/CSS/YAML editors and editing controls.
