# Shared module code editor

Tec-Tac Core owns one local Monaco Editor runtime and exposes authenticated modules to it through the stable `codeEditor` module runtime contract. Modules must not import Monaco directly, load Monaco from a CDN, inspect Tactical frontend bundles, or depend on Tactical's hashed Monaco assets.

Monaco is a normal Tec-Tac UI dependency. Vite emits the editor code and workers beneath the persistent `/tec-tac/` deployment, so Tactical frontend upgrades do not own or replace the editor runtime.

## Available languages

Core currently supports these public language IDs:

- `html`
- `markdown`
- `plaintext`
- `css`
- `yaml`
- `json`
- `powershell`
- `bat`
- `python`
- `shell`
- `typescript`

YAML syntax highlighting is registered by Core. Jinja remains module-owned content layered into HTML, Markdown or plain text; Report Manager may add Jinja completions and commands without importing Monaco.

## Create an editor

Authenticated modules receive a module-scoped `codeEditor` object in `register(context)`.

```js
const editor = codeEditor.create(element, {
  language: 'html',
  value: '<h1>{{ client.name }}</h1>',
  readOnly: false,
  minimap: { enabled: false },
  wordWrap: 'off',
})
```

Core defaults are:

```js
{
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: 'off',
  renderWhitespace: 'selection',
  folding: true,
  bracketPairColorization: { enabled: true },
}
```

Modules may override editor construction options without receiving the raw Monaco object.

## Editor API

Each editor wrapper exposes:

```text
getValue()
setValue(value)
focus()
getSelection()
getSelectedText()
replaceSelection(text)
insertText(text)
setLanguage(language)
setReadOnly(boolean)
undo()
redo()
layout(dimension?)
getModel()
setModel(model)
dispose()
```

Selections, positions and ranges returned to modules are plain objects rather than Monaco classes.

### Events

```js
const change = editor.onChange(({ value, changes, versionId }) => {
  // module logic
})

const selection = editor.onSelectionChange(({ selection, source }) => {})
const cursor = editor.onCursorChange(({ position, source }) => {})

change.dispose()
selection.dispose()
cursor.dispose()
```

Every event registration returns a generic disposable handle.

## Models and model switching

Use Core-owned models for independent documents such as Report Manager's template, CSS and Variables/YAML content.

```js
const templateModel = codeEditor.createModel({
  id: 'report-template',
  language: 'html',
  value: '<main>...</main>',
})

const cssModel = codeEditor.createModel({
  id: 'report-css',
  language: 'css',
  value: 'main { padding: 1rem; }',
})

const variablesModel = codeEditor.createModel({
  id: 'report-variables',
  language: 'yaml',
  value: 'client:\n  name: Example',
})

const editor = codeEditor.create(element, { model: templateModel })
editor.setModel(cssModel)
editor.setModel(variablesModel)
editor.setModel(templateModel)
```

Models are automatically namespaced to the module. Model content and Monaco's undo/redo history live with the model. The Tec-Tac editor wrapper saves and restores editor view state when switching models so cursor and scroll position are retained where Monaco supports it.

Models expose:

```text
id
language
getValue()
setValue(value)
setLanguage(language)
dispose()
```

Modules should dispose models they no longer need. `codeEditor.clear()` is available on the module-scoped runtime and is used by Core when module registration fails.

## Completion providers

Modules can add editor intelligence through Tec-Tac's provider abstraction.

```js
const completion = codeEditor.registerCompletionProvider('html', {
  triggerCharacters: ['.', '{'],
  async provideCompletionItems({ model, position, word, triggerCharacter }) {
    return {
      suggestions: [
        {
          label: 'client.name',
          kind: 'variable',
          insertText: '{{ client.name }}',
          detail: 'Client display name',
          documentation: 'Resolved by Report Manager at render time.',
        },
      ],
    }
  },
})

completion.dispose()
```

Supported completion fields include `label`, `kind`, `insertText`, `snippet`, `detail`, `documentation`, `sortText`, `filterText` and an optional plain `range`.

Provider callbacks receive Tec-Tac model wrappers plus plain position/word context, not Monaco objects.

