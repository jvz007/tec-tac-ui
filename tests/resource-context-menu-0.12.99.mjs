// 0.12.99 (CO23, CK10, U3): right-click menus on client and site rows of Clients and Sites. Built-in entries follow the row
// buttons' permission checks (AD-12), contributed client.context-menu and site.context-menu actions follow a divider and run
// as the Extensions button runs them, the menu stays inside the viewport and closes on Escape, an outside click, scroll,
// resize and a route change. Modules are unchanged.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const menu = await import(new URL('../src/resource-context-menu.js', import.meta.url).href)
const { createContextActionRegistry } = await import(new URL('../src/context-actions.js', import.meta.url).href)
const workflows = await import(new URL('../src/extension-surface-workflows.js', import.meta.url).href)
const view = read('../src/views/ResourcesView.vue')
const component = read('../src/components/ResourceContextMenu.vue')

// A registry with the module actions Johan named: Checks, Remote Background, and a dangerous and a disabled one.
const ran = []
const registry = createContextActionRegistry({ confirm: async () => true })
const reg = (id, resource, label, extra = {}) => registry.forModule(id.split('.')[0]).register({ id, resource, label, placements: [`${resource}.context-menu`], ...extra }, async (context) => { ran.push([id, context]) })
reg('checks.run-client', 'client', 'Run all checks')
reg('checks.run-site', 'site', 'Run all checks')
reg('remote-background.send-command-client', 'client', 'Send command')
reg('remote-background.send-command-site', 'site', 'Send command')
reg('scriptexecution.run-client', 'client', 'Run a script', { dangerous: true })
reg('reportmanager.report-client', 'client', 'Run a report', { enabled: () => ({ enabled: false, reason: 'No report is set up.' }) })

const client = { id: 1, name: 'Acme' }
const site = { id: 7, name: 'Depot', client_id: 1 }
const handlers = (log) => ({
  addSite: (r) => log.push(['add-site', r.id]), edit: (r) => log.push(['edit', r.id]), fields: (r) => log.push(['fields', r.id]), remove: (r) => log.push(['delete', r.id]),
})
const build = (resourceType, row, can, parent = {}) => menu.resourceMenuEntries({
  resourceType, row, can, handlers: handlers([]), moduleActions: workflows.resourceContextMenuActions(registry, resourceType, row, parent),
})
const ids = (entries) => entries.map((entry) => entry.id)

// (1) Client menu: built-in entries, a divider, then every contributed action.
const full = { manageClients: true, manageSites: true }
const clientEntries = build('client', client, full)
// The registry orders contributed actions; the test checks the set, not the order.
assert.deepEqual(ids(clientEntries).slice(0, 5), ['client.add-site', 'client.edit', 'client.fields', 'client.delete', 'divider'])
assert.deepEqual(ids(clientEntries).slice(5).sort(), ['checks.run-client', 'remote-background.send-command-client', 'reportmanager.report-client', 'scriptexecution.run-client'])
assert.deepEqual(clientEntries.filter((e) => !e.divider).map((e) => e.label).slice(0, 4), ['Add site', 'Edit client', 'Edit fields', 'Delete client'])
// (2) Site menu, with the parent client in the action context.
const siteEntries = build('site', site, full, { client })
assert.deepEqual(ids(siteEntries).slice(0, 4), ['site.edit', 'site.fields', 'site.delete', 'divider'])
assert.deepEqual(ids(siteEntries).slice(4).sort(), ['checks.run-site', 'remote-background.send-command-site'])
assert.deepEqual(siteEntries.filter((e) => !e.divider).map((e) => e.label).slice(0, 3), ['Edit site', 'Edit fields', 'Delete site'])
// (3) A role without Manage sites sees no Add site or Edit site; one without Manage clients sees no client entries.
assert.ok(!ids(build('client', client, { manageClients: true, manageSites: false })).includes('client.add-site'))
assert.deepEqual(ids(build('site', site, { manageClients: true, manageSites: false }, { client })).sort(), ['checks.run-site', 'remote-background.send-command-site'])
assert.deepEqual(ids(build('client', client, { manageClients: false, manageSites: true })).slice(0, 2), ['client.add-site', 'divider'])
// No built-in entry left: no divider, only the contributed actions.
{
  const none = ids(build('client', client, { manageClients: false, manageSites: false }))
  assert.equal(none.includes('divider'), false)
  assert.ok(none.includes('checks.run-client'))
}
// Nothing at all: no entries, so the page leaves the browser's menu alone.
assert.deepEqual(menu.resourceMenuEntries({ resourceType: 'client', row: client, can: {}, handlers: handlers([]), moduleActions: [] }), [])

