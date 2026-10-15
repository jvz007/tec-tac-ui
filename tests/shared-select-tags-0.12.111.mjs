// 0.12.111: the shared SearchSelect and TagEditor (brand board P6 and P7). The rules are pure functions and are tested in node;
// the components are rendered with vue/server-renderer; the CSS block is scanned; a loader run checks who receives them.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const logic = await import(new URL('../src/shared-components-logic.js', import.meta.url).href)
const comps = await import(new URL('../src/shared-components.js', import.meta.url).href)
const { filterOptions, groupOptions, visibleOptions, moveHighlight, comboKey, addTag, removeLastTag, removeTagAt, splitTyped, tagKey, SELECT_LIMITS, TAG_LIMITS } = logic

// ---- filterOptions ----
const opts = [
  { value: 1, label: 'Disk cleanup', description: 'Clears temp folders', searchText: 'maintenance', favourite: true, chip: 'PowerShell' },
  { value: 2, label: 'Collect event logs', description: 'Exports the System log' },
  { value: 3, label: 'Reboot', description: 'Restarts the machine', disabled: true },
  { value: 4, label: 'Backup check', favourite: true },
  'not an option', null, 5,
]
assert.deepEqual(filterOptions(opts, '').map((o) => o.value), [1, 2, 3, 4], 'non-object entries are dropped')
assert.deepEqual(filterOptions(opts, 'DISK').map((o) => o.value), [1], 'label, any case')
assert.deepEqual(filterOptions(opts, 'system log').map((o) => o.value), [2], 'description')
assert.deepEqual(filterOptions(opts, 'maintenance').map((o) => o.value), [1], 'searchText')
assert.deepEqual(filterOptions(opts, '  reboot ').map((o) => o.value), [3], 'the query is trimmed')
assert.deepEqual(filterOptions(opts, 'zzz'), [])
assert.deepEqual(filterOptions(undefined, 'a'), [])

// ---- groupOptions ----
const groups = groupOptions(opts)
assert.deepEqual(groups.map((g) => g.label), ['Favourites', 'All'], 'favourites first')
assert.deepEqual(groups[0].options.map((o) => o.value), [1, 4])
assert.deepEqual(groups[1].options.map((o) => o.value), [2, 3])
assert.deepEqual(groupOptions([{ label: 'a' }]).map((g) => g.key), ['all'], 'an empty favourites group is dropped')
assert.deepEqual(groupOptions([{ label: 'a', favourite: true }]).map((g) => g.key), ['favourites'], 'an empty All group is dropped')
assert.deepEqual(groupOptions([]), [])
assert.deepEqual(groupOptions(opts, { favouriteLabel: 'Starred', allLabel: 'Rest' }).map((g) => g.label), ['Starred', 'Rest'])

// ---- visibleOptions: order and cap ----
const vis = visibleOptions(opts, '')
assert.deepEqual(vis.flat.map((o) => o.value), [1, 4, 2, 3], 'keyboard order is favourites first')
assert.equal(vis.capped, false)
const many = Array.from({ length: 450 }, (_, i) => ({ value: i, label: `Item ${i}`, favourite: i === 400 }))
const capped = visibleOptions(many, '')
assert.equal(SELECT_LIMITS.maxRows, 300)
assert.equal(capped.flat.length, 300)
assert.equal(capped.capped, true)
assert.equal(capped.flat[0].value, 400, 'a favourite past the cap still comes first')
assert.equal(capped.groups.reduce((n, g) => n + g.options.length, 0), 300)
assert.equal(visibleOptions(many, 'Item 12').capped, false, 'typing narrows below the cap')

// ---- moveHighlight skips disabled rows ----
const flat = [{ label: 'a' }, { label: 'b', disabled: true }, { label: 'c' }, { label: 'd', disabled: true }]
assert.equal(moveHighlight(flat, 0, 1), 2, 'down skips a disabled row')
assert.equal(moveHighlight(flat, 2, -1), 0, 'up skips a disabled row')
assert.equal(moveHighlight(flat, 2, 1), 2, 'no enabled row further down: stay')
assert.equal(moveHighlight(flat, 0, -1), 0, 'no wrap at the top')
assert.equal(moveHighlight(flat, -1, 1), 0, 'from nothing, down goes to the first row')
assert.equal(moveHighlight(flat, -1, -1), -1)
assert.equal(moveHighlight([{ disabled: true }], -1, 1), -1, 'all disabled: nothing')
assert.equal(moveHighlight([], 0, 1), -1)

