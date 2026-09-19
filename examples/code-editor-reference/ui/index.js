export default {
  async register({ Vue, router, addNavigation, codeEditor }) {
    const { defineComponent, h, onBeforeUnmount, onMounted, ref } = Vue

    const View = defineComponent({
      name: 'CodeEditorReferenceView',
      setup() {
        const htmlHost = ref(null)
        const cssHost = ref(null)
        const yamlHost = ref(null)
        const editors = []
        const models = []
        const providers = []

        onMounted(() => {
          const html = codeEditor.createModel({ id: 'html', language: 'html', value: '<section>\n  <h1>{{ client.name }}</h1>\n</section>' })
          const css = codeEditor.createModel({ id: 'css', language: 'css', value: 'section {\n  padding: 1rem;\n}' })
          const yaml = codeEditor.createModel({ id: 'yaml', language: 'yaml', value: 'client:\n  name: Example Client\n' })
          models.push(html, css, yaml)

          editors.push(
            codeEditor.create(htmlHost.value, { model: html }),
            codeEditor.create(cssHost.value, { model: css }),
            codeEditor.create(yamlHost.value, { model: yaml }),
          )

          providers.push(codeEditor.registerCompletionProvider('html', {
            triggerCharacters: ['.'],
            provideCompletionItems() {
              return { suggestions: [{ label: 'client.name', kind: 'variable', insertText: '{{ client.name }}', detail: 'Reference completion' }] }
            },
          }))


          providers.push(codeEditor.registerDiagnosticsProvider('html', {
            debounceMs: 50,
            provideDiagnostics({ value }) {
              const line = value.split('\n').findIndex((item) => item.includes('{{ client.name }}')) + 1
              return line > 0 ? [{
                severity: 'hint',
                message: 'Reference diagnostic: Jinja value is resolved at render time.',
                startLineNumber: line,
                startColumn: 7,
                endLineNumber: line,
                endColumn: 24,
                source: 'Tec-Tac reference',
              }] : []
            },
          }))
        })

        onBeforeUnmount(() => {
          for (const item of providers.splice(0)) item.dispose()
          for (const item of editors.splice(0)) item.dispose()
          for (const item of models.splice(0)) item.dispose()
        })

        const active = () => editors[0]
        const button = (label, action) => h('button', { class: 'btn sm', type: 'button', onClick: action }, label)
        const pane = (title, host) => h('article', { class: 'card' }, [
          h('div', { class: 'cardhead' }, [h('h3', title)]),
          h('div', { ref: host, style: 'height:260px;border:1px solid var(--line);' }),
        ])

        return () => h('section', [
          h('div', { class: 'phead' }, [h('div', [h('span', { class: 'eyebrow' }, 'CORE EDITOR CONTRACT'), h('h1', 'Monaco reference')])]),
          h('div', { class: 'row mb' }, [
            button('Insert Text', () => active()?.insertText(' inserted ')),
            button('Replace Selection', () => active()?.replaceSelection('[replacement]')),
            button('Undo', () => active()?.undo()),
            button('Redo', () => active()?.redo()),
            button('Switch Language', () => {
              const language = active()?.getModel()?.language
              active()?.setLanguage(language === 'html' ? 'python' : (language === 'python' ? 'powershell' : 'html'))
            }),
          ]),
          h('div', { class: 'grid g2' }, [pane('HTML', htmlHost), pane('CSS', cssHost)]),
          h('div', { class: 'mt' }, [pane('YAML', yamlHost)]),
        ])
      },
    })

    router.addRoute({ path: '/editor-reference', name: 'extension-code-editor-reference', component: View, meta: { title: 'Editor Reference' } })
    addNavigation({ label: 'Editor Reference', section: 'Extensions', icon: '</>', to: '/editor-reference' })
  },
}
