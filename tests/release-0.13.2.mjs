// 0.13.2 (Johan, 21 November 2026): upgrade several modules at once from the Online catalog. This release test replaces
// release-0.13.0.mjs, which ran `git diff` on src/ and so failed as soon as src/ changed (held Medium from the UI 0.13.0 review).
// There is no git call here. The three version files and the lock agree at 0.13.2, the manifest requires exactly
// '>=1.18.42,<2.0.0' (Core 1.18.42, signed on dev, adds the online stage/batch route), the root notes are the
// 0.13.2 ones with a dev-server checklist, and the earlier notes are kept under docs/releases.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, import.meta.url))

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(version, '0.13.2')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)
assert.equal(manifest.requires['tec-tac-framework'], '>=1.18.42,<2.0.0', 'the Core requirement is Core 1.18.42 or later, below 2.0.0')
assert.match(manifest.requires['tec-tac-framework'], /^>=1\.\d+\.\d+,<2\.0\.0$/, 'a signed Core release')
// tec-tac-release.json is written and signed when the package is packed, so it is not checked here.

const notes = read('../RELEASE_NOTES_0.13.2.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.13.2')
assert.match(notes, /Requires Core 1\.18\.42 or later/)
assert.match(notes, /## Assumptions/)
assert.match(notes, /## Known failing test/)
assert.match(notes, /## What could not run/)
assert.match(notes, /## Left out, and why/)
assert.doesNotMatch(notes, /Poppins|Inter\b/, 'no brand fonts in product notes')
assert.match(notes, /## Dev-server checklist/)
const checklist = notes.slice(notes.indexOf('## Dev-server checklist'))
const steps = checklist.split(/\n(?=\d+\. \*\*)/).slice(1)
assert.ok(steps.length >= 8, `the checklist has ${steps.length} steps`)
for (const step of steps) {
  assert.match(step, /\bPASS:/, `a PASS line in: ${step.slice(0, 50)}`)
  assert.match(step, /\bFAIL:/, `a FAIL line in: ${step.slice(0, 50)}`)
  assert.match(step, /Send back:/, `a send-back line in: ${step.slice(0, 50)}`)
}

assert.equal(exists('../docs/releases/RELEASE_NOTES_0.13.1.md'), true, 'the 0.13.1 notes are kept in docs/releases')
assert.equal(exists('../RELEASE_NOTES_0.13.1.md'), false, 'no 0.13.1 notes remain at the root')
assert.equal(exists('../docs/releases/RELEASE_NOTES_0.13.0.md'), true, 'the 0.13.0 notes are kept in docs/releases')
assert.equal(exists('../RELEASE_NOTES_0.13.0.md'), false, 'no 0.13.0 notes remain at the root')
for (const v of ['0.12.127', '0.12.126', '0.12.125', '0.12.118', '0.12.110']) {
  assert.equal(exists(`../docs/releases/RELEASE_NOTES_${v}.md`), true, `the ${v} notes are kept in docs/releases`)
  assert.equal(exists(`../RELEASE_NOTES_${v}.md`), false, `no ${v} notes remain at the root`)
}
assert.equal(exists('./release-0.13.1.mjs'), false, 'the old release test is replaced by this one')
assert.equal(exists('./bulk-upgrade-0.13.1.mjs'), false, 'the 0.13.1 bulk test is deleted with the run path')
assert.doesNotMatch(read('./release-0.13.2.mjs').replace(/\/\/.*$/gm, '').replace(/assert\.[^\n]*/g, ''), /child_process|execFileSync|execSync/, 'no git or shell call')

assert.equal(pkg.scripts.test, 'node tests/run-all.mjs')
const { ENTRIES } = await import('./run-all.mjs')
assert.ok(ENTRIES.includes('node tests/release-0.13.2.mjs'))
assert.equal(ENTRIES.some((entry) => entry.includes('release-0.13.0')), false)
assert.ok(ENTRIES.includes('node tests/bulk-stage-0.13.2.mjs'), 'the bulk stage test is in the runner')
const listed = new Set(ENTRIES.map((entry) => entry.split(' ')[1]))
for (const file of fs.readdirSync(new URL('./', import.meta.url))) {
  if (/0\.13\.2\.(mjs|sh)$/.test(file)) assert.ok(listed.has(`tests/${file}`), `${file} is listed in tests/run-all.mjs`)
}
for (const entry of ENTRIES) assert.equal(exists(`../${entry.split(' ')[1]}`), true, `${entry} exists`)
assert.equal(new Set(ENTRIES).size, ENTRIES.length, 'no entry is listed twice')
assert.match(notes, new RegExp(`${ENTRIES.length} test entries ran`), 'the notes state the real entry count')
console.log('release-0.13.2: PASS')
