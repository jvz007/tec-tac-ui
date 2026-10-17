// 0.12.117 (standing rule, UI Q16): the UI raises its Core requirement to the newest signed Core it was tested against, Core 1.17.52
// (date and number filter fields need it; it carries 1.17.51). The manifest requires exactly '>=1.17.52,<2.0.0'. The version files
// agree, the root notes are the 0.12.117 ones, and the 0.12.116 to 0.12.110 notes are archived. npm test is one short command that
// runs tests/run-all.mjs. This replaces the 0.12.116 test, which pinned the previous version and the old script length.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, import.meta.url))

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(manifest.requires['tec-tac-framework'], '>=1.17.52,<2.0.0', 'the Core requirement is Core 1.17.52 or later, below 2.0.0')
assert.equal(version, '0.12.117')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)
// tec-tac-release.json is written and signed when the package is packed, so it is not checked here.

assert.equal(exists('../RELEASE_NOTES_0.12.117.md'), true, 'the current notes are at the root')
const notes = read('../RELEASE_NOTES_0.12.117.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.12.117')
assert.match(notes, /Requires Core 1\.17\.52 or later/, 'the notes say the requirement is Core 1.17.52')
assert.match(notes, /Left out, and why/, 'the notes say what was left out')
assert.match(notes, /Install Core 1\.17\.52 before this UI/, 'the notes say which Core goes first')
assert.match(notes, /1\.17\.51/, 'the notes name the Core 1.17.51 follow-up')
assert.match(notes, /not 0\.13\.0/, 'the notes say this is not 0.13.0')
assert.match(notes, /Nothing in this release was tested on the dev server/, 'the notes say nothing ran on the dev server')
assert.match(notes, /not yet in the export/, 'the notes say the surface is not yet in the export')
assert.match(notes, /No module may declare a date or number field before this release is installed/)
assert.match(notes, /Agents 0\.14\.0/, 'the notes name Agents 0.14.0')
assert.match(notes, /176 existing entries kept, 4 new/, 'the notes state the test list count')
assert.doesNotMatch(notes, /Poppins|Inter\b/, 'no brand fonts in product notes')

for (const v of ['0.12.116', '0.12.115', '0.12.114', '0.12.113', '0.12.112', '0.12.111', '0.12.110']) {
  assert.equal(exists(`../docs/releases/RELEASE_NOTES_${v}.md`), true, `the ${v} notes are archived`)
  assert.equal(exists(`../RELEASE_NOTES_${v}.md`), false, `no ${v} notes remain at the root`)
}
assert.equal(exists('./core-requirement-0.12.116.mjs'), false, 'the old requirement test is replaced')

// npm runs the script through cmd on Windows, which stops at 8191 characters: the list lives in the runner.
assert.equal(pkg.scripts.test, 'node tests/run-all.mjs')
assert.ok(pkg.scripts.test.length < 200)
const { ENTRIES } = await import('./run-all.mjs')
assert.ok(ENTRIES.includes('node tests/core-requirement-0.12.117.mjs'))
assert.equal(ENTRIES.some((entry) => entry.includes('core-requirement-0.12.116')), false)
for (const entry of ENTRIES) {
  const file = entry.split(' ')[1]
  assert.equal(exists(`../${file}`), true, `${file} exists`)
}
for (const name of ['filter-editor-date-number-0.12.117', 'filter-editor-docs-0.12.117', 'filter-editor-viewkey-0.12.117', 'test-runner-0.12.117']) {
  assert.ok(ENTRIES.includes(`node tests/${name}.mjs`), `${name} is in the runner`)
}
assert.ok(ENTRIES.includes('bash tests/filter-editor-0.12.116.sh'), 'the 0.12.116 FilterEditor tests still run')

const archived = read('../docs/releases/RELEASE_NOTES_0.12.113.md')
assert.doesNotMatch(archived, /never uses/, 'the archived 0.12.113 notes do not hold the stale phrase')
assert.match(archived, /Fixed after review/, 'the archived 0.12.113 notes carry the Fixed after review text')

console.log('core-requirement-0.12.117: PASS')
