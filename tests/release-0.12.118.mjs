// 0.12.118 (standing rule, UI Q16): the UI raises its Core requirement to the newest signed Core it was tested against, Core 1.17.65
// (the licensing, job history, pending-run, created-by and event-job features need 1.17.58 to 1.17.63, all inside it). The manifest
// requires exactly '>=1.17.65,<2.0.0'. The three version files and the lock agree, the root notes are the 0.12.118 ones with a
// dev-server checklist that has PASS and FAIL lines, every new test is in the runner, and the earlier notes are still present
// (archived under docs/releases). This replaces the 0.12.117 requirement test, which pinned the previous version.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, import.meta.url))

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(version, '0.12.118')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)
assert.equal(manifest.requires['tec-tac-framework'], '>=1.17.65,<2.0.0', 'the Core requirement is Core 1.17.65 or later, below 2.0.0')
// tec-tac-release.json is written and signed when the package is packed, so it is not checked here.

// ---- the notes ----
assert.equal(exists('../RELEASE_NOTES_0.12.118.md'), true, 'the current notes are at the root')
const notes = read('../RELEASE_NOTES_0.12.118.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.12.118')
assert.match(notes, /Requires Core 1\.17\.65 or later/)
assert.match(notes, /Install Core 1\.17\.65 before this UI/)
assert.match(notes, /Nothing in this release was tested on the dev server/)
for (const pattern of ['P1', 'P2', 'P4', 'P8', 'P9', 'P10']) assert.match(notes, new RegExp(`\\b${pattern}\\b`), `the notes name pattern ${pattern}`)
assert.match(notes, /## What could not run/)
assert.match(notes, /## Left out, and why/)
assert.match(notes, /not restyled/, 'the notes say what part of the redesign is left')
assert.match(notes, /X-Tec-Tac-Log-Truncated/)
assert.match(notes, /Content-Disposition/)
assert.match(notes, /Access-Control-Expose-Headers/, 'the notes say what Core is asked for when the headers are hidden')
assert.match(notes, /\[\.\.\. N bytes were left out of the middle of this log \.\.\.\]/, 'the marker-line fallback is named')
assert.match(notes, /## Dev-server checklist/)
assert.doesNotMatch(notes, /Poppins|Inter\b/, 'no brand fonts in product notes')
const checklist = notes.slice(notes.indexOf('## Dev-server checklist'))
const steps = checklist.split(/\n(?=\d+\. \*\*)/).slice(1)
assert.ok(steps.length >= 14, `the checklist has ${steps.length} steps`)
for (const step of steps) {
  assert.match(step, /\bPASS:/, `a PASS line in: ${step.slice(0, 50)}`)
  assert.match(step, /\bFAIL:/, `a FAIL line in: ${step.slice(0, 50)}`)
  assert.match(step, /Send back:/, `a send-back line in: ${step.slice(0, 50)}`)
}
for (const topic of [/themes/i, /History list and filters/, /failed job's log/, /5 MB/, /Download/, /without module rights|not a superuser|without/, /Licensing mode, as a superuser/, /status panel/i, /override appears only on enforce/, /created by and confirmed by/i, /Waiting for the result/, /Event jobs panel/, /headers/, /layer order/i]) {
  assert.match(checklist, topic, `the checklist covers ${topic}`)
}

// ---- the earlier notes are kept ----
for (const v of ['0.12.117', '0.12.116', '0.12.115', '0.12.114', '0.12.113', '0.12.112', '0.12.111', '0.12.110']) {
  assert.equal(exists(`../docs/releases/RELEASE_NOTES_${v}.md`), true, `the ${v} notes are kept in docs/releases`)
  assert.equal(exists(`../RELEASE_NOTES_${v}.md`), false, `no ${v} notes remain at the root`)
}
assert.equal(exists('./core-requirement-0.12.117.mjs'), false, 'the old requirement test is replaced by this one')

// ---- npm test is one short command; every new test is in the runner ----
assert.equal(pkg.scripts.test, 'node tests/run-all.mjs')
const { ENTRIES } = await import('./run-all.mjs')
assert.ok(ENTRIES.includes('node tests/release-0.12.118.mjs'))
assert.equal(ENTRIES.some((entry) => entry.includes('core-requirement-0.12.117')), false)
for (const name of [
  'kit-floating-window-0.12.118', 'kit-formrow-stacked-taginput-0.12.118', 'module-job-history-0.12.118', 'licensing-controls-0.12.118',
  'licence-override-0.12.118', 'scheduler-creator-filters-0.12.118', 'scheduler-pending-completion-0.12.118', 'scheduler-event-jobs-0.12.118',
  'module-manager-brand-board-0.12.118',
]) assert.ok(ENTRIES.includes(`node tests/${name}.mjs`), `${name} is in the runner`)
// every test file named for this version is listed
const listed = new Set(ENTRIES.map((entry) => entry.split(' ')[1]))
for (const file of fs.readdirSync(new URL('./', import.meta.url))) {
  if (/0\.12\.118\.(mjs|sh)$/.test(file)) assert.ok(listed.has(`tests/${file}`), `${file} is listed in tests/run-all.mjs`)
}
for (const entry of ENTRIES) assert.equal(exists(`../${entry.split(' ')[1]}`), true, `${entry} exists`)
assert.equal(new Set(ENTRIES).size, ENTRIES.length, 'no entry is listed twice')
assert.match(notes, new RegExp(`All ${ENTRIES.length} test entries passed`), 'the notes state the real entry count')
console.log('release-0.12.118: PASS')
