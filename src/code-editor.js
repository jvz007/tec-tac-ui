import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/basic-languages/monaco.contribution'
import 'monaco-editor/esm/vs/language/html/monaco.contribution'
import 'monaco-editor/esm/vs/language/css/monaco.contribution'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import TypeScriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

const SUPPORTED_LANGUAGES = Object.freeze(['html', 'markdown', 'plaintext', 'css', 'yaml', 'json', 'powershell', 'bat', 'python', 'shell', 'typescript'])
const DEFAULT_OPTIONS = Object.freeze({
  automaticLayout: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: 'off',
  renderWhitespace: 'selection',
  folding: true,
  bracketPairColorization: { enabled: true },
})

let workersConfigured = false
let yamlConfigured = false
let autoModelCounter = 0

function configureWorkers() {
  if (workersConfigured || typeof self === 'undefined') return
  self.MonacoEnvironment = {
    ...(self.MonacoEnvironment || {}),
    getWorker(_moduleId, label) {
      if (label === 'json') return new JsonWorker()
      if (['typescript', 'javascript'].includes(label)) return new TypeScriptWorker()
      if (['css', 'scss', 'less'].includes(label)) return new CssWorker()
      if (['html', 'handlebars', 'razor'].includes(label)) return new HtmlWorker()
      return new EditorWorker()
    },
  }
  workersConfigured = true
}

