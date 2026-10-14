// 0.12.109 (standing rule, UI Q16): the UI raises its Core requirement to the Core release it was built and tested against,
// Core 1.17.39. The manifest requires exactly '>=1.17.39,<2.0.0'; VERSION, package.json, package-lock.json and
// tec_tac_package.json all read 0.12.109; RELEASE_NOTES_0.12.109.md exists at the root and names Core 1.17.39.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(manifest.requires['tec-tac-framework'], '>=1.17.39,<2.0.0', 'the Core requirement is Core 1.17.39 or later, below 2.0.0')
assert.equal(version, '0.12.109')
assert.equal(pkg.version, '0.12.109')
assert.equal(manifest.version, '0.12.109')
assert.equal(lock.version, '0.12.109')
assert.equal(lock.packages[''].version, '0.12.109')

const notesPath = new URL('../RELEASE_NOTES_0.12.109.md', import.meta.url)
assert.equal(fs.existsSync(notesPath), true, 'the 0.12.109 release notes are at the root')
const notes = read('../RELEASE_NOTES_0.12.109.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.12.109', 'the notes heading names the release')
assert.match(notes, /Requires Core 1\.17\.39 or later \(raised from 1\.17\.38/, 'the notes say the requirement was raised from 1.17.38')

// The 0.12.108 notes are archived with the earlier releases, and no other notes remain at the root.
assert.equal(fs.existsSync(new URL('../docs/releases/RELEASE_NOTES_0.12.108.md', import.meta.url)), true, 'the 0.12.108 notes are archived')
assert.equal(fs.existsSync(new URL('../RELEASE_NOTES_0.12.108.md', import.meta.url)), false, 'no 0.12.108 notes remain at the root')

console.log('core-requirement-0.12.109: PASS')