// (4) A disabled contributed action stays, with its reason, and does not run. A dangerous one is marked.
const report = clientEntries.find((e) => e.id === 'reportmanager.report-client')
assert.equal(report.disabled, true)
assert.equal(report.reason, 'No report is set up.')
assert.equal(clientEntries.find((e) => e.id === 'scriptexecution.run-client').danger, true)
assert.equal(clientEntries.find((e) => e.id === 'checks.run-client').disabled, false)
assert.equal(await workflows.executeResourceContextMenuAction(registry, report.action, 'client', client), undefined)
assert.equal(ran.length, 0, 'a disabled action does not run')
assert.match(component, /if \(entry\.disabled\) return/)
assert.match(component, /:aria-disabled="entry\.disabled \? 'true' : undefined"/)
assert.match(component, /<small v-if="entry\.disabled && entry\.reason">\{\{ entry\.reason \}\}<\/small>/)

// (5) The context the menu passes to execute equals resourceActionContext (modules unchanged).
await workflows.executeResourceContextMenuAction(registry, clientEntries.find((e) => e.id === 'checks.run-client').action, 'client', client)
assert.equal(ran.at(-1)[0], 'checks.run-client')
const ctxArg = { ...ran.at(-1)[1] }
delete ctxArg.confirm
assert.deepEqual(ctxArg, workflows.resourceActionContext('client', client))
await workflows.executeResourceContextMenuAction(registry, siteEntries.find((e) => e.id === 'checks.run-site').action, 'site', site, { client })
const siteCtx = { ...ran.at(-1)[1] }
delete siteCtx.confirm
assert.deepEqual(siteCtx, workflows.resourceActionContext('site', site, { client }))
assert.deepEqual(siteCtx.client, client)

