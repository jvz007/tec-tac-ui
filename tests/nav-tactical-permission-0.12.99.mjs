// 0.12.99: addNavigation accepts `tacticalPermission` (a Tactical flag or a list). The shell hides the item until every flag is
// strictly true in context.tactical_permissions, live, with no superuser shortcut. Items without it behave as before.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const { navItemPermitted } = await import(new URL('../src/extension-surface-workflows.js', import.meta.url).href)
const ctx = (over = {}) => ({ source: 'backend', user: {}, permissions: [], tactical_permissions: {}, ...over })
const item = { to: '/agents/pending', label: 'Pending actions', tacticalPermission: 'can_list_pendingactions' }

assert.equal(navItemPermitted(item, ctx()), false, 'hidden without the flag')
assert.equal(navItemPermitted(item, ctx({ tactical_permissions: { can_list_pendingactions: false } })), false)
assert.equal(navItemPermitted(item, ctx({ tactical_permissions: { can_list_pendingactions: true } })), true)
for (const bad of ['true', 1, 'yes', null, {}]) {
  assert.equal(navItemPermitted(item, ctx({ tactical_permissions: { can_list_pendingactions: bad } })), false, `strict test: ${JSON.stringify(bad)}`)
}
// Live: the same item flips as the context changes.
const live = ctx()
assert.equal(navItemPermitted(item, live), false)
live.tactical_permissions = { can_list_pendingactions: true }
assert.equal(navItemPermitted(item, live), true)
live.tactical_permissions = {}
assert.equal(navItemPermitted(item, live), false)
// A list needs every flag.
const both = { ...item, tacticalPermission: ['can_list_pendingactions', 'can_manage_pendingactions'] }
assert.equal(navItemPermitted(both, ctx({ tactical_permissions: { can_list_pendingactions: true } })), false)
assert.equal(navItemPermitted(both, ctx({ tactical_permissions: { can_list_pendingactions: true, can_manage_pendingactions: true } })), true)
// A superuser does not bypass it.
assert.equal(navItemPermitted(item, ctx({ user: { superuser: true } })), false)
assert.equal(navItemPermitted(item, ctx({ user: { superuser: true }, tactical_permissions: { can_list_pendingactions: true } })), true)
// A missing or non-backend context hides it.
assert.equal(navItemPermitted(item, {}), false)
assert.equal(navItemPermitted(item, { tactical_permissions: { can_list_pendingactions: true } }), false)
assert.equal(navItemPermitted(item, ctx({ source: 'fallback', tactical_permissions: { can_list_pendingactions: true } })), false)
assert.equal(navItemPermitted(item, ctx({ tactical_permissions: undefined })), false)
// It combines with permission: both rules must pass.
const combined = { ...item, permission: 'core.agents.view' }
assert.equal(navItemPermitted(combined, ctx({ tactical_permissions: { can_list_pendingactions: true } })), false)
assert.equal(navItemPermitted(combined, ctx({ permissions: ['core.agents.view'], tactical_permissions: { can_list_pendingactions: true } })), true)
assert.equal(navItemPermitted(combined, ctx({ permissions: ['core.agents.view'] })), false)
// Items without the field are unchanged.
assert.equal(navItemPermitted({ to: '/a', label: 'A' }, {}), true)
assert.equal(navItemPermitted({ to: '/a', label: 'A', permission: 'x' }, ctx()), false)
assert.equal(navItemPermitted({ to: '/a', label: 'A', permission: 'x' }, ctx({ permissions: ['x'] })), true)
assert.equal(navItemPermitted({ to: '/a', label: 'A', permissions: ['x', 'y'] }, ctx({ user: { superuser: true } })), true)
assert.equal(navItemPermitted({ to: '/a', label: 'A', tacticalPermission: '' }, {}), true)

// The field survives addNavigation: the module loader spreads the item, and the shell hands the tactical flags to the test.
assert.match(read('../src/module-loader.js'), /runtime\.addNavigation\(\{\s*\.\.\.item,/)
assert.match(read('../src/App.vue'), /tactical_permissions: state\.context\.tactical_permissions \|\| \{\}/)
assert.match(read('../docs/module-runtime-api.md'), /tacticalPermission/)

console.log('nav tactical permission 0.12.99: PASS')