// ---- comboKey ----
const st = (extra) => ({ open: false, highlight: -1, flat, chosenIndex: -1, ...extra })
let r = comboKey(st({}), 'ArrowDown')
assert.deepEqual([r.action, r.highlight, r.preventDefault], ['open', 0, true], 'ArrowDown opens on the first row')
r = comboKey(st({ chosenIndex: 2 }), 'ArrowDown')
assert.deepEqual([r.action, r.highlight], ['open', 2], 'opens on the chosen row')
r = comboKey(st({ open: true, highlight: 0 }), 'ArrowDown')
assert.deepEqual([r.action, r.highlight], ['move', 2])
r = comboKey(st({ open: true, highlight: 2 }), 'ArrowUp')
assert.deepEqual([r.action, r.highlight], ['move', 0])
assert.equal(comboKey(st({}), 'ArrowUp').action, 'none', 'ArrowUp does nothing while closed')
r = comboKey(st({ open: true, highlight: 2 }), 'Enter')
assert.deepEqual([r.action, r.preventDefault], ['choose', true])
assert.equal(comboKey(st({ open: true, highlight: 1 }), 'Enter').action, 'none', 'Enter on a disabled row chooses nothing')
assert.equal(comboKey(st({ open: true, highlight: -1 }), 'Enter').action, 'none')
assert.equal(comboKey(st({}), 'Enter').preventDefault, false, 'Enter while closed is left alone')
r = comboKey(st({ open: true, highlight: 0 }), 'Escape')
assert.deepEqual([r.action, r.stopPropagation, r.preventDefault], ['close', true, true], 'Escape closes and stops there')
r = comboKey(st({}), 'Escape')
assert.deepEqual([r.action, r.stopPropagation], ['none', false], 'Escape while closed reaches the popup')
r = comboKey(st({ open: true, highlight: 0 }), 'Tab')
assert.deepEqual([r.action, r.preventDefault], ['close', false], 'Tab closes and lets the focus move')
assert.equal(comboKey(st({}), 'Tab').action, 'none')
assert.equal(comboKey(st({ open: true }), 'a').action, 'none')

// ---- addTag ----
let t = addTag([], '  -Days 7  ')
assert.deepEqual([t.added, t.values], [true, ['-Days 7']], 'trimmed')
assert.equal(addTag(['a'], 'a').reason, 'duplicate')
assert.equal(addTag(['a'], 'a').message, '', 'a duplicate is ignored quietly')
assert.equal(addTag(['a'], '   ').reason, 'empty')
assert.deepEqual(addTag([], 'a\tb\u0000c\r\nd').values, ['abcd'], 'control characters are stripped')
assert.equal(addTag([], '\u0007\u0008').reason, 'empty', 'only control characters is empty')
t = addTag([], 'x'.repeat(501))
assert.deepEqual([t.added, t.reason], [false, 'too_long'])
assert.match(t.message, /500/)
assert.equal(addTag([], 'x'.repeat(500)).added, true, 'exactly the limit is fine')
assert.equal(addTag([], 'abcd', { maxLength: 3 }).reason, 'too_long', 'maxLength can be lowered')
assert.equal(TAG_LIMITS.maxItems, 200)
assert.equal(TAG_LIMITS.maxLength, 500)
t = addTag(Array.from({ length: 200 }, (_, i) => `v${i}`), 'new')
assert.deepEqual([t.added, t.reason], [false, 'too_many'])
assert.equal(addTag(['a', 'b'], 'c', { maxItems: 2 }).reason, 'too_many')
t = addTag([], 'bad value', { validate: (v) => (v.includes(' ') ? 'No spaces, please.' : '') })
assert.deepEqual([t.added, t.reason, t.message], [false, 'invalid', 'No spaces, please.'])
assert.equal(addTag([], 'ok', { validate: () => '' }).added, true, 'validate returning an empty string accepts')
assert.equal(addTag([], 'ok', { validate: () => { throw new Error('boom') } }).reason, 'invalid', 'a throwing validate refuses')
const original = ['a']
assert.notEqual(addTag(original, 'b').values, original, 'a new array is returned')
assert.deepEqual(original, ['a'])
// the comma rule
assert.deepEqual(splitTyped('a,b', true), ['a', 'b'])
assert.deepEqual(splitTyped('a,b', false), ['a,b'])
assert.equal(tagKey(',', { commaAdds: true }), 'add')
assert.equal(tagKey(',', { commaAdds: false }), '')
assert.equal(tagKey('Enter', { commaAdds: false }), 'add')
assert.equal(tagKey('Backspace', { text: '', hasValues: true }), 'removeLast')
assert.equal(tagKey('Backspace', { text: 'x', hasValues: true }), '')
assert.equal(tagKey('Backspace', { text: '', hasValues: false }), '')
assert.equal(tagKey('a', {}), '')
// removing
assert.deepEqual(removeLastTag(['a', 'b']), ['a'])
assert.deepEqual(removeLastTag([]), [])
assert.deepEqual(removeLastTag(undefined), [])
assert.deepEqual(removeTagAt(['a', 'b', 'c'], 1), ['a', 'c'])
assert.deepEqual(removeTagAt(['a'], 5), ['a'])