// (6) The page's handlers, run from their real source: a right-click selects a client row, leaves text fields alone and
// leaves the browser's menu when there is nothing to offer; a chosen entry runs; a dangerous action asks the Yes or No
// question before it runs.
function extract(name, isAsync = false) {
  const head = `${isAsync ? 'async ' : ''}function ${name}(`
  const start = view.indexOf(head)
  assert.ok(start > 0, `${name} exists`)
  return view.slice(start, view.indexOf('\n}\n', start) + 3)
}
const bodyOf = (source) => source.slice(source.indexOf('{') + 1, source.lastIndexOf('}'))
function openHarness({ can = full, target = {}, hasActions = true } = {}) {
  const log = { selected: [], prevented: 0 }
  const resourceMenu = { value: null }
  const holder = { id: 0 }
  const body = bodyOf(extract('openResourceMenu')).replace('resourceMenuId += 1', 'holder.id += 1').replace('id: resourceMenuId', 'id: holder.id')
  const run = new Function('event', 'resourceType', 'row', 'menuTargetIsTextField', 'chooseClient', 'resourceMenuEntries', 'canManageClients', 'canManageSites', 'openCreateSite', 'openEditClient', 'openCustomFields', 'openDeleteClient', 'openEditSite', 'openDeleteSite', 'moduleActions', 'menuAnchor', 'resourceMenu', 'holder', body)
  const event = { target, currentTarget: { id: 'row' }, clientX: 40, clientY: 50, preventDefault: () => { log.prevented += 1 } }
  run(event, 'client', client, menu.menuTargetIsTextField, (id) => log.selected.push(id), menu.resourceMenuEntries, { value: can.manageClients }, { value: can.manageSites }, () => {}, () => {}, () => {}, () => {}, () => {}, () => {},
    () => (hasActions ? workflows.resourceContextMenuActions(registry, 'client', client) : []), menu.menuAnchor, resourceMenu, holder)
  return { log, resourceMenu }
}
{
  const r = openHarness()
  assert.deepEqual(r.log.selected, [1], 'the client row is selected')
  assert.equal(r.log.prevented, 1)
  assert.equal(r.resourceMenu.value.x, 40)
  assert.equal(r.resourceMenu.value.y, 50)
  assert.equal(r.resourceMenu.value.resourceType, 'client')
  assert.ok(r.resourceMenu.value.entries.length > 5)
}
{
  const r = openHarness({ target: { closest: (selector) => (selector.includes('input') ? {} : null) } })
  assert.equal(r.resourceMenu.value, null, 'never opens over a text field')
  assert.equal(r.log.prevented, 0)
}
{
  const r = openHarness({ can: { manageClients: false, manageSites: false }, hasActions: false })
  assert.equal(r.resourceMenu.value, null, 'nothing to offer: the browser menu stays')
  assert.equal(r.log.prevented, 0)
}
assert.equal(menu.menuTargetIsTextField({ closest: () => null }), false)
assert.equal(menu.menuTargetIsTextField(null), false)
// Chosen entries: a built-in one runs its handler; a contributed one goes through runModuleAction.
{
  const log = []
  const choose = new Function('entry', 'resourceMenu', 'runModuleAction', bodyOf(extract('chooseResourceMenuEntry')))
  const resourceMenu = { value: { resourceType: 'client', row: client } }
  choose({ kind: 'builtin', run: () => log.push('builtin') }, resourceMenu, () => log.push('module'))
  assert.deepEqual(log, ['builtin'])
  assert.equal(resourceMenu.value, null, 'the menu closes')
  choose({ kind: 'module', action: { id: 'x' } }, { value: { resourceType: 'client', row: client } }, (action, type, row) => log.push(['module', action.id, type, row.id]))
  assert.deepEqual(log.at(-1), ['module', 'x', 'client', 1])
  choose({ kind: 'module', disabled: true, action: { id: 'y' } }, { value: { resourceType: 'client', row: client } }, () => log.push('wrong'))
  assert.equal(log.includes('wrong'), false)
}
// A dangerous contributed action asks the one Yes or No question before it runs (runModuleAction, unchanged).
{
  const runSource = bodyOf(extract('runModuleAction', true))
  const make = (answer) => {
    const log = { asked: [], executed: 0 }
    const run = new Function('action', 'resourceType', 'row', 'moduleActionBusyId', 'confirmAction', 'error', 'notice', 'executeResourceContextMenuAction', 'contextActions', 'moduleActionParent', 'message', `return (async () => {${runSource}})()`)
    const call = (action) => run(action, 'client', client, { value: '' }, async (options) => { log.asked.push(options); return answer }, { value: '' }, { value: '' },
      async () => { log.executed += 1 }, registry, () => ({}), (e, f) => e?.message || f)
    return { log, call }
  }
  const yes = make(true)
  await yes.call({ id: 'a', label: 'Run a script', dangerous: true })
  assert.equal(yes.log.asked.length, 1)
  assert.equal(yes.log.asked[0].question, 'Run Run a script?')
  assert.equal(yes.log.asked[0].danger, true)
  assert.equal(yes.log.executed, 1)
  const no = make(false)
  await no.call({ id: 'a', label: 'Run a script', dangerous: true })
  assert.equal(no.log.executed, 0)
  const plain = make(true)
  await plain.call({ id: 'b', label: 'Run all checks' })
  assert.equal(plain.log.asked.length, 0)
  assert.equal(plain.log.executed, 1)
  const disabled = make(true)
  await disabled.call({ id: 'c', label: 'X', state: { enabled: false, reason: 'No.' } })
  assert.equal(disabled.log.executed, 0)
}

