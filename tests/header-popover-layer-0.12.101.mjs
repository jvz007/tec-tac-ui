// 0.12.101: header pop-ups get a body-level layer. The layer sits once in the shell, outside the top bar and outside the popup
// window's layout; its z-index is above the top bar and below the help drawer and the shell dialogs. The header service keeps
// its keys and gains popoverTarget.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { createHeaderContributionRegistry, HEADER_POPOVER_TARGET } = await import(new URL('../src/header-contributions.js', import.meta.url).href)
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const app = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const doc = fs.readFileSync(new URL('../docs/module-header.md', import.meta.url), 'utf8')

// (1) the header service: popoverTarget is the selector, the existing keys are unchanged
assert.equal(HEADER_POPOVER_TARGET, '#tec-tac-popover-layer')
const registry = createHeaderContributionRegistry({ hasPermission: () => true })
const service = registry.forModule('alerts', { permissions: [] })
assert.equal(service.popoverTarget, '#tec-tac-popover-layer')
assert.deepEqual(Object.keys(service).sort(), ['clear', 'list', 'popoverTarget', 'register', 'unregister'])
for (const key of ['register', 'unregister', 'list', 'clear']) assert.equal(typeof service[key], 'function', `${key} is still a function`)
assert.ok(Object.isFrozen(service), 'the service object stays frozen')
// a registration still works and renders as before
const remove = service.register({ id: 'alerts.bell', label: 'Alerts bell', component: { render() { return null } } })
assert.equal(registry.list().length, 1)
assert.equal(registry.list()[0].id, 'alerts.bell')
remove()
assert.equal(registry.list().length, 0)

// (2) App.vue: one layer element, outside the top bar, inside the shell (not the popup layout)
const layer = '<div id="tec-tac-popover-layer" class="tec-tac-popover-layer"></div>'
assert.equal(app.split(layer).length - 1, 1, 'the layer element appears once')
const bar = app.indexOf('<header class="topbar">')
const barEnd = app.indexOf('</header>', bar)
const at = app.indexOf(layer)
assert.ok(at > barEnd, 'the layer sits after the top bar, not inside it')
assert.ok(at < app.indexOf('<main class="main">'), 'the layer sits before the main page')
const shellBlock = app.indexOf('<template v-if="!popupLayout">')
assert.ok(shellBlock > 0 && at > shellBlock, 'the layer is inside the shell block, which the popup window does not render')
assert.ok(app.indexOf('</template>', at) > at, 'the layer is closed inside the shell block')
// the module header contributions stay in the top bar
assert.ok(app.indexOf('class="module-header-contributions"') < barEnd, 'header contributions still render in the top bar')

// (3) styles.css: one rule, click-through, with a z-index between the top bar and the help drawer and modal backdrops
function blockFor(selector) {
  const pattern = new RegExp(`(?:^|[}\\s,])${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`)
  const match = css.match(pattern)
  return match ? match[1] : null
}
function zIndexFor(selector) {
  const block = blockFor(selector)
  assert.ok(block, `${selector} has a rule`)
  const match = block.match(/(?:^|;)z-index:(-?\d+)/)
  assert.ok(match, `${selector} sets a z-index`)
  return Number(match[1])
}
const layerRule = blockFor('.tec-tac-popover-layer')
assert.ok(layerRule, 'the layer has a rule')
assert.match(layerRule, /position:fixed/)
assert.match(layerRule, /pointer-events:none/, 'the layer lets clicks through')
assert.match(css, /\.tec-tac-popover-layer>\*\{pointer-events:auto\}/, 'its children take the pointer')
const layerZ = zIndexFor('.tec-tac-popover-layer')
assert.ok(layerZ > zIndexFor('.topbar'), 'the layer is above the top bar (100)')
assert.ok(layerZ < zIndexFor('.help-drawer-backdrop'), 'the layer is below the help drawer')
assert.ok(layerZ < zIndexFor('.modal-backdrop'), 'the layer is below the shell dialogs')
assert.ok(layerZ < zIndexFor('.quick-actions-backdrop'), 'the layer is below quick actions')
assert.ok(layerZ < zIndexFor('.toast-stack'), 'the layer is below toasts')
assert.ok(layerZ < zIndexFor('.confirm-backdrop'), 'the layer is below the confirm dialog')

// (4) the docs describe the key and the rule
assert.match(doc, /## Pop-ups from a header item \(UI 0\.12\.101\)/)
assert.match(doc, /header\.popoverTarget/)
assert.match(doc, /'#tec-tac-popover-layer'/)
assert.match(doc, /not rendered in a popup window/)

console.log('header popover layer 0.12.101: ok')
