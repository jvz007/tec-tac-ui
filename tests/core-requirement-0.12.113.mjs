// 0.12.113 (standing rule, UI Q16): the UI raises its Core requirement to the Core release it was built and tested against,
// Core 1.17.46. The manifest requires exactly '>=1.17.46,<2.0.0'. The version files agree, the root notes are the 0.12.113 ones and
// name the installer change, and the 0.12.112, 0.12.111 and 0.12.110 notes are archived.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, import.meta.url))

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(manifest.requires['tec-tac-framework'], '>=1.17.46,<2.0.0', 'the Core requirement is Core 1.17.46 or later, below 2.0.0')
assert.equal(version, '0.12.113')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)

assert.equal(exists('../RELEASE_NOTES_0.12.113.md'), true, 'the current notes are at the root')
const notes = read('../RELEASE_NOTES_0.12.113.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.12.113')
assert.match(notes, /Requires Core 1\.17\.46 or later/, 'the notes say the requirement is Core 1.17.46')
assert.match(notes, /TEC_TAC_API_URL/, 'the notes name TEC_TAC_API_URL')
assert.match(notes, /env-config\.js/, 'the notes name env-config.js')
assert.match(notes, /curl -ksS/, 'the notes give the curl check')
assert.match(notes, /Fixed after review/, 'the notes carry the Fixed after review section')
assert.match(notes, /Left out, and why/, 'the notes say what was left out')

for (const v of ['0.12.112', '0.12.111', '0.12.110']) {
  assert.equal(exists(`../docs/releases/RELEASE_NOTES_${v}.md`), true, `the ${v} notes are archived`)
  assert.equal(exists(`../RELEASE_NOTES_${v}.md`), false, `no ${v} notes remain at the root`)
}

console.log('core-requirement-0.12.113: PASS')
