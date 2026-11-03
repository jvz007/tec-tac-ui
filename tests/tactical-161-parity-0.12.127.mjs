// 0.12.127 (docs/planning/tactical-1.6.1/IMPACT-TACTICAL-1.6.1.md, UI row; reviews/requests/ui.md "From Core 1.17.109" and
// "Held from UI 0.12.126").
// - The role editor has Tactical 1.6.1's can_use_file_browser ("Use File Browser") in the Agents group, right after
//   can_use_mesh. It shows only when the role Tactical returned has the key, so a Tactical 1.5.2 role neither shows it nor
//   gets it sent back.
// - The Online catalogue shows Core's category_warning as a warning chip beside the module name, text as sent.
// - Last checked names refresh.stale on the release path too.
// - Install after the downgrade Yes/No re-checks stageCheck.blocked.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')

// ---- role editor: can_use_file_browser ----
// access.js imports the transport, so its group list is read from the source.
const access = read('../src/access.js')
const agentsLine = access.split('\n').find((line) => line.includes("name: 'Agents'"))
assert.ok(agentsLine, 'the Agents group exists')
const agentKeys = [...agentsLine.matchAll(/'(can_[a-z_]+)'/g)].map((m) => m[1])
assert.equal(agentKeys.filter((k) => k === 'can_use_file_browser').length, 1, 'listed once')
assert.equal(agentKeys[agentKeys.indexOf('can_use_mesh') + 1], 'can_use_file_browser', 'next to the MeshCentral permission')
assert.equal((access.match(/can_use_file_browser/g) || []).length, 1, 'in no other group')
const permissionLabel = (key) => key.replace(/^can_/, '').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
assert.match(access, /export function permissionLabel\(key\) \{\n  return key\.replace\(\/\^can_\/, ''\)\.replaceAll\('_', ' '\)\.replace\(\/\\b\\w\/g, \(c\) => c\.toUpperCase\(\)\)\n\}/, 'the label rule is unchanged')
assert.equal(permissionLabel('can_use_file_browser'), 'Use File Browser')

// The editor shows, counts, snapshots and saves only keys present in the role Tactical returned.
const panel = read('../src/components/access/RolesPanel.vue')
assert.match(panel, /if \(!selected\.value \|\| !\(key in selected\.value\)\) return false/, 'a key the role lacks is not shown')
assert.match(panel, /for \(const key of group\.keys\) if \(key in selected\.value\) tactical\[key\] = !!selected\.value\[key\]/, 'the snapshot adds no missing key')
assert.match(panel, /const payload = applyScopePayload\(\{ \.\.\.selected\.value \}, scopeClients\.value, scopeSites\.value\)/, 'the PUT sends back only what Tactical returned')
assert.match(panel, /<label v-for="key in group\.keys" :key="key" class="permission-row"><input v-model="selected\[key\]"/, 'the rendered list is the filtered one')

// The same rules, run on a Tactical 1.5.2 role (no key) and a 1.6.1 role (key present).
const shown = (role) => agentKeys.filter((key) => key in role)
const payloadOf = (role) => ({ ...role })
const role152 = { id: 1, name: 'Tech', can_list_agents: true, can_use_mesh: true }
assert.equal(shown(role152).includes('can_use_file_browser'), false, '1.5.2: not shown')
assert.equal('can_use_file_browser' in payloadOf(role152), false, '1.5.2: never sent')
const role161 = { id: 1, name: 'Tech', can_list_agents: true, can_use_mesh: true, can_use_file_browser: true }
assert.equal(shown(role161).includes('can_use_file_browser'), true, '1.6.1: shown')
assert.equal(payloadOf(role161).can_use_file_browser, true, '1.6.1: sent back')

// ---- category_warning chip on the Online catalogue ----
const tables = await import(new URL('../src/module-manager-tables.js', import.meta.url).href)
assert.equal(tables.categoryWarning({ category_warning: 'Unclassified on the Licensing Server: treated as test' }), 'Unclassified on the Licensing Server: treated as test')
assert.equal(tables.categoryWarning({ category_warning: null }), '')
assert.equal(tables.categoryWarning({}), '', 'an older Core sends no field')
assert.equal(tables.categoryWarning({ category_warning: '   ' }), '')
assert.equal(tables.categoryWarning({ category_warning: { text: 'x' } }), '', 'only a string')
const cell = tables.onlineCell({ stage: () => {}, blocked: () => false })
const textOf = (node) => (typeof node === 'string' ? node : Array.isArray(node) ? node.map(textOf).join('') : node && typeof node === 'object' ? textOf(node.children) : '')
const chipOf = (node) => (Array.isArray(node?.children) ? node.children.find((child) => child && String(child.props?.class || '').split(' ').includes('mm-category-warning')) : undefined)
const warned = cell({ id: 'acme', name: 'Acme', category: null, category_warning: 'Unclassified on the Licensing Server: treated as test' }, { key: 'name' })
const chip = chipOf(warned)
assert.ok(chip, 'the chip is drawn')
assert.equal(chip.props.class, 'pill warn mm-category-warning', 'an existing warning pill, no new palette')
assert.equal(textOf(chip), 'Unclassified on the Licensing Server: treated as test', 'text as Core sends it')
assert.match(textOf(warned), /^Acme.*acme$/, 'beside the name, id still under it')
assert.equal(chipOf(cell({ id: 'acme', name: 'Acme', category_warning: null }, { key: 'name' })), undefined, 'no chip without a warning')
const action = cell({ id: 'acme', name: 'Acme', latest_version: '1.0.0', category_warning: 'x' }, { key: 'action' })
assert.equal(action.type, 'button', 'Install stays as it is')
assert.equal(action.props.disabled, false)
assert.match(read('../src/styles.css'), /\.mm-category-warning\{margin-left:6px;white-space:normal\}/)

