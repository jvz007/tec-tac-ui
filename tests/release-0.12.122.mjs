// 0.12.122 (standing rule, UI Q16): the UI keeps the Core requirement of the newest signed Core it was tested against, Core 1.17.67
// (the three log routes this release reads are Core 1.17.67's own). The manifest requires exactly '>=1.17.67,<2.0.0'. The three
// version files and the lock agree, the root notes are the 0.12.122 ones with a dev-server checklist that has PASS, FAIL and
// send-back lines, every new test is in the runner, and the earlier notes are kept under docs/releases. This replaces the 0.12.119
// release test, which pinned the previous version.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, import.meta.url))

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(version, '0.12.122')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)
assert.equal(manifest.requires['tec-tac-framework'], '>=1.17.67,<2.0.0', 'the Core requirement is Core 1.17.67 or later, below 2.0.0')
assert.match(manifest.requires['tec-tac-framework'], /^>=1\.17\.\d+,<2\.0\.0$/, 'a signed Core release')
// tec-tac-release.json is written and signed when the package is packed, so it is not checked here.

const notes = read('../RELEASE_NOTES_0.12.122.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.12.122')
assert.match(notes, /Requires Core 1\.17\.67 or later/)
assert.match(notes, /vite 6\.4\.5/)
assert.match(notes, /0\.12\.121 \(vite 6\.4\.3\)/,'the notes name the rollback')
assert.match(notes, /## What could not run/)
assert.match(notes, /not run here/)
assert.match(notes, /## Left out, and why/)
assert.doesNotMatch(notes, /Poppins|Inter\b/, 'no brand fonts in product notes')
assert.match(notes, /## Dev-server checklist/)
const checklist = notes.slice(notes.indexOf('## Dev-server checklist'))
const steps = checklist.split(/\n(?=\d+\. \*\*)/).slice(1)
assert.equal(steps.length, 3, `the checklist has ${steps.length} steps`)
for (const step of steps) {
  assert.match(step, /\bPASS:/, `a PASS line in: ${step.slice(0, 50)}`)
  assert.match(step, /\bFAIL:/, `a FAIL line in: ${step.slice(0, 50)}`)
  assert.match(step, /Send back:/, `a send-back line in: ${step.slice(0, 50)}`)
}

for (const v of ['0.12.121', '0.12.120', '0.12.119', '0.12.118', '0.12.117', '0.12.116', '0.12.115', '0.12.114', '0.12.113', '0.12.112', '0.12.111', '0.12.110']) {
  assert.equal(exists(`../docs/releases/RELEASE_NOTES_${v}.md`), true, `the ${v} notes are kept in docs/releases`)
  assert.equal(exists(`../RELEASE_NOTES_${v}.md`), false, `no ${v} notes remain at the root`)
}
assert.equal(exists('./release-0.12.121.mjs'), false, 'the old release test is replaced by this one')

assert.equal(pkg.scripts.test, 'node tests/run-all.mjs')
const { ENTRIES } = await import('./run-all.mjs')
assert.ok(ENTRIES.includes('node tests/release-0.12.122.mjs'))
assert.equal(ENTRIES.some((entry) => entry.includes('release-0.12.121')), false)
assert.ok(ENTRIES.includes('node tests/dependency-audit-0.12.122.mjs'), 'the new test is in the runner')
const listed = new Set(ENTRIES.map((entry) => entry.split(' ')[1]))
for (const file of fs.readdirSync(new URL('./', import.meta.url))) {
  if (/0\.12\.122\.(mjs|sh)$/.test(file)) assert.ok(listed.has(`tests/${file}`), `${file} is listed in tests/run-all.mjs`)
}
for (const entry of ENTRIES) assert.equal(exists(`../${entry.split(' ')[1]}`), true, `${entry} exists`)
assert.equal(new Set(ENTRIES).size, ENTRIES.length, 'no entry is listed twice')
assert.match(notes, new RegExp(`${ENTRIES.length} test entries ran`), 'the notes state the real entry count')
console.log('release-0.12.122: PASS')
