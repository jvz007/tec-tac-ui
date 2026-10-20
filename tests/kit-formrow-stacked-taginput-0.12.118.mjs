// 0.12.118: FormRow stacked and TagEditor inputId and describedBy. Defaults render exactly as 0.12.117 (golden strings made from
// the 0.12.117 source). stacked adds its class. inputId lands on the real text input, describedBy on aria-describedby.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { FormRow } = await import(new URL('../src/shared-kit.js', import.meta.url).href)
const { TagEditor } = await import(new URL('../src/shared-components.js', import.meta.url).href)
const render = (comp, props, slots) => renderToString(createSSRApp({ render: () => h(comp, props, slots) }))
const control = { default: () => h('input', { id: 'x' }) }

assert.equal(await render(FormRow, { label: 'L', forId: 'x', help: 'H' }, control),
  '<div class="tt-frow"><label for="x">L<!----></label><div class="tt-ctl"><!--[--><input id="x"><!--]--><span class="tt-help" id="x-hint">H</span><!----></div></div>',
  'default FormRow is what 0.12.117 drew')
const stacked = await render(FormRow, { label: 'L', forId: 'x', stacked: true }, control)
assert.match(stacked, /class="tt-frow tt-frow-stacked"/)
assert.doesNotMatch(await render(FormRow, { label: 'L' }, control), /stacked/)

assert.equal(await render(TagEditor, { modelValue: ['a'], ariaLabel: 'Args' }),
  '<div class="tt-tageditor"><div class="tt-tagbox"><span class="tt-tag"><span>a</span><button type="button" aria-label="Remove a" title="Remove a">×</button></span><input class="tt-tag-input" type="text" aria-label="Args" autocomplete="off" value></div><!----></div>',
  'default TagEditor is what 0.12.117 drew')
const withId = await render(TagEditor, { modelValue: [], inputId: 'args-input', describedBy: 'args-hint' })
assert.match(withId, /<input id="args-input" class="tt-tag-input"[^>]*aria-describedby="args-hint"/)
assert.doesNotMatch(await render(TagEditor, { modelValue: [] }), / id=|aria-describedby/, 'no id when absent')
const onlyId = await render(TagEditor, { modelValue: [], inputId: 'q' })
assert.match(onlyId, /id="q"/)
assert.doesNotMatch(onlyId, /aria-describedby/)
const ro = await render(TagEditor, { modelValue: ['a'], readonly: true, inputId: 'q' })
assert.doesNotMatch(ro, /<input/, 'read-only has no input, so no id')

const css = read('../src/styles.css')
assert.match(css, /\.tt-frow\.tt-frow-stacked,\.tt-props \.tt-frow\{grid-template-columns:minmax\(0,1fr\)\}/, 'stacked, and automatic in the properties column')
assert.match(read('../docs/module-components.md'), /stacked/)
assert.match(read('../docs/module-components.md'), /inputId/)
console.log('kit-formrow-stacked-taginput-0.12.118: ok')
