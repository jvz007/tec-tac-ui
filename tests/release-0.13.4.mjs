// 0.13.4 (Johan, 22 November 2026): the result check page (B2). This release test replaces release-0.13.3.mjs.
// There is no git call here. The three version files and the lock agree at 0.13.4, the manifest requires exactly
// '>=1.18.45,<2.0.0' (Core 1.18.45 renamed the item field to result_check; 1.18.44 never installed), the root notes are the
// 0.13.4 ones with a dev-server checklist, and the earlier notes are kept under docs/releases.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, import.meta.url))

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(version, '0.13.4')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)
assert.equal(manifest.requires['tec-tac-framework'], '>=1.18.45,<2.0.0', 'the Core requirement is Core 1.18.45 or later, below 2.0.0')
assert.match(manifest.requires['tec-tac-framework'], /^>=1\.\d+\.\d+,<2\.0\.0$/, 'a signed Core release')
// tec-tac-release.json is written and signed when the package is packed, so it is not checked here.

const notes = read('../RELEASE_NOTES_0.13.4.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.13.4')
assert.match(notes, /Requires Core 1\.18\.45 or later/)
assert.match(notes, /Script Execution 0\.7\.1/, 'the notes say the checklist needs Script Execution 0.7.1')
assert.match(notes, /## Assumptions/)
assert.match(notes, /## Known failing test/)
assert.match(notes, /## What could not run/)
assert.match(notes, /## Left out, and why/)
assert.doesNotMatch(notes, /Poppins|Inter\b/, 'no brand fonts in product notes')
assert.match(notes, /## Dev-server checklist/)
const checklist = notes.slice(notes.indexOf('## Dev-server checklist'))
const steps = checklist.split(/\n(?=\d+\. \*\*)/).slice(1)
assert.ok(steps.length >= 6, `the checklist has ${steps.length} steps`)
for (const step of steps) {
  assert.match(step, /\bPASS:/, `a PASS line in: ${step.slice(0, 50)}`)
  assert.match(step, /\bFAIL:/, `a FAIL line in: ${step.slice(0, 50)}`)
  assert.match(step, /Send back:/, `a send-back line in: ${step.slice(0, 50)}`)
}

assert.equal(exists('../docs/releases/RELEASE_NOTES_0.13.3.md'), true, 'the 0.13.3 notes are kept in docs/releases')
assert.equal(exists('../RELEASE_NOTES_0.13.3.md'), false, 'no 0.13.3 notes remain at the root')
assert.equal(exists('./release-0.13.3.mjs'), false, 'the old release test is replaced by this one')
assert.equal(exists('./bulk-upgrade-0.13.1.mjs'), false, 'the 0.13.1 bulk test is deleted with the run path')
assert.doesNotMatch(read('./release-0.13.4.mjs').replace(/\/\/.*$/gm, '').replace(/assert\.[^\n]*/g, ''), /child_process|execFileSync|execSync/, 'no git or shell call')

assert.equal(pkg.scripts.test, 'node tests/run-all.mjs')
const { ENTRIES } = await import('./run-all.mjs')
assert.ok(ENTRIES.includes('node tests/release-0.13.4.mjs'))
assert.equal(ENTRIES.some((entry) => entry.includes('release-0.13.0')), false)
assert.ok(ENTRIES.includes('node tests/bulk-stage-0.13.2.mjs'), 'the 0.13.2 bulk stage test is still in the runner')
assert.ok(ENTRIES.includes('node tests/system-update-versions-0.13.3.mjs'), 'the version dropdown test is in the runner')
assert.ok(ENTRIES.includes('node tests/result-check-0.13.4.mjs'), 'the result check test is in the runner')
const listed = new Set(ENTRIES.map((entry) => entry.split(' ')[1]))
for (const file of fs.readdirSync(new URL('./', import.meta.url))) {
  if (/0\.13\.[24]\.(mjs|sh)$/.test(file)) assert.ok(listed.has(`tests/${file}`), `${file} is listed in tests/run-all.mjs`)
}
for (const entry of ENTRIES) assert.equal(exists(`../${entry.split(' ')[1]}`), true, `${entry} exists`)
assert.equal(new Set(ENTRIES).size, ENTRIES.length, 'no entry is listed twice')
assert.match(notes, new RegExp(`${ENTRIES.length} test entries ran`), 'the notes state the real entry count')
console.log('release-0.13.4: PASS')
