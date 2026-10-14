// 0.12.106: the module preferences doc, the runtime API section and the release files. Every member and every limit in the source
// appears in the doc, the contract row is noted once (Core writes the export row), Core 1.17.35 is named, and the three version
// files and the release notes agree on 0.12.106.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const doc = read('../docs/module-preferences.md')
const source = read('../src/module-preferences.js')
const api = read('../docs/module-runtime-api.md')

// Every member the helper has (the source) is named in the doc.
for (const member of ['get(name, fallback)', 'getAll()', 'set(name, value)', 'remove(name)', 'clear()']) {
  assert.ok(doc.includes(member), `the doc names ${member}`)
}
for (const member of ['get', 'getAll', 'set', 'remove', 'clear']) {
  assert.match(source, new RegExp(`^\\s+(async )?${member}\\(`, 'm'), `the source has ${member}`)
}

// Every limit in the source appears in the doc: the name pattern as written, the value size, the depth, the count.
const pattern = /const NAME_PATTERN = \/\^(.+)\$\//.exec(source)
assert.ok(pattern, 'the name pattern is in the source')
assert.ok(doc.includes(pattern[1]), `the doc gives the name pattern ${pattern[1]}`)
assert.match(source, /MAX_VALUE_BYTES = 4 \* 1024/)
assert.ok(doc.includes('4 KiB'), 'the doc gives the 4 KiB value limit')
assert.match(source, /MAX_VALUE_DEPTH = 5/)
assert.ok(doc.includes('5 levels deep'), 'the doc gives the 5 level limit')
assert.ok(doc.includes('1 to 64 characters'), 'the doc gives the name length')
assert.ok(doc.includes('50 names'), 'the doc gives the Core count limit (Core 1.17.35)')
for (const code of ['invalid_name', 'invalid_value', 'preference_limit', 'module_not_found', 'signed_out', '429', '401']) {
  assert.ok(doc.includes(code), `the doc names ${code}`)
}
assert.ok(doc.includes('secret, token, password, key or personal data'), 'the doc gives the no-secrets rule')
assert.ok(doc.includes('registerPublic'), 'the doc says registerPublic gets none')
assert.ok(doc.includes('AD-20'), 'the doc says there is no replaced-module exception')

// The release it needs and the one contract-row note.
assert.ok(doc.includes('Core 1.17.35'), 'the doc names Core 1.17.35')
assert.ok(doc.includes('UI 0.12.106'), 'the doc names UI 0.12.106')
const rowCount = doc.split('ui.authenticated.modulePreferences').length - 1
assert.equal(rowCount, 1, 'the contract row is noted once in the module doc')
assert.match(doc, /## Contract row/)
assert.match(doc, /Core writes the export row/)
assert.match(doc, /reviews\/requests\/core\.md/)
assert.doesNotMatch(doc, /is in the public contract export|lists it in the export\./, 'the doc does not claim the export lists the row')
assert.match(doc, /localStorage/, 'the doc says browser storage is not used')

// The runtime API page: a section, the index sentence, the link, the Core version and one contract-row note.
assert.match(api, /## Module user preferences \(modulePreferences\)/)
assert.ok(api.includes('(#module-user-preferences-modulepreferences)'), 'the index links the section')
assert.ok(api.includes('module-preferences.md'), 'the runtime API page points to the doc')
assert.ok(api.includes('Core 1.17.35'), 'the runtime API page names Core 1.17.35')
assert.equal(api.split('ui.authenticated.modulePreferences').length - 1, 1, 'the runtime API page carries the row note once')

// The three version files, the Core requirement and the release notes agree.
const pkg = JSON.parse(read('../package.json'))
const manifest = JSON.parse(read('../tec_tac_package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()
// 0.12.107: this test pins the release it checks, so its pins move with each release (the version, the Core requirement and
// the notes file). Its module-preferences checks are unchanged.
assert.equal(version, '0.12.107')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)
assert.equal(manifest.requires['tec-tac-framework'], '>=1.17.37,<2.0.0')
const notes = read('../RELEASE_NOTES_0.12.107.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.12.107')
assert.match(notes, /Requires Core 1\.17\.37 or later/)
assert.ok(fs.existsSync(new URL('../docs/releases/RELEASE_NOTES_0.12.106.md', import.meta.url)), 'the 0.12.106 notes are archived in docs/releases')
assert.equal(fs.existsSync(new URL('../RELEASE_NOTES_0.12.106.md', import.meta.url)), false, 'no 0.12.106 notes remain at the root')
assert.ok(fs.existsSync(new URL('../docs/releases/RELEASE_NOTES_0.12.105.md', import.meta.url)), 'the 0.12.105 notes are archived in docs/releases')
assert.equal(fs.existsSync(new URL('../RELEASE_NOTES_0.12.105.md', import.meta.url)), false, 'no 0.12.105 notes remain at the root')

// The test script runs the new tests, in order.
for (const name of ['tactical-ui-preferences-0.12.106', 'tactical-ui-apply-0.12.106', 'date-format-0.12.106', 'module-preferences-0.12.106', 'module-preferences-docs-0.12.106']) {
  assert.ok(pkg.scripts.test.includes(`tests/${name}.mjs`), `npm test runs ${name}`)
}

console.log('module-preferences-docs-0.12.106: PASS')
