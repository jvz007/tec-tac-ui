// 0.12.126 (Core 1.17.106 and 1.17.107, reviews/requests/ui.md "System Update must not offer a stale branch head"; core
// 1.17.103 "a channel field for the licensed repository source", AD-58 D6).
// - A stale saved branch head (branch.head_stale, or refresh.reason not_refreshed) is never offered: the card says
//   "Last checked <time>; refresh to see the latest" with a Refresh button, and Stage stays off until a refresh succeeds.
//   The page does not refresh on its own.
// - refresh.stale is shown instead of "Saved check, less than 5 minutes old".
// - The 409 stale_candidate shows Core's "dev has moved to ..." text with the Refresh button.
// - A downgrade preview reads DOWNGRADE (never UPDATE), shows Core's warning, and asks a plain Yes/No naming both versions
//   before Install; allow_downgrade is sent only after Yes.
// - The Licensing repository source edits its Channel; its address, kind and trust are never sent.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const g = await import(new URL('../src/system-update-github.js', import.meta.url).href)
const r = await import(new URL('../src/module-repository-info.js', import.meta.url).href)
const format = (d) => d.toISOString()

// ---- stale head ----
assert.equal(g.branchHeadStale(null), false)
assert.equal(g.branchHeadStale({ branch: { head_commit: 'a' } }), false, 'an older Core sends no flag: not stale')
assert.equal(g.branchHeadStale({ branch: { head_stale: false }, refresh: { reason: 'cache_fresh' } }), false)
assert.equal(g.branchHeadStale({ branch: { head_stale: true } }), true)
assert.equal(g.branchHeadStale({ branch: { head_stale: false }, refresh: { reason: 'not_refreshed' } }), true, 'not_refreshed counts as stale')
assert.equal(g.branchHeadStale({ branch: { head_stale: 'yes' } }), false, 'only a real true')
assert.equal(
  g.staleHeadText({ branch: { head_checked_at: '2026-11-02T09:00:00Z' } }, { format }),
  'Last checked 2026-11-02T09:00:00.000Z; refresh to see the latest',
)
assert.equal(g.staleHeadText({ branch: {} }, { format }), 'Last checked at an unknown time; refresh to see the latest')

// ---- refresh.stale replaces the "less than 5 minutes" text ----
const branchResult = (reason, stale) => ({ branch: { head_commit: 'a'.repeat(40) }, refresh: { reason, ...(stale ? { stale } : {}) } })
assert.deepEqual(g.staleParts(branchResult('cache_fresh', ['branch_head', 'stable_release', 'latest_release', 'new_part'])), ['branch head', 'stable release', 'latest release', 'new part'])
assert.deepEqual(g.staleParts(branchResult('cache_fresh')), [])
assert.deepEqual(g.staleParts({ refresh: { stale: 'branch_head' } }), [], 'only a list')
assert.equal(g.checkedText({ kind: 'branch', result: branchResult('cache_fresh', ['stable_release']) }), 'Saved check. Out of date: stable release')
assert.equal(g.checkedText({ kind: 'branch', result: branchResult('cache_fresh', []) }), 'Saved check, less than 5 minutes old', 'an empty list keeps the old text')
assert.equal(g.checkedText({ kind: 'branch', result: branchResult('not_refreshed') }), 'Saved check', 'an unknown or not_refreshed reason is a saved answer')
assert.equal(g.checkedText({ kind: 'branch', result: branchResult('something_new') }), 'Saved check')

// ---- 409 stale_candidate ----
const moved = { status: 409, code: 'stale_candidate', payload: { code: 'stale_candidate', detail: 'dev has moved to 28e1396; the check showed 45cbf36. Refresh the check and try again.' } }
assert.equal(g.staleCandidateText(moved, 'branch'), 'dev has moved to 28e1396; the check showed 45cbf36. Refresh the check and try again.')
assert.equal(g.staleCandidateText({ status: 409, payload: { detail: 'Stale.' } }, 'branch'), g.staleCandidateMessage('branch'), 'an older generic detail keeps the page sentence')
assert.equal(g.staleCandidateText({ status: 409, payload: null }, 'release'), g.staleCandidateMessage('release'))

