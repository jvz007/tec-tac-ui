// 0.12.93: tactical_scope in the runtime context and context.tacticalScope() (Core 1.17.17).
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { emptyRuntimeContext, normalizeBackendRuntimeContext, normalizeTacticalScope } = await import('../src/runtime-context.js')
const NONE = { mode: 'none', unrestricted: false, whole_client_count: 0, site_count: 0 }

assert.deepEqual(emptyRuntimeContext().tactical_scope, NONE)
assert.deepEqual(normalizeBackendRuntimeContext({}, {}).tactical_scope, NONE, 'an older Core')
for (const bad of [[], ['mode'], 'x', 5, null, undefined, true]) assert.deepEqual(normalizeTacticalScope(bad), NONE)

for (const mode of ['unrestricted', 'clients', 'sites', 'mixed', 'none']) {
  const value = { mode, unrestricted: mode === 'unrestricted', whole_client_count: 3, site_count: 7 }
  assert.deepEqual(normalizeTacticalScope(value), value, mode)
  assert.deepEqual(normalizeBackendRuntimeContext({ tactical_scope: value }).tactical_scope, value)
}
assert.equal(normalizeTacticalScope({ mode: 'everything', unrestricted: true }).mode, 'none')
assert.equal(normalizeTacticalScope({ mode: 'everything', unrestricted: true }).unrestricted, false)
for (const count of ['3', -1, 1.5, NaN, null, Infinity]) {
  const r = normalizeTacticalScope({ mode: 'clients', whole_client_count: count, site_count: count })
  assert.equal(r.whole_client_count, 0, String(count))
  assert.equal(r.site_count, 0, String(count))
}
assert.equal(normalizeTacticalScope({ mode: 'unrestricted', unrestricted: 'true' }).unrestricted, false)
assert.equal(normalizeTacticalScope({ mode: 'clients', unrestricted: true }).unrestricted, false, 'inconsistent pair fails closed')
assert.equal(normalizeTacticalScope({ mode: 'unrestricted', unrestricted: false }).unrestricted, false)
assert.deepEqual(
  Object.keys(normalizeTacticalScope({ mode: 'sites', client_ids: [1], site_ids: [2], whole_client_count: 1, site_count: 2, extra: 1 })).sort(),
  ['mode', 'site_count', 'unrestricted', 'whole_client_count'],
  'id lists are dropped',
)

// Additive: every earlier key is still there.
for (const key of ['user', 'permissions', 'extensions', 'capabilities', 'module_status', 'modules', 'preferences', 'locale', 'timeZone', 'dateTimeFormat', 'tactical_ui', 'tactical_permissions', 'tactical_web_ui', 'preferences_initialized', 'preferences_updated_at', 'notice_unread_count', 'module_register_timeout_seconds', 'server_url']) {
  assert.ok(key in normalizeBackendRuntimeContext({}), key)
  assert.ok(key in emptyRuntimeContext(), key)
}

// The helper as main.js builds it, run against the real source text.
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
const m = /const tacticalScope = \(\) => (\(\{[\s\S]*?\}\))\n/.exec(main)
assert.ok(m, 'tacticalScope is defined in main.js')
const make = (state) => new Function('state', 'normalizeTacticalScope', `return () => ${m[1]}`)(state, normalizeTacticalScope)
const state = { context: normalizeBackendRuntimeContext({ tactical_scope: { mode: 'mixed', whole_client_count: 2, site_count: 4 } }) }
const scope = make(state)
const first = scope()
assert.deepEqual(first, { mode: 'mixed', unrestricted: false, whole_client_count: 2, site_count: 4 })
first.mode = 'unrestricted'
first.unrestricted = true
assert.equal(scope().mode, 'mixed', 'a fresh copy each call')
assert.equal(state.context.tactical_scope.mode, 'mixed')
state.context = normalizeBackendRuntimeContext({ tactical_scope: { mode: 'unrestricted', unrestricted: true } })
assert.equal(scope().unrestricted, true, 'follows a reloaded context')
state.context = {}
assert.deepEqual(scope(), NONE, 'empty state')
state.context = { ...emptyRuntimeContext({ superuser: true }) }
assert.deepEqual(scope(), NONE, 'no superuser special case')
state.context = { tactical_scope: { mode: 'clients', client_ids: [1] } }
assert.deepEqual(scope(), { ...NONE, mode: 'clients' }, 'normalised again on read')
assert.match(main, /import \{ normalizeTacticalScope \} from '\.\/runtime-context'/)
assert.match(main, /hasTacticalPermission,\s*\n\s*tacticalScope,\s*\n\s*tacticalOperation,/)

// hasPermission and hasTacticalPermission are unchanged.
assert.match(main, /const hasPermission = \(code\) => \(\s*\n\s*state\.context\.user\?\.superuser \|\| permissionSet\.has\(code\)\s*\n\s*\)/)
assert.match(main, /const hasTacticalPermission = \(flag\) => \(\s*\n\s*typeof flag === 'string' && state\.context\?\.tactical_permissions\?\.\[flag\] === true\s*\n\s*\)/)

assert.ok(!/^import .* from '\.\//m.test(fs.readFileSync(new URL('../src/runtime-context.js', import.meta.url), 'utf8')), 'runtime-context.js stays import-free')
const docs = fs.readFileSync(new URL('../docs/module-runtime-api.md', import.meta.url), 'utf8')
assert.ok(docs.includes('## tacticalScope()'))
assert.ok(docs.indexOf('## hasTacticalPermission(flag)') < docs.indexOf('## tacticalScope()'))
assert.ok(docs.includes('context.context.tactical_scope'))
const pkg = JSON.parse(fs.readFileSync(new URL('../tec_tac_package.json', import.meta.url), 'utf8'))
assert.equal(pkg.requires['tec-tac-framework'], '>=1.17.17,<2.0.0')
assert.equal(pkg.version, '0.12.93')
console.log('tactical-scope-context-0.12.93 ok')