// ---- render the components ----
const render = (component, props) => renderToString(createSSRApp({ render: () => h(component, props) }))
const evil = '<img src=x onerror=alert(1)>'

let html = await render(comps.SearchSelect, { modelValue: 2, options: opts, inputId: 'pick', ariaLabel: 'Script', placeholder: 'Search scripts' })
assert.match(html, /class="tt-combo"/)
assert.match(html, /<input[^>]*id="pick"/)
assert.match(html, /role="combobox"/)
assert.match(html, /aria-expanded="false"/)
assert.match(html, /aria-autocomplete="list"/)
assert.match(html, /aria-controls="tt-combo-\d+"/)
assert.match(html, /aria-label="Script"/)
assert.match(html, /value="Collect event logs"/, 'the closed input shows the chosen label')
assert.match(html, /<ul[^>]*role="listbox"[^>]*hidden/, 'the list is hidden while closed')
html = await render(comps.SearchSelect, { modelValue: 2, options: opts, disabled: true })
assert.match(html, /disabled/)
html = await render(comps.SearchSelect, { modelValue: 2, options: opts, clearable: true })
assert.match(html, /aria-label="Clear selection"/)
html = await render(comps.SearchSelect, { modelValue: null, options: opts, clearable: true })
assert.doesNotMatch(html, /Clear selection/, 'nothing to clear')

const listProps = (query, highlight, list = opts, extra = {}) => {
  const v = visibleOptions(list, query)
  return { listId: 'L', groups: v.groups, flat: v.flat, highlight, capped: v.capped, ...extra }
}
html = await render(comps.SearchSelectList, listProps('', 0))
assert.match(html, /<ul[^>]*id="L"[^>]*role="listbox"/)
assert.ok(html.indexOf('Favourites') > -1 && html.indexOf('Favourites') < html.indexOf('>All<'), 'Favourites before All')
assert.equal((html.match(/role="option"/g) || []).length, 4)
assert.match(html, /id="L-o0"[^>]*aria-selected="true"/, 'the highlighted row is aria-selected')
assert.match(html, /id="L-o1"[^>]*aria-selected="false"/)
assert.match(html, /aria-disabled="true"/, 'a disabled row says so')
assert.match(html, /class="tt-star"[^>]*>★</)
assert.match(html, /class="d">Clears temp folders</, 'description on a second line')
assert.match(html, /class="tt-chip">PowerShell</)
html = await render(comps.SearchSelectList, listProps('zzz', -1, opts, { emptyText: 'Nothing here.' }))
assert.match(html, /Nothing here\./)
html = await render(comps.SearchSelectList, { listId: 'L', groups: [], flat: [], highlight: -1 })
assert.ok(html.includes(SELECT_LIMITS.emptyText), 'the default empty text')
html = await render(comps.SearchSelectList, listProps('', 0, many))
assert.ok(html.includes('Showing the first 300. Keep typing to narrow it.'), 'the cap line')
assert.equal((html.match(/role="option"/g) || []).length, 300)
html = await render(comps.SearchSelectList, { listId: 'L', groups: groupOptions([{ label: evil, description: evil, chip: evil }]), flat: [{ label: evil }], highlight: 0 })
assert.ok(!html.includes('<img'), 'markup in a label stays escaped')
assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
html = await render(comps.SearchSelectList, { listId: 'L', groups: groupOptions([{ label: 'a' }]), flat: [{ label: 'a' }], highlight: 0 })
assert.ok(!html.includes('grp'), 'no group headings without favourites')

