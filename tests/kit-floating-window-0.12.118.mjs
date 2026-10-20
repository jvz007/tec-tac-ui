// 0.12.118: EditorWindow floating and readOnly. With neither prop the output is exactly what 0.12.117 drew (a golden string made
// from the 0.12.117 source). floating adds the class and the dialog role. readOnly removes Save and Discard changes. Escape still
// emits close. The stacking numbers keep the floating layer below every layer a module or the shell can put over it.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const { EditorWindow } = await import(new URL('../src/shared-kit.js', import.meta.url).href)
const render = (props, slots = { properties: () => 'P', content: () => 'C' }) => renderToString(createSSRApp({ render: () => h(EditorWindow, props, slots) }))

const GOLDEN_117 = '<section class="tt-win tt-ws" role="group" aria-labelledby="tt-win-title-1"><div class="tt-win-head"><span class="tt-win-title" id="tt-win-title-1">T</span><span class="tt-dirty" role="status">● Unsaved changes</span><div class="tt-win-actions"><!----><button class="btn tt-iconbtn" type="button" title="Close" aria-label="Close editor">×</button></div></div><div class="tt-win-body"><div class="tt-props">P</div><div class="tt-pane"><!--[-->C<!--]--></div></div><div class="tt-win-foot"><span class="tt-status" role="status" aria-live="polite">s</span><span class="spacer"></span><!----><button class="btn" type="button">Discard changes</button><button class="btn primary" type="button">Save</button></div></section>'
assert.equal(await render({ title: 'T', dirty: true, canSave: true, status: 's' }), GOLDEN_117, 'no new prop: identical to 0.12.117')

const floating = await render({ title: 'T', floating: true })
assert.match(floating, /class="tt-win tt-ws tt-win-floating"/, 'floating adds the class')
assert.match(floating, /role="dialog"/, 'floating is a dialog')
assert.match(floating, /aria-labelledby="tt-win-title-\d+"/, 'labelled by its title')
assert.match(floating, /tabindex="-1"/, 'it can take focus')
assert.doesNotMatch(await render({ title: 'T' }), /tabindex|tt-win-floating|role="dialog"/, 'default has none of these')

const viewer = await render({ title: 'T', readOnly: true, dirty: true, canSave: true })
assert.doesNotMatch(viewer, /Discard changes/, 'readOnly hides Discard changes')
assert.doesNotMatch(viewer, /class="btn primary"/, 'readOnly hides Save')
assert.match(viewer, /aria-label="Close editor"/, 'readOnly keeps the close button')
assert.match(await render({ title: 'T' }), /Discard changes/, 'not read-only keeps Discard changes')

const src = read('../src/shared-kit.js')
assert.match(src, /if \(action === 'close'\) emit\('close'\)/, 'Escape still emits close')
assert.match(src, /document\.activeElement/, 'the opener is remembered')
assert.match(src, /back\.focus\(\)/, 'and focus goes back on close')

// The layer order.
const css = read('../src/styles.css')
const z = (selector) => {
  const at = css.indexOf(selector)
  assert.ok(at >= 0, `${selector} in styles.css`)
  const rule = css.slice(at, css.indexOf('}', at))
  const m = rule.match(/z-index:(\d+)/)
  assert.ok(m, `${selector} has a z-index`)
  return Number(m[1])
}
const floatZ = z('.tt-win.tt-win-floating{')
assert.equal(floatZ, 1050)
assert.ok(floatZ > z('.resource-menu{'), 'above the resource menu')
assert.ok(floatZ < z('.tt-combo ul{'), 'below the SearchSelect list')
assert.ok(floatZ < z('.modal-backdrop.module-dialog-backdrop{'), 'below module dialogs')
assert.ok(floatZ < z('.resource-menu.row-menu-layer{'), 'below the row menu')
assert.ok(floatZ < z('.toast-stack{'), 'below toasts')
assert.ok(floatZ < z('.modal-backdrop.unsaved-backdrop{'), 'below the unsaved prompt')
assert.ok(floatZ < z('.confirm-backdrop{'), 'below the shell confirm')

for (const f of ['module-components.md', 'module-dialogs.md']) {
  const doc = read(`../docs/${f}`)
  assert.match(doc, /1050/, `${f} names the floating layer`)
  assert.match(doc, /floating/, `${f} documents floating`)
}
console.log('kit-floating-window-0.12.118: ok')