## Diagnostics providers

Modules can register syntax/lint diagnostics without importing Monaco or setting Monaco markers directly.

```js
const diagnostics = codeEditor.registerDiagnosticsProvider('powershell', {
  debounceMs: 350,
  async provideDiagnostics({ model, value, versionId, language }) {
    const result = await api('/api/scriptmanager/validate/', {
      method: 'POST',
      body: JSON.stringify({ shell: language, script: value }),
    })

    return result.errors.map((item) => ({
      severity: item.severity || 'error',
      message: item.message,
      startLineNumber: item.line,
      startColumn: item.column,
      endLineNumber: item.end_line || item.line,
      endColumn: item.end_column || item.column + 1,
      source: 'PowerShell',
      code: item.code,
    }))
  },
})

diagnostics.dispose()
```

The provider may be a function, or an object exposing `provideDiagnostics()`. It may return either an array or `{ diagnostics: [...] }`.

Supported diagnostic fields:

```text
severity: error | warning | info | hint
message
startLineNumber
startColumn
endLineNumber
endColumn
source (optional)
code (optional)
```

Core clamps marker ranges to the current model and translates the plain objects into Monaco markers internally. Providers are namespaced, so one module/provider cannot overwrite another provider's markers.

Diagnostics run when a matching model is created, when its language changes to the provider language, and after content changes. The default debounce is 300 ms and may be overridden with `debounceMs` (0-10000 ms). Async results are version checked: if the model changes while validation is running, the stale result is discarded rather than displayed.

Provider failures clear only that provider's markers and are logged by Core; they do not break the editor. Disposing a provider removes its listeners and markers. Core also disposes module-scoped providers if module registration fails or its editor scope is cleared.

Syntax validation must not execute script content. Script Manager should use parser/checker operations such as PowerShell's parser, Python `ast.parse()`, or `bash -n` on its backend rather than executing the script.

## Hover providers

```js
const hover = codeEditor.registerHoverProvider('html', async ({ word }) => {
  if (word !== 'client') return null
  return { contents: ['**client**', 'Current Tactical client/report context.'] }
})

hover.dispose()
```

Hover results may contain string or `{ value }` entries plus an optional plain range.

## Toolbar and commands

Report-specific controls remain owned by the module. A toolbar can call the generic editor contract directly:

```js
boldButton.onclick = () => {
  const selected = editor.getSelectedText()
  editor.replaceSelection(`**${selected}**`)
  editor.focus()
}

variableButton.onclick = () => editor.insertText('{{ client.name }}')
undoButton.onclick = () => editor.undo()
redoButton.onclick = () => editor.redo()
```

Core does not implement report formatting, Jinja, query builders, table builders or other module-specific commands.

## Theme behavior

Core observes the Tec-Tac document theme and updates Monaco globally:

- Tec-Tac `dark` -> Monaco `vs-dark`
- Tec-Tac `light` -> Monaco `vs`
- Tec-Tac `high-contrast` -> Monaco `hc-black`

Existing editors update in place. Modules do not need to rebuild editors or watch theme settings.

## Lifecycle and disposal

Provider registrations, models and editor instances returned through a module-scoped `codeEditor` are tracked by Core. A failed module registration triggers `codeEditor.clear()` alongside the other Core module-scoped registries. Normal components should still call `dispose()` for editors/models/listeners when their view is unmounted.

Tec-Tac module installs/updates reload the shell, which naturally tears down the current editor runtime before loading the new module set.

## Worker/runtime deployment

Core imports Monaco and its editor, HTML, CSS and JSON workers through Vite's worker pipeline. Vite emits worker assets into the Tec-Tac build and resolves them relative to the configured `/tec-tac/` base path.

There is no CDN dependency and no dependency on Tactical `/dist` asset names. The persistent Tec-Tac UI deployment remains the owner of all editor runtime assets.

## Reference module

`examples/code-editor-reference/` contains a development/reference module with HTML, CSS and YAML editors plus controls for insertion, selection replacement, undo, redo and language switching. It also registers a small completion provider so the provider lifecycle can be tested independently of Report Manager.
