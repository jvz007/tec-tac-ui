// 0.12.114 (standing rule, UI Q16): the UI raises its Core requirement to the newest signed Core it was tested against, Core 1.17.48.
// The manifest requires exactly '>=1.17.48,<2.0.0'. The version files agree, the root notes are the 0.12.114 ones and carry the
// 0.13.0 list and a Left out section, and the 0.12.113 to 0.12.110 notes are archived. This replaces the 0.12.113 test, which pinned
// the previous version.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, import.meta.url))

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(manifest.requires['tec-tac-framework'], '>=1.17.48,<2.0.0', 'the Core requirement is Core 1.17.48 or later, below 2.0.0')
assert.equal(version, '0.12.114')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)

assert.equal(exists('../RELEASE_NOTES_0.12.114.md'), true, 'the current notes are at the root')
const notes = read('../RELEASE_NOTES_0.12.114.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.12.114')
assert.match(notes, /Requires Core 1\.17\.48 or later/, 'the notes say the requirement is Core 1.17.48')
assert.match(notes, /0\.13\.0/, 'the notes name the 0.13.0 list')
assert.match(notes, /1\.18\.0/, 'the notes name Core 1.18.0')
assert.match(notes, /Dark, Light and High contrast/, 'the notes name the theme test still to do')
assert.match(notes, /Nothing in this release was tested on the dev server/, 'the notes say plainly what was not tested')
assert.match(notes, /Left out, and why/, 'the notes say what was left out')

for (const v of ['0.12.113', '0.12.112', '0.12.111', '0.12.110']) {
  assert.equal(exists(`../docs/releases/RELEASE_NOTES_${v}.md`), true, `the ${v} notes are archived`)
  assert.equal(exists(`../RELEASE_NOTES_${v}.md`), false, `no ${v} notes remain at the root`)
}

console.log('core-requirement-0.12.114: PASS')
