// 0.12.100: the opt-in table style (.tablewrap.table-clean), the wide dialog (.modal-panel.modal-wide) and the tab strip
// (.dialog-tabs). The base rules that every module relies on are byte-identical to 0.12.99; the new block uses only the live tokens;
// the design standards name the classes in sections 5, 8.2 and 17; the tab strip keeps its ARIA markup and arrow keys.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const css = read('../src/styles.css')
const standards = read('../docs/ui-design-standards.md')
const users = read('../src/components/access/UsersPanel.vue')
const apiKeys = read('../src/components/access/ApiKeysPanel.vue')
const ssoPanel = read('../src/components/access/SsoAdminPanel.vue')
const { nextTabIndex } = await import(new URL('../src/dialog-tabs.js', import.meta.url).href)

// The base rules, exactly as 0.12.99 wrote them. A change here changes every module's table and dialog.
const BASE = [
  'table{width:100%;border-collapse:collapse}',
  'thead th{text-align:left;padding:8px 12px;font:var(--label) var(--mono);letter-spacing:var(--label-track);text-transform:uppercase;color:var(--dim);font-weight:400;border-bottom:1px solid var(--line);background:var(--thead-bg)}',
  'tbody td{padding:9px 12px;border-bottom:1px solid var(--line-soft);vertical-align:middle}',
  '.tablewrap{width:100%}',
  '.tablewrap tr.selected{background:rgba(var(--accent-rgb),.1);outline:1px solid rgba(var(--accent-rgb),.35);outline-offset:-1px}',
  '.modal-panel{width:min(520px,100%);background:var(--surface);border:1px solid var(--line-2);border-radius:3px;box-shadow:0 18px 55px rgba(0,0,0,.38);padding:16px}',
  '.subtabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--line);background:var(--surface);margin-bottom:14px}',
]
for (const rule of BASE) assert.ok(css.includes(rule), `base rule unchanged: ${rule.slice(0, 40)}`)

// The new block: starts at the 0.12.100 comment and runs to the end of the file.
const start = css.indexOf('/* 0.12.100: opt-in table style')
assert.ok(start > 0, 'the 0.12.100 block exists')
const block = css.slice(start)
for (const selector of ['.tablewrap.table-clean', '.tablewrap.table-clean thead th', '.tablewrap.table-clean .cell-truncate','.dialog-tabs', '.dialog-tabs [role="tab"][aria-selected="true"]', '.modal-panel.modal-wide']) {
  assert.ok(block.includes(selector), `${selector} defined`)
}
// Tokens only: no hex colour, no literal rgb or rgba numbers, and every colour reads a var().
assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, 'no hex colour in the new block')
assert.doesNotMatch(block, /rgba?\(\s*\d/, 'no literal rgb or rgba numbers in the new block')
assert.match(block, /var\(--accent-rgb\)/)
assert.match(block, /var\(--line\)/)
// Nothing above the block was changed by it: the new rules come after the base rules.
assert.ok(css.indexOf('.tablewrap.table-clean') > css.indexOf('.subtabs{'), 'new rules follow the base rules')

// Design standards name the classes in the right sections.
const section = (heading, next) => {
  const from = standards.indexOf(heading)
  assert.ok(from > 0, `${heading} exists`)
  const to = next ? standards.indexOf(next, from + 1) : standards.length
  return standards.slice(from, to > from ? to : standards.length)
}
assert.match(section('## 5. Tables', '## 6. Status pills'), /table-clean/)
const dialog82 = section('### 8.2 Input/action dialog', '### 8.3 Data-display dialog')
assert.match(dialog82, /modal-wide/)
assert.match(dialog82, /dialog-tabs/)
assert.match(dialog82, /role="tablist"/)
assert.match(dialog82, /aria-selected/)
const list17 = section('## 17. Module CSS boundary', '## 18. Recommended module page skeleton')
for (const name of ['.tablewrap.table-clean', '.modal-panel.modal-wide', '.dialog-tabs']) assert.ok(list17.includes(name), `section 17 names ${name}`)

// Users, API keys and SSO providers use the table style. The tab strip carries role tablist, tab and aria-selected.
for (const [name, source] of [['UsersPanel.vue', users], ['ApiKeysPanel.vue', apiKeys], ['SsoAdminPanel.vue', ssoPanel]]) {
  assert.match(source, /class="tablewrap table-clean"/, `${name} applies table-clean`)
}
assert.match(ssoPanel, /class="dialog-tabs" role="tablist"/)
assert.match(ssoPanel, /role="tab"/)
assert.match(ssoPanel, /:aria-selected="tabIndex === index \? 'true' : 'false'"/)
assert.match(ssoPanel, /role="tabpanel"/)
assert.match(ssoPanel, /class="modal-panel modal-wide"/)
assert.match(ssoPanel, /@keydown="onTabKey"/)

// Keyboard: arrows wrap, Home and End jump, anything else is not a tab key.
assert.equal(nextTabIndex(0, 2, 'ArrowRight'), 1)
assert.equal(nextTabIndex(1, 2, 'ArrowRight'), 0, 'wraps forward')
assert.equal(nextTabIndex(0, 2, 'ArrowLeft'), 1, 'wraps back')
assert.equal(nextTabIndex(1, 3, 'ArrowDown'), 2)
assert.equal(nextTabIndex(2, 3, 'Home'), 0)
assert.equal(nextTabIndex(0, 3, 'End'), 2)
assert.equal(nextTabIndex(0, 2, 'Enter'), -1)
assert.equal(nextTabIndex(0, 0, 'ArrowRight'), -1, 'no tabs, no move')
assert.equal(nextTabIndex(9, 2, 'ArrowRight'), 1, 'a bad current index starts at the first tab')

console.log('table, dialog and tab style 0.12.100: PASS')