// ---- downgrade ----
const down = { component_label: 'Tec-Tac Framework', installed_version: '1.17.105', version: '1.17.99', operation: 'downgrade', downgrade: true, confirmation_required: 'downgrade', downgrade_warning: 'This package is Tec-Tac Framework 1.17.99, older than the installed 1.17.105. Installing it is a downgrade.' }
assert.equal(g.isDowngradePreview(down), true)
assert.equal(g.isDowngradePreview({ operation: 'update', downgrade: true }), true, 'the flag wins over the operation')
assert.equal(g.isDowngradePreview({ operation: 'update', downgrade: false }), false)
assert.equal(g.isDowngradePreview({ operation: 'downgrade' }), true, 'an older Core: operation alone')
assert.equal(g.operationLabel(down), 'DOWNGRADE')
assert.equal(g.operationLabel({ operation: 'update', downgrade: true }), 'DOWNGRADE', 'a downgrade is never labelled UPDATE')
assert.equal(g.operationLabel({ operation: 'update' }), 'UPDATE')
const ask = g.downgradeConfirmOptions(down)
assert.equal(ask.question, 'Downgrade Tec-Tac Framework from 1.17.105 to 1.17.99?', 'the question names both versions')
assert.equal(ask.detail, down.downgrade_warning)
assert.equal(ask.danger, true)
assert.ok(!('input' in ask) && !('typed' in ask), 'a plain Yes/No, nothing typed')

