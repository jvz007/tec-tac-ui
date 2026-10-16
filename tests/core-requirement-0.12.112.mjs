// 0.12.112 (standing rule, UI Q16): the UI raises its Core requirement to the Core release it was built and tested against,
// Core 1.17.43 (sync_schedule, the seeded repository, installer refusal status). The manifest requires exactly '>=1.17.43,<2.0.0'. The version files agree, the
// root notes are the 0.12.112 ones and name the three items, and the 0.12.111 and 0.12.110 notes are archived.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, import.meta.url))

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(manifest.requires['tec-tac-framework'], '>=1.17.43,<2.0.0', 'the Core requirement is Core 1.17.43 or later, below 2.0.0')
assert.equal(version, '0.12.112')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)

assert.equal(exists('../RELEASE_NOTES_0.12.112.md'), true, 'the current notes are at the root')
const notes = read('../RELEASE_NOTES_0.12.112.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.12.112')
assert.match(notes, /Requires Core 1\.17\.43 or later/, 'the notes say the requirement is Core 1.17.43')
assert.match(notes, /Module dialog host/i, 'the notes name the module dialog host')
assert.match(notes, /Sign-in landing hook/i, 'the notes name the sign-in landing hook')
assert.match(notes, /sync_schedule/, 'the notes name the Repositories daily sync')
assert.match(notes, /Left out, and why/, 'the notes say what was left out')

for (const v of ['0.12.111', '0.12.110']) {
  assert.equal(exists(`../docs/releases/RELEASE_NOTES_${v}.md`), true, `the ${v} notes are archived`)
  assert.equal(exists(`../RELEASE_NOTES_${v}.md`), false, `no ${v} notes remain at the root`)
}

console.log('core-requirement-0.12.112: PASS')
