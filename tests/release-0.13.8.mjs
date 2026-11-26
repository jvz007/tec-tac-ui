// 0.13.8 (26 November 2026): the Engineer Console sign-in and enrol pages, the sessions label and the audit hint. This release test replaces release-0.13.7.mjs.
// There is no git call here. The three version files and the lock agree at 0.13.8, the Core requirement is '>=1.18.57,<2.0.0',
// the root notes are the 0.13.8 ones, earlier notes are kept under docs/releases, touched files keep their line endings (LF).
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const exists = (p) => fs.existsSync(new URL(p, import.meta.url))

const manifest = JSON.parse(read('../tec_tac_package.json'))
const pkg = JSON.parse(read('../package.json'))
const lock = JSON.parse(read('../package-lock.json'))
const version = read('../VERSION').trim()

assert.equal(version, '0.13.8')
assert.equal(pkg.version, version)
assert.equal(manifest.version, version)
assert.equal(lock.version, version)
assert.equal(lock.packages[''].version, version)
assert.equal(manifest.requires['tec-tac-framework'], '>=1.18.57,<2.0.0', 'the Core requirement is the Core this was built against')
// tec-tac-release.json is written and signed when the package is packed, so it is not checked here.

const notes = read('../RELEASE_NOTES_0.13.8.md')
assert.equal(notes.split(/\r?\n/, 1)[0], '# UI 0.13.8')
assert.match(notes, /Requires Core 1\.18\.57 or later/)
assert.match(notes, /## Assumptions/)
assert.match(notes, /## Checks/)
assert.match(notes, /## Dev-server checklist/)
assert.match(notes, /PASS/)
assert.match(notes, /FAIL/)
assert.match(notes, /Send back/)
assert.match(notes, /Engineer Console sign-in/)
assert.match(notes, /Core 1\.18\.58/)
assert.equal(exists('../RELEASE_NOTES_0.13.7.md'), false, 'no 0.13.7 notes remain at the root')
assert.equal(exists('../docs/releases/RELEASE_NOTES_0.13.7.md'), true, 'the 0.13.7 notes are kept in docs/releases')
assert.doesNotMatch(notes, /Poppins|Inter\b/, 'no brand fonts in product notes')
assert.equal(exists('../docs/releases/RELEASE_NOTES_0.13.5.md'), true, 'the 0.13.5 notes are kept in docs/releases')
assert.equal(exists('../docs/releases/RELEASE_NOTES_0.13.4.md'), true, 'the 0.13.4 notes are kept in docs/releases')
assert.equal(exists('../RELEASE_NOTES_0.13.5.md'), false, 'no 0.13.5 notes remain at the root')
assert.equal(exists('./release-0.13.7.mjs'), false, 'the old release test is replaced by this one')
assert.doesNotMatch(read('./release-0.13.8.mjs').replace(/\/\/.*$/gm, '').replace(/assert\.[^\n]*/g, ''), /child_process|execFileSync|execSync/, 'no git or shell call')

assert.equal(pkg.scripts.test, 'node tests/run-all.mjs')
const { ENTRIES } = await import('./run-all.mjs')
assert.ok(ENTRIES.includes('node tests/release-0.13.8.mjs'))
for (const name of ['console-certificates-0.13.6', 'console-certificates-page-0.13.6', 'console-certificate-validity-0.13.6', 'console-certificates-enrol-link-0.13.7', 'console-sign-in-0.13.8', 'console-sign-in-route-0.13.8', 'console-enrol-0.13.8', 'console-sessions-label-0.13.8', 'console-certificates-hint-0.13.8']) {
  assert.ok(ENTRIES.includes(`node tests/${name}.mjs`), `${name} is in the runner`)
}
assert.ok(ENTRIES.includes('node tests/roles-permission-label-0.13.5.mjs'))
for (const entry of ENTRIES) assert.equal(exists(`../${entry.split(' ')[1]}`), true, `${entry} exists`)
assert.equal(new Set(ENTRIES).size, ENTRIES.length, 'no entry is listed twice')

for (const file of ['../VERSION', '../package.json', '../package-lock.json', '../tec_tac_package.json', '../RELEASE_NOTES_0.13.8.md', '../src/console-certificates.js', '../src/console-handoff.js', '../src/views/ConsoleSignInView.vue', '../src/views/ConsoleEnrolView.vue', '../src/views/SsoCallbackView.vue', '../src/components/LoginPanel.vue', '../src/components/access/AdminSessionsPanel.vue', '../src/access.js', '../src/App.vue', '../src/help/articles/console-certificates.md', '../src/views/ConsoleCertificatesView.vue', '../src/views/MyAccountView.vue', '../src/router.js', '../src/core-navigation.js', '../src/runtime-settings.js', '../src/components/RuntimeSettingsCard.vue', '../src/components/ConsoleCertificatesCard.vue', './release-0.13.8.mjs', './run-all.mjs', './api-contract-routes-0.12.58-1.mjs']) {
  assert.equal(read(file).includes('\r'), false, `${file} has no CR`)
}
console.log('release-0.13.8: PASS')
