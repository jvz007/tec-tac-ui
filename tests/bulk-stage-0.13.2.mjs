// 0.13.2 (Core 1.18.42): "Upgrade selected" stages the ticked modules as one batch on /api/tfd/modules/catalog/online/stage/batch/.
// Covers the request body, who can be ticked, the 50 cap, the page wiring (stage, install order, Installed tab, Core's sentence on
// a refusal), the removed run path, the unchanged selection helpers, no storage or hand-built headers, and LF line endings.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const store = []
globalThis.localStorage = { getItem: (key) => (key === 'access_token' ? 'tok-1' : null), setItem: (...a) => store.push(a), removeItem() {} }
globalThis.sessionStorage = { getItem: () => null, setItem: (...a) => store.push(a), removeItem() {} }
globalThis.window = { _env_: { PROD_URL: 'https://rmm.example.test' }, dispatchEvent() {} }
const calls = []
globalThis.fetch = async (url, options) => {
  calls.push({ url, options })
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
}
const modulesSource = read('../src/modules.js').replace(/from '[.][/]api'/, `from '${new URL('../src/api.js', import.meta.url).href}'`)
const modules = await import(`data:text/javascript;base64,${Buffer.from(modulesSource).toString('base64')}`)
const b = await import(new URL('../src/module-bulk-upgrade.js', import.meta.url).href)

// (a) the call
const items = [{ repository_id: 'lic', module_id: 'a', version: '1.1.0' }]
await modules.stageOnlineBatch(items)
assert.equal(calls.length, 1)
assert.match(String(calls[0].url), /\/api\/tfd\/modules\/catalog\/online\/stage\/batch\/$/)
assert.equal(calls[0].options.method, 'POST')
const sent = JSON.parse(calls[0].options.body)
assert.deepEqual(sent, { items })
for (const key of ['purpose', 'licence_override_reason', 'disable_replaced', 'modules']) assert.equal(key in sent, false, `${key} is never sent`)

// (b) items come from ticked, eligible rows only
const repos = [{ id: 'lic', kind: 'licensing' }, { id: 'off', kind: 'official' }]
const row = (id, extra = {}) => ({ id, name: id.toUpperCase(), installed: true, installed_version: '1.0.0', latest_version: '1.1.0', update_available: true, compatible: true, selected_repository_id: 'lic', ...extra })
const blockedEntry = { module_id: 'blk', installable: false, blocked_reason: 'Needs Tec-Tac Core 1.18.40.' }
const ctx = { update: (item) => (item.id === 'blk' ? blockedEntry : null), repositories: repos }
const catalog = [
  row('a'), row('b', { latest_version: '2.0.0' }), row('c'), row('blk'),
  row('ext', { selected_repository_id: 'off' }), row('bad', { compatible: false }), row('conf', { source_conflict: true }),
  row('new', { installed: false, update_available: false }), row('same', { update_available: false }), row('nover', { latest_version: '' }),
]
assert.deepEqual(b.batchItems(['a', 'b', 'blk', 'ext', 'bad', 'conf', 'new', 'same', 'nover', 'gone'], catalog, ctx), [
  { repository_id: 'lic', module_id: 'a', version: '1.1.0' },
  { repository_id: 'lic', module_id: 'b', version: '2.0.0' },
], 'only eligible ticked rows, with their own repository and latest version')
assert.deepEqual(b.batchItems(['a'], catalog, ctx).map((i) => Object.keys(i).sort().join()), ['module_id,repository_id,version'])
assert.deepEqual(b.batchItems([], catalog, ctx), [])

// (e) the button
const on = { count: 2, canManage: true, jobRunning: false, inspecting: false, staged: null }
assert.equal(b.upgradeSelectedDisabled(on), false)
for (const [k, v] of [['count', 0], ['canManage', false], ['jobRunning', true], ['inspecting', true], ['staged', {}], ['count', 51]]) assert.equal(b.upgradeSelectedDisabled({ ...on, [k]: v }), true, `${k} turns it off`)
assert.equal(b.upgradeSelectedDisabled({ ...on, count: 50 }), false, '50 is allowed')
assert.equal(b.MAX_BATCH, 50)
assert.equal(b.upgradeSelectedHint(50), '')
assert.match(b.upgradeSelectedHint(53), /at most 50/)
assert.match(b.upgradeSelectedHint(53), /Untick 3/)

// (g) selection helpers as before
assert.deepEqual(b.bulkEligibility(row('a'), ctx), { eligible: true, reason: '' })
assert.deepEqual(b.bulkEligibility(row('blk'), ctx), { eligible: false, reason: 'Needs Tec-Tac Core 1.18.40.' })
assert.deepEqual(b.bulkEligibility(row('ext', { selected_repository_id: 'off' }), ctx), { eligible: false, reason: 'Upgrade on its own' })
assert.deepEqual(b.eligibleIds(catalog, ctx), ['a', 'b', 'c'])
assert.equal(b.upgradeSelectedLabel(2), 'Upgrade selected (2)')
assert.equal(b.upgradeSelectedLabel(0), 'Upgrade selected (0)')
const sel = b.toggleSelection(b.toggleSelection([], 'a', true), 'b', true)
assert.deepEqual(sel, ['a', 'b'])
assert.deepEqual(b.toggleSelection(sel, 'a', false), ['b'])
assert.deepEqual(b.pruneSelection(['a', 'b', 'gone'], catalog, ctx), ['a', 'b'])
assert.deepEqual(b.pruneSelection(['a', 'ext'], catalog, ctx), ['a'])