// (7) Placement stays inside the viewport; keys move through the items.
const vp = { width: 1000, height: 700 }
assert.deepEqual(menu.clampMenuPosition({ x: 990, y: 690 }, { width: 220, height: 300 }, vp), { x: 772, y: 392 })
assert.deepEqual(menu.clampMenuPosition({ x: -5, y: -5 }, { width: 220, height: 300 }, vp), { x: 8, y: 8 })
assert.deepEqual(menu.clampMenuPosition({ x: 100, y: 100 }, { width: 220, height: 300 }, vp), { x: 100, y: 100 })
assert.deepEqual(menu.clampMenuPosition({ x: 50, y: 50 }, { width: 2000, height: 2000 }, vp), { x: 8, y: 8 })
assert.equal(menu.nextMenuIndex(-1, 'ArrowDown', 3), 0)
assert.equal(menu.nextMenuIndex(2, 'ArrowDown', 3), 0)
assert.equal(menu.nextMenuIndex(0, 'ArrowUp', 3), 2)
assert.equal(menu.nextMenuIndex(1, 'Home', 3), 0)
assert.equal(menu.nextMenuIndex(1, 'End', 3), 2)
assert.equal(menu.nextMenuIndex(0, 'ArrowDown', 0), -1)
// The keyboard (Shift+F10, the menu key) sends no pointer position: the menu opens under the row.
assert.deepEqual(menu.menuAnchor({ clientX: 0, clientY: 0 }, { getBoundingClientRect: () => ({ left: 100, bottom: 200 }) }), { x: 116, y: 200 })
assert.deepEqual(menu.menuAnchor({ clientX: 30, clientY: 40 }, { getBoundingClientRect: () => ({ left: 100, bottom: 200 }) }), { x: 30, y: 40 })

// (8) The component: roles, closing rules, focus.
assert.match(component, /role="menu"/)
assert.match(component, /role="menuitem"/)
assert.match(component, /role="separator"/)
assert.match(component, /event\.key === 'Escape'/)
assert.match(component, /addEventListener\('mousedown', onPointerOutside, true\)/)
assert.match(component, /addEventListener\('contextmenu', onPointerOutside, true\)/)
assert.match(component, /addEventListener\('scroll', onScroll, true\)/)
assert.match(component, /addEventListener\('resize', close\)/)
assert.match(component, /watch\(\(\) => route\?\.fullPath, close\)/)
assert.match(component, /ArrowDown/)
assert.match(component, /opener\.focus/)
assert.match(component, /clampMenuPosition/)
for (const type of ['mousedown', 'contextmenu', 'keydown']) assert.match(component, new RegExp(`removeEventListener\\('${type}'`))
assert.match(component, /removeEventListener\('scroll', onScroll, true\)/)
assert.match(component, /removeEventListener\('resize', close\)/)
assert.doesNotMatch(component, /localStorage|sessionStorage|access_token/)

// (9) The page: right-click on both row kinds, the Extensions button and the row buttons stay, no new palette.
assert.match(view, /@contextmenu="openResourceMenu\(\$event, 'client', client\)"/)
assert.match(view, /@contextmenu="openResourceMenu\(\$event, 'site', site\)"/)
assert.equal((view.match(/<summary class="btn sm">Extensions<\/summary>/g) || []).length, 2)
for (const label of ['openEditClient(client)', 'openDeleteClient(client)', 'openEditSite(site)', 'openDeleteSite(site)', "openCustomFields('client', client)", "openCustomFields('site', site)"]) assert.ok(view.includes(label), label)
assert.match(view, /<ResourceContextMenu v-if="resourceMenu"/)
const css = read('../src/styles.css')
const block = css.slice(css.indexOf('.resource-menu{'))
assert.doesNotMatch(block, /#[0-9a-fA-F]{3,6}\b/, 'the menu uses the existing tokens')
for (const token of ['--raised', '--line-2', '--accent-rgb', '--ink', '--danger']) assert.ok(block.includes(`var(${token}`), token)
assert.match(read('../docs/context-actions.md'), /right-click/i)

console.log('resource context menu 0.12.99: PASS')