// ---- held Low 1: refresh.stale on the release path ----
const g = await import(new URL('../src/system-update-github.js', import.meta.url).href)
const format = (d) => d.toISOString()
const now = Date.parse('2026-11-03T12:00:00Z')
const old = '2026-11-01T09:00:00Z'
assert.equal(g.checkedText({ kind: 'release', result: { checked_at: old, refresh: { stale: ['stable_release'] } }, now, format }), 'Checked 2026-11-01T09:00:00.000Z. Out of date: stable release')
assert.equal(g.checkedText({ kind: 'release', result: { checked_at: old, refresh: { stale: ['stable_release', 'latest_release'] } }, now, format }), 'Checked 2026-11-01T09:00:00.000Z. Out of date: stable release, latest release')
assert.equal(g.checkedText({ kind: 'release', result: { checked_at: old, refresh: { stale: [] } }, now, format }), 'Checked 2026-11-01T09:00:00.000Z', 'nothing stale: the plain age')
assert.equal(g.checkedText({ kind: 'release', result: { checked_at: old }, now, format }), 'Checked 2026-11-01T09:00:00.000Z', 'an older Core: as before')
assert.equal(g.checkedText({ kind: 'release', result: { refresh: { stale: ['stable_release'] } }, now, format }), 'Never')
assert.equal(g.checkedText({ kind: 'branch', result: { branch: { head_commit: 'a'.repeat(40) }, refresh: { reason: 'cache_fresh', stale: ['branch_head'] } } }), 'Saved check. Out of date: branch head', 'the branch path is unchanged')

// ---- held Low 2: blocked while the downgrade Yes/No is open ----
const stage = { upload_id: 'u1' }
assert.equal(g.stageStillInstallable({ stage, upload: 'u1', busy: false, check: { blocked: false } }), true)
assert.equal(g.stageStillInstallable({ stage, upload: 'u1', busy: false, check: { blocked: true } }), false, 'blocked while the dialog was open')
assert.equal(g.stageStillInstallable({ stage, upload: 'u2', busy: false, check: {} }), false, 'another upload')
assert.equal(g.stageStillInstallable({ stage, upload: 'u1', busy: true, check: {} }), false, 'busy')
assert.equal(g.stageStillInstallable({ stage: null, upload: 'u1', busy: false, check: {} }), false, 'stage gone')

// The page: Install is never called when the check turns blocked during the confirm.
const view = read('../src/views/SystemUpdatesView.vue')
const installFn = view.slice(view.indexOf('async function installStage'), view.indexOf('function startPolling'))
assert.match(installFn, /if \(!\(await askConfirm\(downgradeConfirmOptions\(preview\)\)\)\) return\n\s*if \(!stageStillInstallable\(\{ stage: stage\.value, upload, busy: stageBusy\.value, check: stageCheck\.value \}\)\) return\n\s*allowDowngrade\.value = true/)
assert.ok(installFn.indexOf('stageStillInstallable') < installFn.indexOf('installSystemUpdatePackage'), 'the re-check runs before Install')

// Simulated: the confirm resolves Yes after the check was blocked; install is not called.
async function simulate(blockDuringConfirm) {
  const state = { stage: { upload_id: 'u1' }, busy: false, check: { blocked: false } }
  let installed = false
  const askConfirm = async () => { if (blockDuringConfirm) state.check.blocked = true; return true }
  const upload = state.stage.upload_id
  if (!(await askConfirm())) return installed
  if (!g.stageStillInstallable({ stage: state.stage, upload, busy: state.busy, check: state.check })) return installed
  installed = true
  return installed
}
assert.equal(await simulate(true), false, 'blocked during the confirm: no install')
assert.equal(await simulate(false), true)

console.log('tactical-161-parity-0.12.127: PASS')
