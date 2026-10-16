// 0.12.115 (standing rule, UI Q16): the UI raises its Core requirement to the newest signed Core it was tested against, Core 1.17.49.
// The manifest requires exactly '>=1.17.49,<2.0.0'. The version files agree, the root notes are the 0.12.115 ones, the 0.12.114 to
// 0.12.110 notes are archived, and the 0.12.113 archive copy holds the fixed text (it was already fixed in 0.12.114; this locks it).
// This replaces the 0.12.114 test, which pinned the previous version.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, import.meta.url))

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(manifest.requires['tec-tac-framework'], '>=1.17.49,<2.0.0', 'the Core requirement is Core 1.17.49 or later, below 2.0.0')
assert.equal(version, '0.12.115')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)

assert.equal(exists('../RELEASE_NOTES_0.12.115.md'), true, 'the current notes are at the root')
const notes = read('../RELEASE_NOTES_0.12.115.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.12.115')
assert.match(notes, /Requires Core 1\.17\.49 or later/, 'the notes say the requirement is Core 1.17.49')
assert.match(notes, /Fixed after held reviews/, 'the notes have the held-review section')
assert.match(notes, /Left out, and why/, 'the notes say what was left out')
assert.match(notes, /0\.13\.0/, 'the notes name 0.13.0')
assert.match(notes, /1\.18\.0/, 'the notes name Core 1.18.0')

for (const v of ['0.12.114', '0.12.113', '0.12.112', '0.12.111', '0.12.110']) {
  assert.equal(exists(`../docs/releases/RELEASE_NOTES_${v}.md`), true, `the ${v} notes are archived`)
  assert.equal(exists(`../RELEASE_NOTES_${v}.md`), false, `no ${v} notes remain at the root`)
}

const archived = read('../docs/releases/RELEASE_NOTES_0.12.113.md')
assert.doesNotMatch(archived, /never uses/, 'the archived 0.12.113 notes do not hold the stale phrase')
assert.doesNotMatch(archived, /UI's env-config\.js first, then/, 'the archived 0.12.113 notes do not hold the stale source order')
assert.match(archived, /Fixed after review/, 'the archived 0.12.113 notes carry the Fixed after review text')

console.log('core-requirement-0.12.115: PASS')
