// 0.12.94: the shell's top bar paints above page content and below shell dialogs, so header popups (Alerts) are not covered by page bars.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const app = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Every declaration block for an exact class selector, in source order.
function blocksFor(selector) {
  const pattern = new RegExp(`(?:^|[}\\s,])${escape(selector)}\\{([^}]*)\\}`, 'g')
  return [...css.matchAll(pattern)].map((match) => match[1])
}
// Every z-index declared for a selector.
function zIndexesFor(selector) {
  return blocksFor(selector)
    .flatMap((block) => [...block.matchAll(/(?:^|;)z-index:(-?\d+)/g)].map((match) => Number(match[1])))
}

// (1) the top bar is a positioned layer with its own z-index.
const topbar = blocksFor('.topbar')[0]
assert.ok(topbar, 'the .topbar rule exists')
assert.match(topbar, /(?:^|;)position:(relative|sticky)(?:;|$)/)
const topbarZ = zIndexesFor('.topbar')
assert.equal(topbarZ.length, 1, 'one z-index on the top bar')
const layer = topbarZ[0]
assert.ok(Number.isInteger(layer), 'the top bar z-index is a number')

// (2) above every page-level layer that can sit under it.
const pageLayers = ['.lifecycle-progress', '.dashboard-toolbar', '.rail-search-wrap', '.role-actionbar', '.resource-context-popover', '.system-trust-popover', '.module-trust-popover']
for (const selector of pageLayers) {
  const values = zIndexesFor(selector)
  assert.ok(values.length, `${selector} declares a z-index`)
  for (const value of values) assert.ok(layer > value, `${selector} (${value}) is under the top bar (${layer})`)
}

// (3) below every shell dialog, drawer and backdrop, so a dialog still covers the top bar.
const shellLayers = ['.help-drawer-backdrop', '.modal-backdrop', '.nav-context-menu', '.quick-actions-backdrop', '.toast-stack', '.notice-drawer-backdrop']
for (const selector of shellLayers) {
  const values = zIndexesFor(selector)
  assert.ok(values.length, `${selector} declares a z-index`)
  for (const value of values) assert.ok(layer < value, `${selector} (${value}) is above the top bar (${layer})`)
}

// (4) the frosted bar is kept, and the header contributions still live inside the top bar.
assert.match(topbar, /backdrop-filter:blur\(8px\)/)
assert.match(topbar, /grid-area:topbar/)
const barStart = app.indexOf('<header class="topbar">')
const barEnd = app.indexOf('</header>', barStart)
const contributions = app.indexOf('class="module-header-contributions"')
assert.ok(barStart >= 0 && barEnd > barStart, 'App.vue has the top bar header')
assert.ok(contributions > barStart && contributions < barEnd, 'header contributions render inside the top bar')

// (5) the header note is in the module header doc.
const doc = fs.readFileSync(new URL('../docs/module-header.md', import.meta.url), 'utf8')
assert.match(doc, /top bar layer \(0\.12\.94\)/)

console.log('topbar-stacking-0.12.94: ok')
