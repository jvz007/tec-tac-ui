// 0.13.5 (23 November 2026): the Roles label release. This release test replaces release-0.13.4.mjs.
// There is no git call here. The three version files and the lock agree at 0.13.5, the Core requirement is unchanged at
// '>=1.18.45,<2.0.0', the root notes are the 0.13.5 ones, earlier notes are kept under docs/releases, touched files have LF only.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, import.meta.url))

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(version, '0.13.5')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)
assert.equal(manifest.requires['tec-tac-framework'], '>=1.18.45,<2.0.0', 'the Core requirement is unchanged')
// tec-tac-release.json is written and signed when the package is packed, so it is not checked here.

const notes = read('../RELEASE_NOTES_0.13.5.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.13.5')
assert.match(notes, /Requires Core 1\.18\.45 or later/)
assert.match(notes, /## Assumptions/)
assert.match(notes, /## Checks/)
assert.match(notes, /## Dev-server checklist/)
assert.doesNotMatch(notes, /Poppins|Inter\b/, 'no brand fonts in product notes')
assert.equal(exists('../docs/releases/RELEASE_NOTES_0.13.4.md'), true, 'the 0.13.4 notes are kept in docs/releases')
assert.equal(exists('../RELEASE_NOTES_0.13.4.md'), false, 'no 0.13.4 notes remain at the root')
assert.equal(exists('./release-0.13.4.mjs'), false, 'the old release test is replaced by this one')
assert.doesNotMatch(read('./release-0.13.5.mjs').replace(/\/\/.*$/gm, '').replace(/assert\.[^\n]*/g, ''), /child_process|execFileSync|execSync/, 'no git or shell call')

assert.equal(pkg.scripts.test, 'node tests/run-all.mjs')
const { ENTRIES } = await import('./run-all.mjs')
assert.ok(ENTRIES.includes('node tests/release-0.13.5.mjs'))
assert.ok(ENTRIES.includes('node tests/roles-permission-label-0.13.5.mjs'), 'the label test is in the runner')
assert.ok(ENTRIES.includes('node tests/result-check-0.13.4.mjs'))
for (const entry of ENTRIES) assert.equal(exists(`../${entry.split(' ')[1]}`), true, `${entry} exists`)
assert.equal(new Set(ENTRIES).size, ENTRIES.length, 'no entry is listed twice')

for (const file of ['../VERSION', '../package.json', '../package-lock.json', '../tec_tac_package.json', '../RELEASE_NOTES_0.13.5.md', '../src/components/access/RolesPanel.vue', './roles-permission-label-0.13.5.mjs', './release-0.13.5.mjs', './run-all.mjs']) {
  assert.equal(read(file).includes('\r'), false, `${file} has no CR`)
}
console.log('release-0.13.5: PASS')