html = await render(comps.TagEditor, { modelValue: ['-Days 7', evil], ariaLabel: 'Arguments', placeholder: 'Type and press Enter' })
assert.match(html, /class="tt-tagbox"/)
assert.equal((html.match(/class="tt-tag"/g) || []).length, 2)
assert.match(html, /aria-label="Remove -Days 7"/)
assert.ok(!html.includes('<img src=x'), 'markup in a value stays escaped')
assert.match(html, /aria-label="Arguments"/)
assert.match(html, /placeholder="Type and press Enter"/)
html = await render(comps.TagEditor, { modelValue: ['a'], readonly: true })
assert.doesNotMatch(html, /<input/, 'readonly has no input')
assert.doesNotMatch(html, /Remove a/, 'readonly has no remove button')
html = await render(comps.TagEditor, { modelValue: ['a'], disabled: true })
assert.match(html, /is-disabled/)
assert.match(html, /<input[^>]*disabled/)
html = await render(comps.TagEditor, {})
assert.match(html, /class="tt-tagbox"/, 'no value renders an empty box')

// ---- the component definitions ----
assert.deepEqual(Object.keys(comps.SearchSelect.props).sort(), ['allLabel', 'ariaLabel', 'clearable', 'disabled', 'emptyText', 'favouriteLabel', 'inputId', 'modelValue', 'options', 'placeholder'])
assert.deepEqual(comps.SearchSelect.emits, ['update:modelValue', 'select'])
assert.equal(comps.SearchSelect.props.clearable.default, false)
assert.deepEqual(Object.keys(comps.TagEditor.props).sort(), ['ariaLabel', 'commaAdds', 'disabled', 'maxItems', 'maxLength', 'modelValue', 'placeholder', 'readonly', 'validate'])
assert.deepEqual(comps.TagEditor.emits, ['update:modelValue', 'reject'])
assert.equal(comps.TagEditor.props.commaAdds.default, true)
assert.equal(comps.TagEditor.props.maxItems.default, 200)
assert.equal(comps.TagEditor.props.maxLength.default, 500)
assert.equal(Object.isFrozen(comps.sharedComponents), true)

