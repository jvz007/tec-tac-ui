// 0.12.119: the rest of the Module Manager on the brand board (Johan's Q82): package intake, install review, detail, job panel, dialogs and
// Hotfixes moved into presentational components (props in, same-named events out). Nothing about behaviour changed: every handler,
// v-model target and :disabled expression of the 0.12.118 template is still there (a fixture taken from the 0.12.118 source), each
// component renders for its states with markup in Core's data escaped, and the new CSS uses tokens and the board's size scale only.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createSfcLoader } from './helpers/load-sfc.mjs'
import { handlerWired, moduleManagerSource, pageSource } from './helpers/module-manager-source.mjs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const squash = (text) => text.replace(/\s+/g, '')
const all = moduleManagerSource()
const page = pageSource()
const fixture = JSON.parse(read('./fixtures/module-manager-handlers-0.12.118.json'))

// ---- handler parity: nothing the 0.12.118 template wired was dropped ----
assert.ok(fixture.handlers.length >= 70 && fixture.models.length === 11 && fixture.disabled.length >= 17, 'the fixture holds the 0.12.118 template bindings')
const allSquashed = squash(all)
for (const { event, expr } of fixture.handlers) {
  const plain = /^[A-Za-z_$][\w$]*(\(.*\))?$/.test(expr)
  if (plain) assert.ok(handlerWired(all, `@${event}="${expr}"`), `@${event}="${expr}" is still wired (as written, or bound to the component's event of the same name)`)
  else assert.ok(allSquashed.includes(squash(expr)), `${expr} is still in the source`)
}
for (const expr of fixture.disabled) assert.ok(allSquashed.includes(squash(`:disabled="${expr}"`)), `:disabled="${expr}" is unchanged`)
for (const { target } of fixture.models) {
  assert.ok(new RegExp(`v-model(?:[.:]\\w+)*="${target.replace(/[.]/g, '\\.')}"`).test(all), `v-model on ${target} is still there`)
}
// the page keeps every handler, computed and ref it had: the two hidden file inputs and their refs stay in ModulesView.vue
assert.match(page, /<input ref="fileInput" class="sr-only" type="file" multiple accept="\.zip,\.tgz,\.tar\.gz,\.sig,\.json,application\/zip,application\/gzip,application\/json" @change="filesChosen">/)
assert.match(page, /<input ref="hotfixFileInput" class="sr-only" type="file" multiple accept="\.zip,\.sig,\.json,application\/zip,application\/json" @change="hotfixFileChanged">/)
assert.match(page, /const fileInput = ref\(null\)/)
assert.match(page, /const hotfixFileInput = ref\(null\)/)
for (const fn of ['function pick()', 'function fileKey(file)', 'function onDrop(event)', 'function removePending(index)', 'function movePending(index, offset)', 'function clearPending()', 'function inspectPending()', 'function intakeFileLabel(file)', 'function dragStart(id)', 'function dropOn(id)', 'function moveInspected(id, offset)', 'async function install()', 'async function confirmInstall()', 'async function confirmSwitchAction()', 'async function confirmHandBack()', 'function closeConfirm()']) assert.ok(page.includes(fn), `${fn} stays in ModulesView.vue`)
// the install and replacement logic is the 0.12.118 script, untouched
assert.match(page, /const orderedRows = computed\(\(\) => \{/)
assert.match(page, /function dependencyViolation\(order\)/)
assert.match(page, /const summary = installConfirmSummary\(plan\.value\)/)
assert.ok(!/<style/.test(all), 'no private styles in the new components')
assert.ok(!/v-html|innerHTML/.test(all), 'no HTML from Core')
assert.ok(!/localStorage|sessionStorage/.test(all), 'no browser storage')

// ---- the components render for their states ----
// Vue writes static and bound classes in an order that depends on the template, so every class list is sorted before the match.
const sortClasses = (html) => html.replace(/class="([^"]*)"/g, (_m, list) => `class="${list.split(/\s+/).filter(Boolean).sort().join(' ')}"`)
const render = async (component, props, slots) => sortClasses(await renderToString(createSSRApp({ render: () => h(component, props, slots) })))
const loader = await createSfcLoader()
try {
  const load = async (name) => (await loader.load(`src/components/modules/${name}.vue`)).default
  const [Intake, Review, Detail, JobPanel, Dialogs, Hotfixes] = await Promise.all(['ModulePackageIntake', 'ModuleInstallReview', 'ModuleDetailPanel', 'ModuleJobPanel', 'ModuleActionDialogs', 'ModuleHotfixes'].map(load))

  // intake, empty
  const helpers = { fileKey: (f) => `${f.name}:${f.size}:${f.lastModified}`, intakeFileType: (f) => (/\.sig$/i.test(f.name) ? 'signature' : /\.json$/i.test(f.name) ? 'metadata' : 'package'), intakeFileLabel: (f) => (/\.sig$/i.test(f.name) ? 'SIGNATURE' : /\.json$/i.test(f.name) ? 'RELEASE JSON' : 'PACKAGE') }
  const empty = await render(Intake, { canManage: true, ...helpers })
  assert.match(empty, /class="mm-drop"/)
  assert.match(empty, /Drag &amp; drop Tec-Tac packages here/)
  assert.match(empty, /role="button" tabindex="0"/)
  assert.match(empty, /<button class="btn sm" type="button">Browse files<\/button>/)
  assert.ok(!/mm-queue"/.test(empty), 'no queue before files are chosen')
  assert.match(await render(Intake, { canManage: true, dropActive: true, ...helpers }), /Drop package files here/)
  assert.match(await render(Intake, { canManage: false, ...helpers }), /class="disabled mm-drop"/, 'a read-only person gets a disabled drop zone')
  assert.match(await render(Intake, { canManage: true, jobRunning: true, ...helpers }), /class="disabled mm-drop"/)

  // intake, files queued
  const files = [{ name: 'agents-1.0.0.zip', size: 2048, lastModified: 1 }, { name: 'agents-1.0.0.zip.sig', size: 64, lastModified: 2 }, { name: '<img src=x onerror=alert(1)>.zip', size: 10, lastModified: 3 }]
  const queued = await render(Intake, { canManage: true, pendingFiles: files, intakeNotes: { signed: 1, unsigned: 1 }, ...helpers })
  assert.match(queued, /FILES TO INSPECT/)
  assert.match(queued, /3 files/)
  assert.ok(!queued.includes('<img'), 'a file name with markup is escaped')
  assert.match(queued, /&lt;img src=x onerror=alert\(1\)&gt;\.zip/)
  assert.match(queued, /<button class="iconbtn" disabled title="Move up">↑<\/button>/, 'the first file cannot move up')
  assert.match(queued, /<button class="iconbtn" disabled title="Move down">↓<\/button>/, 'the last file cannot move down')
  assert.match(queued, /Unsigned package\./)
  assert.match(queued, /Signed package detected\./)
  assert.match(queued, /<button class="btn">Clear<\/button><span class="spacer"><\/span><button class="btn primary">Inspect package intake<\/button>/, 'Clear left, one primary rightmost')
  assert.match(await render(Intake, { canManage: true, pendingFiles: files, inspecting: true, intakeNotes: { signed: 0, unsigned: 0 }, ...helpers }), /<button class="btn primary" disabled>Inspecting…<\/button>/)
  // intake, blocked
  const blocked = await render(Intake, { canManage: true, pendingFiles: files, intakeBlocked: true, pendingIntakeProblem: 'A .sig needs its package.', problemSets: [{ key: 'a', label: 'set <b>a</b>', problems: ['No release file.', 'Names differ.'] }], intakeErrors: [{ key: 'b', label: 'set b', message: 'Core said no.' }], intakeNotes: { signed: 1, unsigned: 1 }, ...helpers })
  assert.match(blocked, /<div class="mt state-inline warning"><b>Package intake needs attention\.<\/b> A \.sig needs its package\.<\/div>/)
  assert.match(blocked, /<b>set &lt;b&gt;a&lt;\/b&gt;<\/b> No release file\. Names differ\./)
  assert.match(blocked, /<b>set b<\/b> did not inspect\. Core said no\./)
  assert.match(blocked, /<button class="btn primary" disabled>Inspect package intake<\/button>/, 'a blocked intake cannot be inspected')
  assert.ok(!/Unsigned package\.|Signed package detected\./.test(blocked), 'the signing notes wait until nothing blocks')
  // intake, staged
  const stagedIntake = await render(Intake, { canManage: true, staged: { kind: 'package' }, plan: { valid: true }, pendingFiles: files, intakeNotes: { signed: 0, unsigned: 0 }, ...helpers })
  assert.match(stagedIntake, /<span class="ok pill">INSPECTED<\/span>/)
  assert.match(stagedIntake, /<b>Packages are staged\.<\/b> Install or discard them before you inspect these files\./)
  assert.ok(!/class="[^"]*mm-drop[^"]*"/.test(stagedIntake), 'no drop zone while packages are staged')
  assert.match(stagedIntake, /<button class="btn primary" disabled>Inspect package intake<\/button>/)
  assert.match(await render(Intake, { canManage: true, staged: { kind: 'package' }, plan: { valid: false }, ...helpers }), /<span class="pill warn">BLOCKED<\/span>/)

  // install review: signed, unsigned and rejected-trust rows, a blocked plan
  const reviewHelpers = { moduleTargetVersion: (r) => r.version || '—', moduleRequirements: (r) => Object.entries(r.dependencies || {}).map(([i, c]) => `${i} ${c}`).join(' · ') || 'none', compactHash: (v) => (v ? `${String(v).slice(0, 12)}…` : '—'), isReplacementProblem: (p) => p?.type === 'replacement', replacementProblemText: () => 'A replacement problem.' }
  const rows = [
    { id: 'agents', version: '2.0.0', current_version: '1.0.0', action: 'replace', intake_filename: 'agents.zip', intake_source: 'offline', intake_sha256: 'a'.repeat(64), intake_trust_label: 'VERIFIED', intake_trust_class: 'ok', intake_trust: { verified: true, trusted: true, publisher_display_name: 'Tech Flow', publisher_id: 'tfd', key_id: 'k1', required_permissions: ['x'], approved_permissions: [] }, dependencies: { core: '>=1' } },
    { id: '<img src=x onerror=alert(1)>', version: '1.0.0', intake_filename: 'u.zip', intake_trust_label: 'UNSIGNED', intake_trust_class: '', intake_trust: { signed: false, state: 'unsigned' } },
    { id: 'bad', version: '1.0.0', intake_filename: 'b.zip', intake_trust_label: 'REJECTED', intake_trust_class: 'danger', intake_trust: { state: 'rejected', reason: '<b>Key revoked.</b>' } },
  ]
  const reviewProps = { staged: { source: { repository_name: 'Official', repository_trust: 'official', package_sha256: 'f'.repeat(64) } }, plan: { valid: false, problems: [{ module: 'agents', type: 'missing dependency', dependency: 'core', constraint: '>=9' }, { type: 'replacement' }] }, orderedRows: rows, stagedArtifactLabel: 'bundle.zip', stagedSourceLabel: 'Official', queueWarning: 'Packages move within their own set.', ...reviewHelpers }
  const review = await render(Review, reviewProps)
  assert.match(review, /3 modules ready for review/)
  assert.match(review, /<span class="pill warn">BLOCKED<\/span>/)
  assert.ok(!review.includes('<img'), 'a module id with markup is escaped')
  assert.ok(!review.includes('<b>Key revoked.</b>'), 'a trust reason with markup is escaped')
  assert.match(review, /&lt;b&gt;Key revoked\.&lt;\/b&gt;/)
  assert.match(review, /aria-label="Package trust: VERIFIED"/)
  assert.match(review, />\s*SIGNED\s*<span class="mm-trust-popover" role="tooltip">/, 'the popover stays inside the trust pill')
  for (const label of ['Publisher', 'Publisher ID', 'Key ID', 'Algorithm', 'Environment', 'Assurance', 'SHA256', 'Required', 'Approved']) assert.ok(review.includes(`<strong>${label}</strong>`), `the trust popover shows ${label}`)
  for (const note of ['No package signature was supplied.', 'Unsigned packages are accepted only when the global Update Trust Policy and module-specific rules permit them.', 'Privileged publisher permissions still require a trusted signature regardless of the global minimum.']) assert.ok(review.includes(note), note)
  assert.match(review, /<b>Installation blocked\.<\/b> Resolve the dependency\/version problems before installation\./)
  assert.match(review, /<b>Online source:<\/b> Official/)
  assert.match(review, /<b>Order not changed\.<\/b> Packages move within their own set\./)
  assert.match(review, /Blocking problems/)
  assert.match(review, /A replacement problem\./)
  assert.match(review, /<span class="mono">agents<\/span> — missing dependency(?:<!--\]-->)?<span>: core &gt;=9<\/span>/)
  // the install sequence: ordered cards, still draggable, the arrow buttons keep their rules
  assert.equal((review.match(/class="mm-queue-card mm-seq" draggable="true"/g) || []).length, 3, 'every sequence card is draggable')
  assert.match(review, /<button class="iconbtn" disabled title="Move up">↑<\/button>/)
  assert.match(review, /<button class="iconbtn" disabled title="Move down">↓<\/button>/)
  assert.match(review, /Drag to reorder independent packages/)
  assert.match(review, /<button class="btn primary" disabled>Install 3 packages<\/button>/, 'a blocked plan cannot install')
  assert.match(review, /<button class="btn">Cancel \/ discard<\/button><span class="spacer"><\/span><span class="muted smalltext">The framework validates this sequence again before execution\.<\/span>/, 'discard left, Install rightmost')
  const ok = await render(Review, { ...reviewProps, plan: { valid: true }, queueWarning: '', staged: {} })
  assert.match(ok, /<span class="ok pill">INSTALLABLE<\/span>/)
  assert.match(ok, /<b>Dependency plan resolved\.<\/b> Required dependency sequence is enforced\. Independent packages may be reordered\./)
  assert.match(ok, /<button class="btn primary">Install 3 packages<\/button>/)
  assert.match(await render(Review, { ...reviewProps, plan: { valid: true }, installing: true, staged: {} }), /<button class="btn" disabled>Cancel \/ discard<\/button>/, 'discard waits while installing')
  assert.equal(await render(Review, { ...reviewProps, staged: null }), '<!---->', 'nothing staged, nothing drawn')

  // detail panel
  const mod = { id: 'agents', enabled: true, managed: true, visible: true, extension_version: '1.2.3', reportset_version: '1.0.0', permission_count: 4, dependencies: { core: '>=1' }, dependants: [{ id: 'checks', constraint: '>=1' }], category: 'core', publisher_trust: { verified: true, trusted: true, publisher_display_name: 'Tech Flow', key_id: 'k1' }, replaces: ['patch'], hotfixes: { count: 0 } }
  const detail = await render(Detail, { selected: mod, selectedLoad: { state: 'loaded', label: 'loaded', detail: '' }, canOpenSelected: true, canManage: true, satisfiedFor: () => 'satisfied by core 1.2' })
  for (const word of ['MODULE DETAIL', 'Extension', 'ReportSet', 'Managed', 'Navigation', 'UI load', 'Source', 'SHA256', 'Permissions', 'Package trust', 'Signed by', 'Signing key', 'Hard dependencies', 'Required by']) assert.ok(detail.includes(word), `the detail panel shows ${word}`)
  assert.match(detail, /satisfied by core 1\.2/)
  assert.match(detail, /<button class="btn module-open-btn primary sm" type="button">Open<\/button>/)
  assert.match(detail, />Hide<\/button><button class="btn warnbtn">Disable<\/button><button class="btn danger">Remove<\/button>/)
  assert.match(await render(Detail, { selected: { ...mod, enabled: false }, selectedLoad: { state: 'disabled', label: 'disabled' }, canManage: true, jobRunning: true, satisfiedFor: () => '' }), /<button class="btn primary" disabled>Enable<\/button>/)
  assert.match(await render(Detail, { selected: { ...mod, id: '<img src=x>' }, selectedLoad: { state: 'failed', label: 'failed', detail: '<b>boom</b>' }, satisfiedFor: () => '' }), /Authenticated UI failed to load\./)

  // job panel
  const jobHtml = await render(JobPanel, { activeJob: { action: 'install', plugin_id: 'agents', status: 'succeeded', log_tail: ['a', '<b>b</b>'] }, jobPollError: '' })
  assert.match(jobHtml, /<pre class="job-log mm-joblog">a\n&lt;b&gt;b&lt;\/b&gt;<\/pre>/)
  assert.match(jobHtml, /<button class="btn primary">Reload Tec-Tac<\/button>/)
  assert.ok(!(await render(JobPanel, { activeJob: { action: 'install', plugin_id: 'a', status: 'running' } })).includes('Reload Tec-Tac'))

  // dialogs: the second confirmation still needs the box before the button enables
  const dialogBase = { confirmTarget: { id: 'patch' }, confirmMode: 'enable', needsSecondConfirmation: true, confirmStep: 2, secondStepText: { warning: 'This switches off apm.', checkbox: 'I understand.', button: 'Switch off and enable' }, secondDependantLines: ['apm needs patch.'] }
  const second = await render(Dialogs, dialogBase)
  assert.match(second, /<b>Second confirmation\.<\/b> This switches off apm\./)
  assert.match(second, /<button class="btn danger" disabled>Switch off and enable<\/button>/, 'the second-step button is off until the box is ticked')
  assert.match(await render(Dialogs, { ...dialogBase, switchAck: true }), /<button class="btn danger">Switch off and enable<\/button>/)
  const first = await render(Dialogs, { ...dialogBase, confirmStep: 1 })
  assert.match(first, /<p class="confirm-question">Enable module patch\? Are you sure\?<\/p>/)
  assert.match(first, /<div class="mm-actions mm-yesno modal-actions"><button class="btn">No<\/button><button class="btn primary">Yes<\/button>/, 'a plain No and Yes, Yes rightmost')
  const handBack = await render(Dialogs, { ...dialogBase, confirmMode: 'disable', confirmStep: 1, needsSecondConfirmation: false, handBack: { mode: 'disable', lines: ['apm cannot come back.'], button: 'Disable and hand back' } })
  assert.match(handBack, /apm cannot come back\./)
  assert.match(handBack, /<button class="btn danger">Disable and hand back<\/button><button class="btn">Cancel<\/button>/, 'destructive first in the DOM, so the focus order is as it was')
  assert.match(await render(Dialogs, { reinstallTarget: { id: 'agents', latest_version: '1.0.0' } }), /SAME VERSION/)
  const swap = await render(Dialogs, { installConfirm: { ids: ['patch'], lines: ['patch is switched off.'], changed: '' } })
  assert.match(swap, /Switch off replaced modules\?/)
  assert.match(swap, /<button class="btn primary">Install and switch off<\/button><button class="btn">Cancel<\/button>/)
  assert.match(swap, /role="dialog" aria-modal="true" aria-labelledby="module-install-confirm-title"/)
  assert.equal((await render(Dialogs, {})).replace(/<!--.*?-->/g, ''), '', 'no dialog open, nothing drawn')

  // hotfixes: empty, inspected, applied
  const hot0 = await render(Hotfixes, { canManage: true, modules: [{ id: 'agents', managed: true, extension_version: '1', hotfixes: { count: 2 } }] })
  assert.match(hot0, /Choose signed hotfix files/)
  assert.match(hot0, /ZIP \+ detached \.sig \+ \.release\.json/)
  assert.match(hot0, /<select[^>]*>.*Select module<\/option>.*<option value="agents"[^>]*>agents · 1 · 2 hotfixes<\/option>/)
  const zip = { name: 'fix.zip' }
  const hot1 = await render(Hotfixes, { canManage: true, hotfixFiles: [zip], hotfixZip: zip, modules: [] })
  assert.match(hot1, /Signature companions are incomplete\./)
  assert.match(hot1, /<button class="btn primary">Inspect hotfix<\/button>/)
  const preview = { module_id: 'agents', id: 'hf-1', base_version: '1.0.0', reload: 'none', ui_sync: true, description: '<b>fix</b>', targets: [{ component: 'extension', path: 'a/<img src=x>.py', sha256_before: 'b'.repeat(64), sha256_after: 'c'.repeat(64) }] }
  const hot2 = await render(Hotfixes, { canManage: true, hotfixFiles: [zip], hotfixZip: zip, hotfixStaged: { upload_id: 'u' }, hotfixPreview: preview, hotfixTrust: { verified: true, trusted: true, key_id: 'k' }, modules: [] })
  assert.match(hot2, /<span class="ok pill">INSPECTED<\/span>/)
  assert.ok(!hot2.includes('<img'), 'a path with markup is escaped')
  assert.match(hot2, /bbbbbbbbbbbb…/)
  assert.match(hot2, /Hotfix files/)
  assert.match(hot2, /<button class="btn primary">Apply hotfix<\/button>/)
  assert.match(hot2, /<button class="btn">Discard<\/button>/)
  assert.match(await render(Hotfixes, { canManage: true, hotfixStaged: { upload_id: 'u' }, hotfixPreview: preview, hotfixJobRunning: true, modules: [] }), /<button class="btn primary" disabled>Apply hotfix<\/button>/)
  const applied = [{ id: 'hf-1', base_version: '1.0.0', applied_at: '', applied_by: 'johan', targets: [{}] }, { id: 'hf-2', base_version: '1.0.0', applied_at: '', applied_by: 'ann', targets: [{}, {}] }]
  const hot3 = await render(Hotfixes, { canManage: true, hotfixSelectedModuleId: 'agents', hotfixRows: applied, modules: [{ id: 'agents', managed: true, extension_version: '1', hotfixes: { count: 2 } }] })
  assert.match(hot3, /Select a hotfix to roll it back\./)
  assert.match(hot3, /<button class="btn danger sm" type="button" disabled title="Select a hotfix in the table first">Roll back hotfix<\/button>/, 'nothing picked, nothing to roll back')
  assert.ok(!/<button[^>]*>Rollback<\/button>/.test(hot3), 'no button inside a table row')
  assert.ok(!/<td[^>]*><button/.test(hot3), 'the board keeps buttons out of table rows')
  assert.match(hot3, /hf-1/)
  assert.match(hot3, /hf-2/)
  assert.match(hot3, /2 hotfixes, newest last/)
  assert.match(await render(Hotfixes, { canManage: true, hotfixSelectedModuleId: 'agents', hotfixRows: [], modules: [] }), /<b>No active hotfixes\.<\/b>/)
  assert.match(await render(Hotfixes, { canManage: true, hotfixSelectedModuleId: 'agents', hotfixLoading: true, modules: [] }), /Loading applied hotfixes…/)
} finally {
  await loader.close()
}

// ---- Hotfixes: only the newest row can be rolled back, with the same two titles, and the page keeps rollbackHotfix and its Yes or No ----
const hotSource = read('../src/components/modules/ModuleHotfixes.vue')
assert.match(hotSource, /const index = computed\(\(\) => props\.hotfixRows\.findIndex\(\(row\) => row\.id === pickedId\.value\)\)/)
assert.match(hotSource, /:disabled="hotfixJobRunning\|\|index!==hotfixRows\.length-1"/, 'the old rule: only the last row, the newest')
assert.match(hotSource, /'Roll back newer hotfixes first':'Roll back this hotfix'/)
assert.match(hotSource, /@click="emit\('rollbackHotfix', pickedRow\)"/)
assert.match(page, /async function rollbackHotfix\(row\)\{[\s\S]*askConfirm\(\{ question: `Roll back hotfix \$\{row\.id\} from \$\{moduleId\}\?`/, 'the plain Yes or No stays on rollback')
assert.match(page, /@rollback-hotfix="rollbackHotfix"/)
{
  // the rule as the component evaluates it
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const enabledFor = (picked, running = false) => { const index = rows.findIndex((r) => r.id === picked); return !(running || index !== rows.length - 1) }
  assert.deepEqual(['a', 'b', 'c', null].map((id) => enabledFor(id)), [false, false, true, false], 'only the newest picked row enables the button')
  assert.equal(enabledFor('c', true), false, 'and not while a hotfix job runs')
}

// ---- the page wires the components ----
for (const tag of ['ModulePackageIntake', 'ModuleInstallReview', 'ModuleDetailPanel', 'ModuleJobPanel', 'ModuleActionDialogs', 'ModuleHotfixes']) {
  assert.ok(page.includes(`import ${tag} from '../components/modules/${tag}.vue'`), `${tag} is imported`)
  assert.ok(page.includes(`<${tag}`), `${tag} is used`)
}
assert.match(page, /<ModuleDetailPanel\s+v-if="selected"/)
assert.match(page, /<ModuleJobPanel v-if="activeJob"/)
assert.match(page, /v-model:cascade="cascade"/)
assert.match(page, /v-model:switchAck="switchAck"/)
assert.match(page, /@dragenter="dropActive=true"/)
// the layer order from 0.12.118 is not touched
const css = read('../src/styles.css')
assert.match(css, /\.modal-backdrop\{position:fixed;inset:0;z-index:1000;/)
assert.match(css, /\.tt-win\.tt-win-floating\{position:fixed;z-index:1050;/)

// ---- tokens only: the 0.12.119 CSS ----
const start = css.indexOf('/* 0.12.119: Module Manager on the brand board')
const block = css.slice(start, css.indexOf('\n.tt-steps{display:flex', start))
assert.ok(start > 0 && block.length > 4000, 'the 0.12.119 CSS block was found')
assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'no hex colour')
assert.ok(!/font-size:\s*[\d.]+px/.test(block) && !/font:\s*[\d.]+px/.test(block), 'no raw px font size')
assert.ok(!/Poppins|Inter\b|Ethnocentric/.test(block), 'no document fonts in the product')
assert.ok(!/font-family:(?!var\(--(sans|mono)\))/.test(block), 'only --sans and --mono')
const SCALE = new Set(['9.8', '10.5', '11', '11.6', '12.1', '12.7', '13.2', '14.5', '15.5', '21', '24'])
const sizes = [...block.matchAll(/font(?:-size)?:[^;}]*?calc\(([\d.]+)px \* var\(--font-scale\)\)/g)].map((m) => m[1])
assert.ok(sizes.length > 15, 'sizes are scaled')
for (const size of sizes) assert.ok(SCALE.has(size), `${size}px is on the board's scale`)
const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
for (const token of new Set([...block.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))) assert.ok(defined.has(token), `${token} is a token styles.css defines`)
// every mm- class the components use has a rule (or is a hook that carries none)
const HOOKS = new Set(['mm-intake', 'mm-review', 'mm-hotfixes', 'mm-hotfix-preview', 'mm-yesno', 'mm-job', 'mm-detail', 'mm-actions'])
const used = new Set([...all.matchAll(/\b(mm-[a-z][a-z0-9-]*)/g)].map((m) => m[1]))
const unstyled = [...used].filter((name) => !css.includes(`.${name}`) && !HOOKS.has(name))
// classes 0.12.118 owns are already in the sheet; anything else must have a rule
assert.deepEqual(unstyled.filter((name) => !/^mm-(log|filters|licence|history)/.test(name)), [], 'every new mm- class has a rule')
// the old shared rules other pages use are left as they were
for (const rule of ['.drop-zone{min-height:118px', '.queue-row{display:grid', '.package-workspace{padding:14px}', '.module-detail{position:sticky', '.job-log{max-height:240px']) assert.ok(css.includes(rule), `${rule} is unchanged`)
console.log('module-manager-brand-board-0.12.119: ok')
