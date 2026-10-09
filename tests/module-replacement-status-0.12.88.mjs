// 0.12.88: replacement state in plain English on the Modules page (AD-20, Core 1.17.9 and 1.17.10).
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { replacementSummary, replacementProblemText, registeredMismatchText, replacesLabel, replacedByLabel, isReplacementProblem } = await import('../src/module-replacement.js')

const REASONS = ['replacement-disabled', 'target-missing', 'target-not-core', 'target-enabled', 'competing-replacement', 'capabilities-undeclared', 'capability-missing', 'capability-major-mismatch', 'capability-version-lower']
const row = (replacement, extra = {}) => ({ id: 'patchmanagement', replaces: 'patching', replacement, replaced_by: null, ...extra })
const joined = (summary) => summary.lines.join('\n')
const noCodes = (value) => {
  for (const code of REASONS) assert.ok(!value.includes(code), `raw code ${code} in: ${value}`)
  assert.ok(!value.includes('replacement_conflict') && !value.includes('replacement_incomplete'), value)
}

// Honoured.
let s = replacementSummary(row({ honoured: true, reason: null, message: 'x', degraded: false, unregistered: [], registered_mismatch: [], capabilities: { failed: [] } }))
assert.equal(s.badge, 'active replacement')
assert.equal(s.tone, 'ok')
assert.match(joined(s), /Replaces patching\./)
assert.match(joined(s), /This module is the active replacement and owns patching's routes and contracts\./)

// Not honoured, every reason.
for (const reason of REASONS) {
  const failed = reason.startsWith('capability-') ? [{ capability: 'patching.list', required: '1.2.0', declared: '1.1.0', reason }] : []
  s = replacementSummary(row({ honoured: false, reason, message: `Core says ${reason}.`.replace(reason, 'something'), degraded: false, capabilities: { failed } }))
  assert.equal(s.badge, 'not active')
  assert.equal(s.tone, 'warn')
  assert.match(joined(s), /^Replaces patching\.\nNot active\. Core says something\./)
  noCodes(joined(s))
  // No message from Core: the mapped sentence stands in, never the raw code.
  s = replacementSummary(row({ honoured: false, reason, capabilities: { failed } }))
  assert.match(joined(s), /Not active\. [A-Z]/)
  noCodes(joined(s))
}
s = replacementSummary(row({ honoured: false, reason: 'capability-version-lower', message: 'Lower.', capabilities: { failed: [{ capability: 'patching.list', required: '1.2.0', declared: '1.1.0', reason: 'capability-version-lower' }] } }))
assert.match(joined(s), /patching\.list: a lower version \(the core module has 1\.2\.0, the replacement declares 1\.1\.0\)\./)

// Unknown reason falls back to Core's message, then to a calm sentence.
s = replacementSummary(row({ honoured: false, reason: 'brand-new-code', message: 'Core wrote this.' }))
assert.match(joined(s), /Not active\. Core wrote this\./)
assert.ok(!joined(s).includes('brand-new-code'))
s = replacementSummary(row({ honoured: false, reason: 'brand-new-code' }))
assert.ok(!joined(s).includes('brand-new-code'))
assert.match(joined(s), /Core has not said why\./)

// Degraded.
s = replacementSummary(row({ honoured: true, degraded: true, unregistered: ['patching.list', 'patching.apply'], registered_mismatch: [] }))
assert.equal(s.badge, 'active, degraded')
assert.equal(s.tone, 'warn')
assert.match(joined(s), /Some contracts are not registered yet: patching\.list, patching\.apply\. Other modules that call them may see them as unavailable\./)
s = replacementSummary(row({ honoured: true, degraded: true }))
assert.match(joined(s), /Some contracts are not registered yet\. Other modules/)

// registered_mismatch (Core 1.17.10).
const major = { capability: 'patching.list', declared: '1.2.0', registered: '2.0.0', reason: 'capability-major-mismatch' }
const lower = { capability: 'patching.apply', declared: '1.2.0', registered: '1.1.0', reason: 'capability-version-lower' }
assert.equal(registeredMismatchText(major), 'The replacement registered patching.list at version 2.0.0, but it declares 1.2.0. That is a different major version. Core did not accept it, so that capability is unavailable until the module is fixed and Tec-Tac restarts.')
assert.match(registeredMismatchText(lower), /That is a lower version\./)
assert.doesNotMatch(registeredMismatchText({ ...lower, reason: 'zzz' }), /zzz|That is/)
s = replacementSummary(row({ honoured: true, degraded: true, unregistered: [], registered_mismatch: [major, lower] }))
assert.equal(s.badge, 'active, degraded')
assert.match(joined(s), /patching\.list at version 2\.0\.0/)
assert.match(joined(s), /patching\.apply at version 1\.1\.0/)
noCodes(joined(s))
s = replacementSummary(row({ honoured: true, degraded: false, registered_mismatch: [major] }))
assert.equal(s.badge, 'active, degraded')

// Missing, null and non-array fields (older Core).
for (const bad of [undefined, null, 'x', 5, {}, [], { honoured: true, registered_mismatch: 'x', unregistered: 'y', capabilities: 'z' }]) {
  const out = replacementSummary(row(bad))
  assert.ok(Array.isArray(out.lines))
  noCodes(joined(out))
}
assert.deepEqual(replacementSummary({ id: 'checks' }), { badge: '', tone: '', lines: [] })
assert.deepEqual(replacementSummary(null), { badge: '', tone: '', lines: [] })
assert.deepEqual(replacementSummary({ id: 'x', replaces: null, replacement: { honoured: true } }), { badge: '', tone: '', lines: [] })
assert.equal(replacementSummary(row(undefined)).badge, '')
assert.deepEqual(replacementSummary(row(undefined)).lines, ['Replaces patching.'])

// Core module that is replaced.
s = replacementSummary({ id: 'patching', replaces: null, replacement: null, replaced_by: 'patchmanagement' })
assert.equal(s.badge, 'replaced by patchmanagement')
assert.equal(s.tone, 'warn')
assert.equal(joined(s), "Replaced by patchmanagement. While it is active, it serves this module's routes and contracts. This module stays disabled; Core never runs both.")
assert.equal(replacesLabel({ replaces: 'patching' }), 'replaces patching')
assert.equal(replacesLabel({ replaces: null }), '')
assert.equal(replacedByLabel({ replaced_by: 'patchmanagement' }), 'replaced by patchmanagement')
assert.equal(replacedByLabel({}), '')

// Problem sentences.
const conflict = { type: 'replacement_conflict', module: 'patching', replaced_by: 'patchmanagement', reason: 'target-enabled', message: "Module 'patchmanagement' is enabled and replaces this core module. Disable 'patchmanagement' first." }
let t = replacementProblemText(conflict)
assert.match(t, /^patching: Module 'patchmanagement' is enabled/)
assert.match(t, /Then try again\.$/)
noCodes(t)
t = replacementProblemText({ type: 'replacement_conflict', module: 'patchmanagement', replaces: 'patching', reason: 'target-enabled', message: 'The core module it replaces is still enabled.' })
assert.match(t, /Disable patching first, then try again\.$/)
t = replacementProblemText({ type: 'replacement_conflict', module: 'pm2', replaces: 'patching', reason: 'competing-replacement', message: 'Another enabled module also replaces the same core module.' })
assert.match(t, /Disable the other replacement first, then try again\.$/)
t = replacementProblemText({ type: 'replacement_incomplete', module: 'patchmanagement', replaces: 'patching', reason: 'capability-missing', message: 'The replacement does not publish every capability.', capabilities: [{ capability: 'patching.list', required: '1.0.0', declared: null, reason: 'capability-missing' }, { capability: 'patching.apply', reason: 'capability-version-lower' }] })
assert.match(t, /Capabilities to fix: patching\.list \(not offered by the replacement\), patching\.apply \(a lower version\)\.$/)
noCodes(t)
t = replacementProblemText({ type: 'replacement_incomplete', module: 'x', reason: 'state-unreadable' })
assert.match(t, /^x: /)
assert.ok(!t.includes('replacement_incomplete'))
// Non-replacement problems keep the old text.
assert.equal(replacementProblemText({ module: 'a', type: 'missing_dependency', dependency: 'b', constraint: '>=1' }), 'a - missing_dependency')
assert.equal(replacementProblemText({ type: 'cycle' }), 'plan - cycle')
assert.equal(isReplacementProblem({ type: 'missing_dependency' }), false)
assert.equal(isReplacementProblem(conflict), true)

// Source checks.
const view = fs.readFileSync(new URL('../src/views/ModulesView.vue', import.meta.url), 'utf8')
assert.match(view, /from '\.\.\/module-replacement'/)
assert.match(view, /replacementSummary\(selected\)/)
assert.match(view, />Replacement </)
assert.match(view, /replacesLabel\(item\)/)
assert.match(view, /replacedByLabel\(item\)/)
assert.match(view, /v-for="\(problem,index\) in plan\.problems"[^\n]*replacementProblemText\(problem\)/)
assert.match(view, /v-for="\(line,index\) in replacementSummary\(selected\)\.lines"[^\n]*\{\{ line \}\}/)
assert.ok(!/v-html/.test(view.split('Replacement <')[1].slice(0, 400)), 'no v-html in the replacement section')
// 0.12.89: only a replacement_confirmation_required refusal is handled apart; every other error shows its message as is.
assert.match(view, /\} else error\.value = e\.message\n  \}\n\}/, 'confirmAction shows the error message as is')
const helper = fs.readFileSync(new URL('../src/module-replacement.js', import.meta.url), 'utf8')
assert.ok(!/^import /m.test(helper), 'module-replacement.js stays import-free')
assert.ok(!/fetch|localStorage|sessionStorage|Authorization/.test(helper))
const pkg = JSON.parse(fs.readFileSync(new URL('../tec_tac_package.json', import.meta.url), 'utf8'))
assert.equal(pkg.requires['tec-tac-framework'], '>=1.17.11,<2.0.0') // raised in 0.12.89
console.log('module-replacement-status-0.12.88: ok')