// ---- the source has no v-html, no innerHTML and no template strings ----
const src = read('../src/shared-components.js')
const code = src.split(String.fromCharCode(10)).filter((line) => !line.trim().startsWith('//')).join(' ')
assert.equal(/v-html|innerHTML|insertAdjacentHTML|template:/.test(code), false, 'text nodes only, no templates')
assert.equal(/localStorage|sessionStorage|fetch\(|XMLHttpRequest/.test(code), false, 'no storage and no network')

// ---- the CSS block ----
const css = read('../src/styles.css')
const startAt = css.indexOf('/* ==== Shared SearchSelect and TagEditor')
const endAt = css.indexOf('/* ==== end of the shared SearchSelect and TagEditor block ==== */')
assert.ok(startAt > 0 && endAt > startAt, 'one commented block')
const block = css.slice(startAt, endAt)
assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(block), false, 'no hex colour in the block')
const sizes = [...block.matchAll(/font(?:-size)?:([^;}]*)/g)].map((m) => m[1])
assert.ok(sizes.length > 10)
for (const size of sizes) assert.ok(/var\(--font-scale\)|var\(--label\)/.test(size), `every size scales: ${size}`)
assert.equal(/font(-size)?:\s*[0-9.]+px/.test(block), false, 'no raw px font size')
for (const cls of ['.tt-combo', '.tt-input', '.tt-star', '.tt-chip', '.tt-tagbox', '.tt-tag', '.tt-field', '.tt-help', '.tt-error']) assert.ok(block.includes(cls), `${cls} is in the block`)
assert.equal(/rgba\(\s*[0-9]/.test(block.replace(/rgba\(0,0,0,/g, '')), false, 'rgba uses a token channel (shadows use black)')
// the bordered field rule never reaches the tag editor's input: it names direct children, never a descendant input
let checkedSelectors = 0
for (const rule of block.split('}')) {
  const head = rule.split('{')[0]
  for (const selector of head.split(',')) {
    if (/\.tt-field/.test(selector) && /input/.test(selector)) {
      checkedSelectors += 1
      assert.match(selector.trim(), /^\.tt-field>input/, `direct children only: ${selector.trim()}`)
    }
  }
}
assert.ok(checkedSelectors >= 4)
assert.equal(/\.tt-field\s+input/.test(block), false, 'no descendant input selector on .tt-field')
assert.ok(block.includes('.tt-tagbox input{'), 'the tag input has its own rule')
// the list is placed from the input's rectangle, not cut by a scrolling dialog
assert.ok(/\.tt-combo ul\{position:fixed/.test(block))
assert.ok(src.includes('getBoundingClientRect'))
// no other stylesheet rule outside the block names these classes
const outside = css.slice(0, startAt) + css.slice(endAt)
assert.equal(/\.tt-(combo|tagbox|tag|chip|star|field|help|input|error)\b/.test(outside), false, 'no earlier rule for these class names')

// ---- loader: authenticated modules get the components, public ones do not ----
function dataModule(path, replacements = []) {
  let source = read(path)
  for (const [from, to] of replacements) source = source.replace(from, to)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const entry = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const loader = await dataModule('../src/module-loader.js', [["import * as Vue from 'vue'", 'const Vue = {}']])
const runtime = {
  app: {},
  router: { currentRoute: { value: { path: '/' } }, getRoutes: () => [], addRoute: () => () => {}, replace: async () => {} },
  state: { context: { permissions: [], user: { superuser: true, id: 9 } }, contextSource: 'backend' },
  addNavigation() {},
  removeNavigation() {},
  components: comps.sharedComponents,
  publicApi: async () => ({}),
}
const ok = entry('export default { register(ctx) { globalThis.__comp = ctx.components } }')
const loaded = await loader.loadUiModules(runtime, [{ id: 'picker', entry: ok, permissions: [], allowed: true }], { timeoutMs: 500 })
assert.deepEqual(loaded.loaded, ['picker'])
assert.equal(globalThis.__comp.SearchSelect, comps.SearchSelect, 'a module receives SearchSelect')
assert.equal(globalThis.__comp.TagEditor, comps.TagEditor, 'a module receives TagEditor')
assert.throws(() => { globalThis.__comp.SearchSelect = null }, TypeError, 'a module cannot replace them')
const failing = entry('export default { register(ctx) { globalThis.__failComp = ctx.components; throw new Error("broke") } }')
const failed = await loader.loadUiModules(runtime, [{ id: 'broken', entry: failing, permissions: [], allowed: true }], { timeoutMs: 500 })
assert.equal(failed.failed[0]?.id, 'broken')
assert.equal(typeof globalThis.__failComp.SearchSelect, 'object', 'the failed-register path is unaffected')
const again = await loader.loadUiModules(runtime, [{ id: 'picker2', entry: ok, permissions: [], allowed: true }], { timeoutMs: 500 })
assert.deepEqual(again.loaded, ['picker2'], 'a later module still loads')
assert.equal(globalThis.__comp.TagEditor, comps.TagEditor)
globalThis.__comp = 'unset'
const plain = await loader.loadUiModules({ ...runtime, components: undefined }, [{ id: 'old', entry: ok, permissions: [], allowed: true }], { timeoutMs: 500 })
assert.deepEqual(plain.loaded, ['old'], 'a runtime built without components still loads a module')
assert.equal(globalThis.__comp, undefined)

const publicEntry = entry('export default { registerPublic(ctx) { globalThis.__pub = Object.keys(ctx) } }')
const publicLoaded = await loader.loadPublicUiModules(runtime, [{ id: 'pubmod', public: { entry: publicEntry, base_path: '/public/pubmod' } }])
assert.deepEqual(publicLoaded.loaded, ['pubmod'])
assert.equal(globalThis.__pub.includes('components'), false, 'registerPublic does not get components')
const loaderSource = read('../src/module-loader.js')
assert.equal(/components/.test(loaderSource.slice(loaderSource.indexOf('export async function loadPublicUiModules'), loaderSource.indexOf('export async function loadUiModules'))), false, 'the public loader never names components')
const mainSource = read('../src/main.js')
assert.match(mainSource, /import \{ sharedComponents \} from '\.\/shared-components'/)
assert.match(mainSource, /components: sharedComponents,/)

console.log('shared-select-tags-0.12.111: PASS')
