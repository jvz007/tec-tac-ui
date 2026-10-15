// 0.12.109 (standing rule, UI Q16): the UI raises its Core requirement to the Core release it was built and tested against,
// Core 1.17.39. The manifest required exactly '>=1.17.39,<2.0.0' then; 0.12.111 raised it (see core-requirement-0.12.111), so this test checks that
// VERSION, package.json, package-lock.json and tec_tac_package.json agree with each other (not a fixed number), that the
// current release notes are at the root, and that the 0.12.109 notes stay archived with their Core 1.17.39 line.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.match(manifest.requires['tec-tac-framework'], /^>=1\.17\.\d+,<2\.0\.0$/, 'the Core requirement is a Core 1.17 release or later, below 2.0.0')
assert.match(version, /^0\.12\.\d+$/, 'the UI version is a 0.12 patch release')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)

assert.equal(fs.existsSync(new URL(`../RELEASE_NOTES_${version}.md`, import.meta.url)), true, 'the current release notes are at the root')
const notes = read('../docs/releases/RELEASE_NOTES_0.12.109.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.12.109', 'the notes heading names the release')
assert.match(notes, /Requires Core 1\.17\.39 or later \(raised from 1\.17\.38/, 'the notes say the requirement was raised from 1.17.38')

// The 0.12.108 notes are archived with the earlier releases, and no other notes remain at the root except the current one.
assert.equal(fs.existsSync(new URL('../docs/releases/RELEASE_NOTES_0.12.108.md', import.meta.url)), true, 'the 0.12.108 notes are archived')
assert.equal(fs.existsSync(new URL('../RELEASE_NOTES_0.12.108.md', import.meta.url)), false, 'no 0.12.108 notes remain at the root')
assert.equal(fs.existsSync(new URL('../RELEASE_NOTES_0.12.109.md', import.meta.url)), false, 'the 0.12.109 notes are archived, not at the root')
assert.equal(fs.existsSync(new URL('../docs/releases/RELEASE_NOTES_0.12.110.md', import.meta.url)), true, 'the 0.12.110 notes are archived')
assert.equal(fs.existsSync(new URL('../RELEASE_NOTES_0.12.110.md', import.meta.url)), false, 'the 0.12.110 notes are not at the root')

console.log('core-requirement-0.12.109: PASS')