function configureYaml() {
  if (yamlConfigured) return
  if (!monaco.languages.getLanguages().some((item) => item.id === 'yaml')) {
    monaco.languages.register({ id: 'yaml', extensions: ['.yaml', '.yml'], aliases: ['YAML', 'yaml', 'YML', 'yml'] })
    monaco.languages.setLanguageConfiguration('yaml', {
      comments: { lineComment: '#' },
      brackets: [['{', '}'], ['[', ']']],
      autoClosingPairs: [
        { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '"', close: '"' }, { open: "'", close: "'" },
      ],
      surroundingPairs: [
        { open: '{', close: '}' }, { open: '[', close: ']' }, { open: '"', close: '"' }, { open: "'", close: "'" },
      ],
    })
    monaco.languages.setMonarchTokensProvider('yaml', {
      tokenizer: {
        root: [
          [/^\s*#.*/, 'comment'],
          [/^\s*---\s*$/, 'delimiter'],
          [/^\s*\.\.\.\s*$/, 'delimiter'],
          [/[\w.-]+(?=\s*:)/, 'key'],
          [/[-?:,\[\]{}]/, 'delimiter'],
          [/\b(true|false|null|yes|no|on|off)\b/i, 'keyword'],
          [/-?\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/'[^']*'/, 'string'],
          [/[|>][-+]?/, 'string'],
        ],
      },
    })
  }
  yamlConfigured = true
}

function assertLanguage(language) {
  const normalized = String(language || 'plaintext').toLowerCase()
  if (!SUPPORTED_LANGUAGES.includes(normalized)) {
    throw new Error(`Unsupported Tec-Tac editor language: ${normalized}`)
  }
  return normalized
}

function themeForDocument() {
  const theme = typeof document !== 'undefined' ? document.documentElement.dataset.theme : 'dark'
  if (theme === 'light') return 'vs'
  if (theme === 'high-contrast') return 'hc-black'
  return 'vs-dark'
}

function plainPosition(position) {
  if (!position) return null
  return { lineNumber: position.lineNumber, column: position.column }
}

function plainRange(range) {
  if (!range) return null
  return {
    startLineNumber: range.startLineNumber,
    startColumn: range.startColumn,
    endLineNumber: range.endLineNumber,
    endColumn: range.endColumn,
  }
}

function toRange(range) {
  if (!range) return null
  return new monaco.Range(
    Number(range.startLineNumber), Number(range.startColumn),
    Number(range.endLineNumber), Number(range.endColumn),
  )
}

function disposable(dispose) {
  let active = true
  return Object.freeze({
    dispose() {
      if (!active) return
      active = false
      dispose?.()
    },
  })
}

function completionKind(kind) {
  const key = String(kind || 'text').replace(/[-_\s]/g, '').toLowerCase()
  const kinds = {
    text: 'Text', method: 'Method', function: 'Function', constructor: 'Constructor', field: 'Field',
    variable: 'Variable', class: 'Class', interface: 'Interface', module: 'Module', property: 'Property',
    unit: 'Unit', value: 'Value', enum: 'Enum', keyword: 'Keyword', snippet: 'Snippet', color: 'Color',
    file: 'File', reference: 'Reference', folder: 'Folder', enummember: 'EnumMember', constant: 'Constant',
    struct: 'Struct', event: 'Event', operator: 'Operator', typeparameter: 'TypeParameter',
  }
  return monaco.languages.CompletionItemKind[kinds[key] || 'Text']
}

function normalizeDocumentation(value) {
  if (value == null) return undefined
  if (typeof value === 'string') return { value }
  if (typeof value?.value === 'string') return { value: value.value }
  return { value: String(value) }
}

function createServiceScope(ownerId, service) {
  const owner = String(ownerId || 'core').trim() || 'core'
  const resources = new Set()

  const track = (resource) => {
    if (resource?.dispose) resources.add(resource)
    return resource
  }

  const api = {
    languages: SUPPORTED_LANGUAGES,
    defaults: DEFAULT_OPTIONS,
    create(element, options = {}) { return track(service.create(owner, element, options)) },
    createModel(options = {}) { return track(service.createModel(owner, options)) },
    registerCompletionProvider(language, provider) { return track(service.registerCompletionProvider(owner, language, provider)) },
    registerHoverProvider(language, provider) { return track(service.registerHoverProvider(owner, language, provider)) },
    registerDiagnosticsProvider(language, provider) { return track(service.registerDiagnosticsProvider(owner, language, provider)) },
    clear() {
      for (const resource of [...resources].reverse()) {
        try { resource.dispose() } catch {}
      }
      resources.clear()
    },
  }
  return Object.freeze(api)
}

export function createCodeEditorService() {
  configureWorkers()
  configureYaml()
  monaco.editor.setTheme(themeForDocument())

  const nativeToWrapper = new WeakMap()
  const scopes = new Map()
  const providerStats = new Map()
  let diagnosticsProviderCounter = 0

  const observer = typeof MutationObserver !== 'undefined' && typeof document !== 'undefined'
    ? new MutationObserver((mutations) => {
        if (mutations.some((item) => item.type === 'attributes' && item.attributeName === 'data-theme')) {
          monaco.editor.setTheme(themeForDocument())
        }
      })
    : null
  observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  function wrapModel(owner, nativeModel, publicId) {
    const existing = nativeToWrapper.get(nativeModel)
    if (existing) return existing
    let disposed = false
    const wrapper = Object.freeze({
      id: publicId,
      get language() { return nativeModel.getLanguageId() },
      getValue() { return nativeModel.getValue() },
      setValue(value) { nativeModel.setValue(String(value ?? '')) },
      setLanguage(language) { monaco.editor.setModelLanguage(nativeModel, assertLanguage(language)) },
      dispose() {
        if (disposed) return
        disposed = true
        if (!nativeModel.isDisposed()) nativeModel.dispose()
      },
    })
    nativeToWrapper.set(nativeModel, wrapper)
    return wrapper
  }

  function createModel(owner, options = {}) {
    const language = assertLanguage(options.language)
    const id = String(options.id || `model-${++autoModelCounter}`).trim()
    if (!id) throw new Error('codeEditor.createModel() requires a non-empty id when one is supplied.')
    const uri = monaco.Uri.parse(`inmemory://tec-tac/${encodeURIComponent(owner)}/${encodeURIComponent(id)}`)
    if (monaco.editor.getModel(uri)) throw new Error(`Editor model already exists for ${owner}:${id}`)
    const nativeModel = monaco.editor.createModel(String(options.value ?? ''), language, uri)
    nativeModel.updateOptions({
      tabSize: Number(options.tabSize ?? DEFAULT_OPTIONS.tabSize),
      insertSpaces: options.insertSpaces ?? DEFAULT_OPTIONS.insertSpaces,
    })
    return wrapModel(owner, nativeModel, id)
  }

  function nativeModel(wrapper) {
    if (!wrapper) return null
    for (const model of monaco.editor.getModels()) {
      if (nativeToWrapper.get(model) === wrapper) return model
    }
    return null
  }

  function create(owner, element, options = {}) {
    if (!element || typeof element !== 'object') throw new Error('codeEditor.create() requires a DOM element.')
    const suppliedModel = options.model || null
    const model = suppliedModel ? nativeModel(suppliedModel) : null
    if (suppliedModel && !model) throw new Error('codeEditor.create() received a model that is not owned by the Tec-Tac editor runtime.')

    const editorOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
      minimap: { ...DEFAULT_OPTIONS.minimap, ...(options.minimap || {}) },
      bracketPairColorization: { ...DEFAULT_OPTIONS.bracketPairColorization, ...(options.bracketPairColorization || {}) },
    }
    delete editorOptions.language
    delete editorOptions.value
    delete editorOptions.model
    delete editorOptions.tabSize
    delete editorOptions.insertSpaces

    let ownedModel = null
    let activeModel = model
    if (!activeModel) {
      ownedModel = createModel(owner, {
        id: `editor-${++autoModelCounter}`,
        language: options.language || 'plaintext',
        value: options.value || '',
        tabSize: options.tabSize,
        insertSpaces: options.insertSpaces,
      })
      activeModel = nativeModel(ownedModel)
    }
    editorOptions.model = activeModel

    const editor = monaco.editor.create(element, editorOptions)
    const viewStates = new Map()
    let disposed = false

    function currentModelWrapper() {
      const current = editor.getModel()
      return current ? nativeToWrapper.get(current) || wrapModel(owner, current, current.uri.toString()) : null
    }

    function saveCurrentViewState() {
      const current = editor.getModel()
      if (!current) return
      const state = editor.saveViewState()
      if (state) viewStates.set(current.uri.toString(), state)
    }

    const wrapper = Object.freeze({
      getValue() { return editor.getValue() },
      setValue(value) { editor.setValue(String(value ?? '')) },
      focus() { editor.focus() },
      getSelection() { return plainRange(editor.getSelection()) },
      getSelectedText() {
        const selection = editor.getSelection()
        const current = editor.getModel()
        return selection && current ? current.getValueInRange(selection) : ''
      },
      replaceSelection(text) {
        const selection = editor.getSelection()
        if (!selection) return
        editor.pushUndoStop()
        editor.executeEdits('tec-tac', [{ range: selection, text: String(text ?? ''), forceMoveMarkers: true }])
        editor.pushUndoStop()
      },
      insertText(text) {
        const position = editor.getPosition()
        if (!position) return
        const range = new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
        editor.pushUndoStop()
        editor.executeEdits('tec-tac', [{ range, text: String(text ?? ''), forceMoveMarkers: true }])
        editor.pushUndoStop()
      },
      setLanguage(language) {
        const current = editor.getModel()
        if (current) monaco.editor.setModelLanguage(current, assertLanguage(language))
      },
      setReadOnly(readOnly) { editor.updateOptions({ readOnly: Boolean(readOnly) }) },
      undo() { editor.trigger('tec-tac', 'undo', null) },
      redo() { editor.trigger('tec-tac', 'redo', null) },
      layout(dimension) { editor.layout(dimension) },
      getModel() { return currentModelWrapper() },
      setModel(modelWrapper) {
        const next = nativeModel(modelWrapper)
        if (!next) throw new Error('codeEditor.setModel() requires a model created by this Tec-Tac editor runtime.')
        saveCurrentViewState()
        editor.setModel(next)
        const saved = viewStates.get(next.uri.toString())
        if (saved) editor.restoreViewState(saved)
        editor.focus()
      },
      onChange(callback) {
        const handle = editor.onDidChangeModelContent((event) => callback?.({
          value: editor.getValue(),
          versionId: editor.getModel()?.getVersionId() || null,
          changes: (event.changes || []).map((change) => ({ range: plainRange(change.range), text: change.text })),
        }))
        return disposable(() => handle.dispose())
      },
      onSelectionChange(callback) {
        const handle = editor.onDidChangeCursorSelection((event) => callback?.({
          selection: plainRange(event.selection),
          source: event.source || null,
        }))
        return disposable(() => handle.dispose())
      },
      onCursorChange(callback) {
        const handle = editor.onDidChangeCursorPosition((event) => callback?.({
          position: plainPosition(event.position),
          source: event.source || null,
        }))
        return disposable(() => handle.dispose())
      },
      dispose() {
        if (disposed) return
        disposed = true
        saveCurrentViewState()
        editor.dispose()
        ownedModel?.dispose?.()
        viewStates.clear()
      },
    })
    return wrapper
  }

  function providerModel(owner, model) {
    return nativeToWrapper.get(model) || wrapModel(owner, model, model.uri.toString())
  }

  function registerCompletionProvider(owner, language, provider) {
    const lang = assertLanguage(language)
    const callback = typeof provider === 'function' ? provider : provider?.provideCompletionItems || provider?.provide
    if (typeof callback !== 'function') throw new Error('Completion provider must be a function or expose provideCompletionItems().')
    const handle = monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: Array.isArray(provider?.triggerCharacters) ? provider.triggerCharacters.map(String) : undefined,
      async provideCompletionItems(model, position, context) {
        const word = model.getWordUntilPosition(position)
        const fallbackRange = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
        const value = await callback({
          model: providerModel(owner, model),
          position: plainPosition(position),
          word: word.word || '',
          triggerCharacter: context.triggerCharacter || null,
        })
        const suggestions = Array.isArray(value) ? value : (value?.suggestions || [])
        return {
          suggestions: suggestions.map((item) => ({
            label: String(item.label ?? ''),
            kind: completionKind(item.kind),
            insertText: String(item.insertText ?? item.label ?? ''),
            insertTextRules: item.snippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
            detail: item.detail == null ? undefined : String(item.detail),
            documentation: normalizeDocumentation(item.documentation),
            sortText: item.sortText == null ? undefined : String(item.sortText),
            filterText: item.filterText == null ? undefined : String(item.filterText),
            range: toRange(item.range) || fallbackRange,
          })),
        }
      },
    })
    providerStats.set(owner, (providerStats.get(owner) || 0) + 1)
    return disposable(() => {
      handle.dispose()
      providerStats.set(owner, Math.max(0, (providerStats.get(owner) || 1) - 1))
    })
  }

  function registerHoverProvider(owner, language, provider) {
    const lang = assertLanguage(language)
    const callback = typeof provider === 'function' ? provider : provider?.provideHover || provider?.provide
    if (typeof callback !== 'function') throw new Error('Hover provider must be a function or expose provideHover().')
    const handle = monaco.languages.registerHoverProvider(lang, {
      async provideHover(model, position) {
        const word = model.getWordAtPosition(position)
        const value = await callback({
          model: providerModel(owner, model),
          position: plainPosition(position),
          word: word?.word || '',
        })
        if (!value) return null
        const contents = Array.isArray(value) ? value : (value.contents || [])
        return {
          contents: contents.map((item) => typeof item === 'string' ? { value: item } : normalizeDocumentation(item)).filter(Boolean),
          range: toRange(value.range) || (word
            ? new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
            : undefined),
        }
      },
    })
    providerStats.set(owner, (providerStats.get(owner) || 0) + 1)
    return disposable(() => {
      handle.dispose()
      providerStats.set(owner, Math.max(0, (providerStats.get(owner) || 1) - 1))
    })
  }


  function markerSeverity(value) {
    const key = String(value || 'error').trim().toLowerCase()
    if (key === 'warning' || key === 'warn') return monaco.MarkerSeverity.Warning
    if (key === 'info' || key === 'information') return monaco.MarkerSeverity.Info
    if (key === 'hint') return monaco.MarkerSeverity.Hint
    return monaco.MarkerSeverity.Error
  }

  function normalizeDiagnostic(model, item) {
    if (!item || typeof item !== 'object') return null
    const lineCount = Math.max(1, model.getLineCount())
    const clampLine = (value, fallback) => Math.min(lineCount, Math.max(1, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback))
    const startLineNumber = clampLine(item.startLineNumber, 1)
    const endLineNumber = Math.max(startLineNumber, clampLine(item.endLineNumber, startLineNumber))
    const maxStartColumn = model.getLineMaxColumn(startLineNumber)
    const maxEndColumn = model.getLineMaxColumn(endLineNumber)
    const clampColumn = (value, max, fallback) => Math.min(max, Math.max(1, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback))
    const startColumn = clampColumn(item.startColumn, maxStartColumn, 1)
    const endColumn = endLineNumber === startLineNumber
      ? Math.max(startColumn, clampColumn(item.endColumn, maxEndColumn, startColumn + 1))
      : clampColumn(item.endColumn, maxEndColumn, maxEndColumn)
    const message = String(item.message || '').trim()
    if (!message) return null
    const marker = {
      severity: markerSeverity(item.severity),
      message,
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn,
    }
    if (item.source != null) marker.source = String(item.source)
    if (item.code != null) marker.code = String(item.code)
    return marker
  }

  function registerDiagnosticsProvider(owner, language, provider) {
    const lang = assertLanguage(language)
    const callback = typeof provider === 'function' ? provider : provider?.provideDiagnostics || provider?.provide
    if (typeof callback !== 'function') throw new Error('Diagnostics provider must be a function or expose provideDiagnostics().')

    const debounceMs = Math.max(0, Math.min(10000, Number(provider?.debounceMs ?? 300) || 0))
    const markerOwner = `tec-tac:${owner}:diagnostics:${++diagnosticsProviderCounter}`
    const tracked = new Map()
    let disposed = false

    function clearModel(model) {
      try { monaco.editor.setModelMarkers(model, markerOwner, []) } catch {}
    }

    function detach(model) {
      const state = tracked.get(model)
      if (!state) return
      tracked.delete(model)
      if (state.timer) clearTimeout(state.timer)
      try { state.content?.dispose?.() } catch {}
      try { state.dispose?.dispose?.() } catch {}
      state.sequence += 1
      clearModel(model)
    }

    async function run(model, state) {
      if (disposed || tracked.get(model) !== state || model.isDisposed() || model.getLanguageId() !== lang) return
      const sequence = ++state.sequence
      const versionId = model.getVersionId()
      try {
        const value = await callback({
          model: providerModel(owner, model),
          language: lang,
          value: model.getValue(),
          versionId,
        })
        if (disposed || tracked.get(model) !== state || model.isDisposed() || model.getLanguageId() !== lang) return
        if (sequence !== state.sequence || versionId !== model.getVersionId()) return
        const diagnostics = Array.isArray(value) ? value : (value?.diagnostics || [])
        const markers = diagnostics.map((item) => normalizeDiagnostic(model, item)).filter(Boolean)
        monaco.editor.setModelMarkers(model, markerOwner, markers)
      } catch (error) {
        if (sequence !== state.sequence || disposed || model.isDisposed()) return
        clearModel(model)
        console.error(`[TEC-TAC-UI] Diagnostics provider ${owner}:${lang} failed.`, error)
      }
    }

    function schedule(model, state, immediate = false) {
      if (state.timer) clearTimeout(state.timer)
      state.sequence += 1
      const delay = immediate ? 0 : debounceMs
      state.timer = setTimeout(() => {
        state.timer = null
        run(model, state)
      }, delay)
    }

    function attach(model, immediate = true) {
      if (disposed || !model || model.isDisposed()) return
      if (model.getLanguageId() !== lang) {
        detach(model)
        return
      }
      if (tracked.has(model)) {
        if (immediate) schedule(model, tracked.get(model), true)
        return
      }
      const state = { timer: null, sequence: 0, content: null, dispose: null }
      state.content = model.onDidChangeContent(() => schedule(model, state, false))
      state.dispose = model.onWillDispose(() => detach(model))
      tracked.set(model, state)
      schedule(model, state, immediate)
    }

    for (const model of monaco.editor.getModels()) attach(model, true)
    const createHandle = monaco.editor.onDidCreateModel((model) => attach(model, true))
    const languageHandle = monaco.editor.onDidChangeModelLanguage((event) => {
      if (event.model.getLanguageId() === lang) attach(event.model, true)
      else detach(event.model)
    })

    providerStats.set(owner, (providerStats.get(owner) || 0) + 1)
    return disposable(() => {
      if (disposed) return
      disposed = true
      createHandle.dispose()
      languageHandle.dispose()
      for (const model of [...tracked.keys()]) detach(model)
      providerStats.set(owner, Math.max(0, (providerStats.get(owner) || 1) - 1))
    })
  }

  const service = {
    create,
    createModel,
    registerCompletionProvider,
    registerHoverProvider,
    registerDiagnosticsProvider,
    forModule(moduleId) {
      const key = String(moduleId || '').trim()
      if (!key) throw new Error('codeEditor.forModule() requires a module ID.')
      if (!scopes.has(key)) scopes.set(key, createServiceScope(key, service))
      return scopes.get(key)
    },
    snapshot() {
      return {
        languages: [...SUPPORTED_LANGUAGES],
        defaults: { ...DEFAULT_OPTIONS, minimap: { ...DEFAULT_OPTIONS.minimap }, bracketPairColorization: { ...DEFAULT_OPTIONS.bracketPairColorization } },
        providers: [...providerStats.entries()].map(([provider, count]) => ({ provider, count })).filter((item) => item.count > 0),
        theme: themeForDocument(),
      }
    },
    dispose() {
      for (const scope of scopes.values()) scope.clear()
      scopes.clear()
      observer?.disconnect()
    },
  }

  return Object.freeze(service)
}