// ---- the view ----
const view = read('../src/views/SystemUpdatesView.vue')
const script = view.slice(0, view.indexOf('</script>'))
assert.ok(script.includes("import { useConfirm } from '../confirm-dialog'") && script.includes('const askConfirm = useConfirm()'), 'the shell Yes/No dialog')
const allowed = script.slice(script.indexOf('function stageAllowed'), script.indexOf('function headStaleText'))
assert.match(allowed, /if \(savedIsBranch\(component\)\) return !headStale\(component\)/, 'Stage is off while the head is stale')
assert.match(allowed, /branchHeadStale\(result\)/)
assert.match(script, /const head = headStale\(component\) \? '' : branchView\(component\)\?\.headShort/, 'the stale head is not named on the Stage button')
const onMounted = script.slice(script.indexOf('onMounted(async'), script.indexOf('onBeforeUnmount'))
assert.ok(!/refresh: 'branch'|refreshComponent/.test(onMounted), 'no automatic refresh on page load (choice recorded in the release notes)')
assert.match(view, /data-test="head-stale"[\s\S]{0,200}headStaleText\(component\.id\)[\s\S]{0,300}data-test="head-stale-refresh"[^>]*@click="refreshComponent\(component\.id, 'branch'\)"/, 'the stale line has its Refresh button')
assert.match(view, /:title="stageTitle\(component\.id\)"/)
const stageFn = script.slice(script.indexOf('async function stageOnline'), script.indexOf('function pickOfflinePackage'))
assert.match(stageFn, /staleCandidate\.value\[component\] = staleCandidateText\(err, type\)\s*return/)
const install = script.slice(script.indexOf('async function installStage'), script.indexOf('function startPolling'))
assert.match(install, /allowDowngrade\.value = false\s*if \(downgrade\) \{/, 'the flag is cleared before each install')
assert.match(install, /if \(!\(await askConfirm\(downgradeConfirmOptions\(preview\)\)\)\) return[\s\S]*allowDowngrade\.value = true/, 'allow_downgrade only after Yes')
assert.ok(install.indexOf('askConfirm') < install.indexOf('installSystemUpdatePackage'), 'the question comes before the install call')
assert.ok(!view.includes('v-model="allowDowngrade"'), 'the tick box is gone; the Yes/No dialog replaces it')
assert.match(view, /data-test="stage-operation"[^>]*>\{\{ operationLabel\(stage\.preview\) \}\}/)
assert.match(view, /data-test="stage-downgrade"/)
assert.match(view, /isDowngradePreview\(stage\.preview\) \? 'Install downgrade' : 'Install package'/)

// ---- the Licensing repository source ----
const lic = { id: 'tec-tac-licensing', kind: 'licensing', name: 'Licensed', url: 'https://lic.example/', trust: 'official', priority: 10, enabled: true, channel: '', sync: { licensing_state: 'channel_not_permitted', error: 'The licence does not allow the channel beta.' } }
const index = { id: 'x', name: 'Index', url: 'https://x/index.json', trust: 'custom', priority: 100, enabled: true }
assert.equal(r.isLicensingSource(lic), true)
assert.equal(r.isLicensingSource(index), false)
for (const ok of ['', 'dev', 'development', 'beta-1', 'a_b', 'a'.repeat(32), '  dev  ']) assert.equal(r.channelError(ok), '', `${ok} is allowed`)
for (const bad of ['Dev', '1dev', '-dev', 'a'.repeat(33), 'dev ch', 'dév', '_x']) assert.equal(r.channelError(bad), r.CHANNEL_ERROR, `${bad} is refused`)
assert.deepEqual(r.repositoryPayload({ name: 'Licensed', url: 'https://evil/', trust: 'custom', priority: 5, enabled: false, channel: ' beta ' }, lic), { name: 'Licensed', priority: 5, enabled: false, channel: 'beta' }, 'only name, priority, enabled and channel')
assert.deepEqual(r.repositoryPayload({ name: 'Index', url: 'https://x/index.json', trust: 'custom', priority: 100, enabled: true }, index), { name: 'Index', url: 'https://x/index.json', trust: 'custom', priority: 100, enabled: true }, 'an index repository keeps its body')
assert.ok(!('channel' in r.repositoryPayload({ name: 'Index', channel: 'x' }, index)), 'never a channel for an index repository')
assert.equal(r.licensingStateText(lic), 'The licence does not allow the channel beta.', "Core's sentence first")
assert.equal(r.licensingStateText({ ...lic, sync: { licensing_state: 'not_registered' } }), 'This server is not registered with the licensing server.')
assert.equal(r.licensingStateText({ ...lic, sync: { licensing_state: 'ok', error: 'x' } }), '')
assert.equal(r.licensingStateText({ ...index, sync: { licensing_state: 'not_registered' } }), '', 'index repositories have no licensing state')
assert.equal(r.licensingStateText({ ...lic, sync: { licensing_state: 'brand_new' } }), 'Licensing state: brand new.')

const modules = read('../src/views/ModulesView.vue')
assert.match(modules, /if \(isLicensingSource\(item\)\) repositoryDraft\.value\.channel = /)
assert.match(modules, /<template v-if="isLicensingSource\(selectedRepository\)">[\s\S]*data-test="licensing-address"[\s\S]*v-model\.trim="repositoryDraft\.channel"[\s\S]*<template v-else>[\s\S]*v-model="repositoryDraft\.url"[\s\S]*v-model="repositoryDraft\.trust"/, 'address and trust are hidden for the Licensing source; Channel is shown')
const licTemplate = modules.slice(modules.indexOf('<template v-if="isLicensingSource(selectedRepository)">'), modules.indexOf('<template v-else>', modules.indexOf('<template v-if="isLicensingSource(selectedRepository)">')))
assert.ok(!licTemplate.includes('repositoryDraft.url') && !licTemplate.includes('repositoryDraft.trust'), 'no address or trust input for the Licensing source')
assert.match(modules, /data-test="licensing-state"/)

// ---- release metadata ----
// 0.12.127: the version and Core requirement now belong to tests/release-0.12.127.mjs; the 0.12.126 notes are kept.
assert.ok(fs.existsSync(new URL('../docs/releases/RELEASE_NOTES_0.12.126.md', import.meta.url)))
console.log('system-update-stale-head-0.12.126: PASS')