// the state: select all trims to 50
// The state file imports './module-bulk-upgrade' without an extension (as Vite allows), so it is loaded from a temporary copy that names the file.
const tmpState = new URL('./.tmp-bulk-state-0.13.2.mjs', import.meta.url)
fs.writeFileSync(tmpState, read('../src/module-bulk-upgrade-state.js').replace("'./module-bulk-upgrade'", `'${new URL('../src/module-bulk-upgrade.js', import.meta.url).href}'`))
let useBulkUpgrade
try { ({ useBulkUpgrade } = await import(tmpState.href)) } finally { fs.rmSync(tmpState, { force: true }) }
const many = Array.from({ length: 60 }, (_, i) => row(`m${i}`))
const state = useBulkUpgrade({ catalog: () => many, repositories: () => repos, update: () => null, canManage: () => true, busyElsewhere: () => ({ jobRunning: false, inspecting: false, staged: null }) })
assert.equal(state.upgradableCount.value, 60)
assert.match(state.bulkHint.value, /first 50/)
state.selectAllUpgradable()
assert.equal(state.bulkSelected.value.length, 50)
assert.equal(state.bulkDisabled.value, false)
state.bulkSelected.value = many.slice(0, 51).map((r) => r.id)
assert.equal(state.bulkDisabled.value, true, 'over 50 ticked turns the button off')
assert.match(state.bulkHint.value, /Untick 1/)
state.clearBulkSelection()
assert.deepEqual(state.bulkSelected.value, [])

// (c) and (d) the page wiring (source level; the SFC needs the Vue plugin)
const view = read('../src/views/ModulesView.vue')
const fn = view.slice(view.indexOf('async function stageBulkUpgrade()'), view.indexOf('async function refresh('))
assert.match(fn, /bulkDisabled\.value \|\| !canManage\.value \|\| inspecting\.value \|\| jobRunning\.value \|\| staged\.value/, 'guarded like stageOnline')
assert.match(fn, /batchItems\(bulkSelected\.value, onlineCatalog\.value, bulkCtx\(\)\)/)
assert.match(fn, /inspecting\.value = true/)
assert.match(fn, /staged\.value = await stageOnlineBatch\(items\)/)
assert.match(fn, /installOrder\.value = \[\.\.\.\(plan\.value\?\.order \|\| stagedRows\.value\.map\(\(row\) => row\.id\)\)\]/)
assert.match(fn, /activeTab\.value = 'installed'/)
assert.match(fn, /bulkSelected\.value = \[\]/)
assert.match(fn, /catch \(e\) \{\s*error\.value = e\.message/, "a refusal shows Core's sentence")
assert.ok(fn.indexOf('staged.value = await') < fn.indexOf('catch (e)'), 'staged is set only on success')
assert.doesNotMatch(fn, /noteLicenceRefusal|licenceReason|override/i, 'no licence-override retry on the batch route')
assert.match(fn, /finally \{\s*inspecting\.value = false/)
assert.match(view, /@click="stageBulkUpgrade"/)
assert.match(view, /bulkHint/)
assert.match(view, /function kindOf\(payload\) \{ return \(payload\?\.kind \|\| \(payload\?\.preview \|\| payload\)\?\.kind\) === 'batch' \? 'batch' : 'artifact' \}/, 'the existing install path handles kind batch')
assert.ok(view.split('\n').length < 1400, 'ModulesView.vue stays under 1400 lines')
assert.match(view, /<ModuleJobPanel v-if="activeJob"[^>]*@reload-tec-tac="reloadTecTac"/, 'the existing job panel and Reload stay')

// (f) the run path is gone
assert.equal(fs.existsSync(new URL('../src/components/modules/ModuleUpgradeRun.vue', import.meta.url)), false)
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)]))
const allSrc = walk(new URL('../src/', import.meta.url)).map((f) => fs.readFileSync(f, 'utf8')).join('\n')
for (const name of ['planOnlineUpgrade', 'startOnlineUpgradeRun', 'getOnlineUpgradeRun', 'stopOnlineUpgradeRun', 'ModuleUpgradeRun', 'bulkRunActive', 'createRunPoller', 'BULK_PURPOSE', 'bulkPoller', 'bulkPlanGate']) assert.equal(allSrc.includes(name), false, `${name} is gone from src/`)
assert.doesNotMatch(allSrc, /purpose\s*[:=]\s*['"]upgrade['"]/, "no purpose 'upgrade' in src/")
assert.doesNotMatch(allSrc, /catalog\/online\/(plan|install)\//, 'no online plan or install route in src/')

// (h) no storage, no hand-built headers
assert.deepEqual(store, [], 'nothing was written to browser storage')
assert.doesNotMatch(read('../src/module-bulk-upgrade.js') + read('../src/module-bulk-upgrade-state.js') + fn, /localStorage|sessionStorage|Authorization|headers/)
assert.doesNotMatch(modulesSource.slice(modulesSource.indexOf('stageOnlineBatch')), /localStorage|sessionStorage|Authorization/)

// (i) LF line endings
for (const file of ['../src/modules.js', '../src/views/ModulesView.vue', '../src/module-bulk-upgrade.js', '../src/module-bulk-upgrade-state.js', '../tec_tac_package.json', '../VERSION', '../package.json', '../docs/releases/RELEASE_NOTES_0.13.2.md', './bulk-stage-0.13.2.mjs', './release-0.13.9.mjs']) {
  assert.equal(read(file).includes('\r'), false, `${file} uses LF`)
}
console.log('bulk-stage-0.13.2: PASS')
