// 0.12.116 (standing rule, UI Q16): the UI raises its Core requirement to the newest signed Core it was tested against, Core 1.17.50.
// The manifest requires exactly '>=1.17.50,<2.0.0'. Core 1.17.51 is committed but not signed, so it is not required. The version files
// agree, the root notes are the 0.12.116 ones, and the 0.12.115 to 0.12.110 notes are archived (the 0.12.113 archive copy holds the fixed
// text). This replaces the 0.12.115 test, which pinned the previous version.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, import.meta.url))

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(manifest.requires['tec-tac-framework'], '>=1.17.50,<2.0.0', 'the Core requirement is Core 1.17.50 or later, below 2.0.0')
assert.equal(version, '0.12.116')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)

assert.equal(exists('../RELEASE_NOTES_0.12.116.md'), true, 'the current notes are at the root')
const notes = read('../RELEASE_NOTES_0.12.116.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.12.116')
assert.match(notes, /Requires Core 1\.17\.50 or later/, 'the notes say the requirement is Core 1.17.50')
assert.match(notes, /Left out, and why/, 'the notes say what was left out')
assert.match(notes, /1\.17\.51/, 'the notes name the Core 1.17.51 follow-up')
assert.match(notes, /not 0\.13\.0|0\.13\.0/, 'the notes say this is not 0.13.0')
assert.match(notes, /Nothing in this release was tested on the dev server/, 'the notes say nothing ran on the dev server')
assert.match(notes, /not yet in the export/, 'the notes say the surface is not yet in the export')
assert.doesNotMatch(notes, /Poppins|Inter\b/, 'no brand fonts in product notes')

for (const v of ['0.12.115', '0.12.114', '0.12.113', '0.12.112', '0.12.111', '0.12.110']) {
  assert.equal(exists(`../docs/releases/RELEASE_NOTES_${v}.md`), true, `the ${v} notes are archived`)
  assert.equal(exists(`../RELEASE_NOTES_${v}.md`), false, `no ${v} notes remain at the root`)
}
assert.equal(exists('./core-requirement-0.12.115.mjs'), false, 'the old requirement test is replaced')
assert.match(pkg.scripts.test, /core-requirement-0\.12\.116\.mjs/)
assert.doesNotMatch(pkg.scripts.test, /core-requirement-0\.12\.115\.mjs/)
assert.ok(pkg.scripts.test.includes('bash tests/filter-editor-0.12.116.sh'), 'the FilterEditor tests are in the test script')
const runner = read('./filter-editor-0.12.116.sh')
for (const name of ['filter-editor-0.12.116', 'filter-editor-component-0.12.116', 'filter-editor-sets-0.12.116', 'filter-editor-binding-0.12.116', 'filter-editor-docs-0.12.116', 'contract-docs-reword-0.12.116']) {
  assert.ok(runner.includes(name), `${name} runs from the 0.12.116 runner`)
  assert.equal(exists(`./${name}.mjs`), true)
}
// npm runs the script through cmd on Windows, which stops at 8191 characters.
assert.ok(pkg.scripts.test.length < 8100, `the test script stays under the Windows command line limit (${pkg.scripts.test.length})`)

const archived = read('../docs/releases/RELEASE_NOTES_0.12.113.md')
assert.doesNotMatch(archived, /never uses/, 'the archived 0.12.113 notes do not hold the stale phrase')
assert.doesNotMatch(archived, /UI's env-config\.js first, then/, 'the archived 0.12.113 notes do not hold the stale source order')
assert.match(archived, /Fixed after review/, 'the archived 0.12.113 notes carry the Fixed after review text')

console.log('core-requirement-0.12.116: PASS')
