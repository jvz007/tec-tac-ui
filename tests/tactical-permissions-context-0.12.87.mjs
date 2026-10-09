// 0.12.87: tactical_permissions in the runtime context and hasTacticalPermission(flag).
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { emptyRuntimeContext, normalizeBackendRuntimeContext, normalizeTacticalPermissions } = await import('../src/runtime-context.js')

assert.deepEqual(emptyRuntimeContext().tactical_permissions, {})
assert.deepEqual(normalizeBackendRuntimeContext({}, {}).tactical_permissions, {})
const n = normalizeBackendRuntimeContext({
  tactical_permissions: { can_list_agents: true, can_edit_agent: false, can_a: 'true', can_b: 1, can_c: null, not_a_flag: true, can_UP: true },
}, {})
assert.deepEqual(n.tactical_permissions, { can_list_agents: true, can_edit_agent: false })
for (const bad of [[true], 'x', 5, null, undefined]) assert.deepEqual(normalizeTacticalPermissions(bad), {})
assert.deepEqual(normalizeBackendRuntimeContext({ tactical_permissions: ['can_x'] }).tactical_permissions, {})

// Additive: every earlier key is still there.
for (const key of ['user', 'permissions', 'extensions', 'capabilities', 'module_status', 'modules', 'preferences', 'locale', 'timeZone', 'dateTimeFormat', 'tactical_ui', 'tactical_web_ui', 'preferences_initialized', 'preferences_updated_at', 'notice_unread_count', 'module_register_timeout_seconds', 'server_url']) {
  assert.ok(key in n, key)
  assert.ok(key in emptyRuntimeContext(), key)
}

// The helper as main.js builds it, run against the real source text.
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
const m = /const hasTacticalPermission = \(flag\) => \(([\s\S]*?)\n  \)\n/.exec(main)
assert.ok(m, 'hasTacticalPermission is defined in main.js')
const make = (state) => new Function('state', `return (flag) => (${m[1]})`)(state)
const state = { context: n }
const has = make(state)
assert.equal(has('can_list_agents'), true)
assert.equal(has('can_edit_agent'), false)
assert.equal(has('can_unknown'), false)
assert.equal(has(undefined), false)
assert.equal(has(5), false)
assert.equal(has(['can_list_agents']), false)
state.context = emptyRuntimeContext({ superuser: true })
assert.equal(has('can_list_agents'), false, 'no superuser special case')
state.context = { ...n, tactical_permissions: { can_list_agents: false } }
assert.equal(has('can_list_agents'), false, 'follows a reloaded context')
state.context = {}
assert.equal(has('can_list_agents'), false, 'an older Core')
assert.match(main, /hasTacticalPermission,\s*\n\s*tacticalOperation,/)

// hasPermission is unchanged.
assert.match(main, /const hasPermission = \(code\) => \(\s*\n\s*state\.context\.user\?\.superuser \|\| permissionSet\.has\(code\)\s*\n\s*\)/)

const pkg = JSON.parse(fs.readFileSync(new URL('../tec_tac_package.json', import.meta.url), 'utf8'))
assert.equal(pkg.requires['tec-tac-framework'], '>=1.17.11,<2.0.0')
console.log('tactical-permissions-context-0.12.87 ok')
