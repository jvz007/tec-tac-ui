// 0.12.116 (request from Core 1.17.44): the export tec-tac-public-contract 1.17.50-0.12.115 lists the 0.12.112 rows, so the docs say
// "listed in the public contract export from 1.17.50-0.12.115" for exactly those rows and keep "not yet in the export" for the others.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const GOOD = 'listed in the public contract export from 1.17.50-0.12.115'

for (const file of ['module-dialogs.md', 'module-sign-in-landing.md', 'module-row-menu.md']) {
  const text = read(`../docs/${file}`)
  assert.ok(text.includes(GOOD), `${file} names the export`)
  assert.ok(!text.includes('not yet in the export'), `${file} no longer says not yet in the export`)
  assert.ok(!text.includes('does not claim the export lists it'), `${file} no longer disclaims the export`)
}
const components = read('../docs/module-components.md')
assert.ok(components.includes('They are listed in the public contract export from 1.17.50-0.12.115.'), 'Server search and paging names the export')
assert.ok(!components.includes('They are not yet in the export; Core writes the row'))

const api = read('../docs/module-runtime-api.md')
const lines = api.split('\n')
const uiRows = lines.filter((l) => l.includes('(UI 0.12.112,'))
assert.equal(uiRows.length, 4, 'the four 0.12.112 rows in the runtime page')
for (const row of uiRows) {
  assert.ok(row.includes(GOOD), 'a 0.12.112 row names the export')
  assert.ok(!row.includes('not yet in the export'))
  assert.ok(!row.includes('does not claim the export lists it'))
}
assert.deepEqual(['dialogs', 'signInLanding', 'rowMenu'].map((s) => uiRows.some((r) => r.includes(`ui.authenticated.${s}`))), [true, true, true])
assert.ok(uiRows.some((r) => r.includes('serverSearch')), 'the SearchSelect additions row')

// the other rows keep their wording
for (const marker of ['(UI 0.12.102, not yet in the export)', '(UI 0.12.104, not yet in the export)', '(UI 0.12.106, not yet in the export)', '(UI 0.12.111, not yet in the export)', '(UI 0.12.114, not yet in the export)']) {
  assert.ok(api.includes(marker), `${marker} is unchanged`)
}
// the FilterEditor row says it is not in the export yet
assert.ok(api.includes('**Contract row addition (UI 0.12.116, not yet in the export).**'))

// the export really lists the rows (the newest export in docs/contracts of the workspace root, when this checkout has it)
const exportUrl = new URL('../../../docs/contracts/tec-tac-public-contract   1.17.50-0.12.115.md', import.meta.url)
if (fs.existsSync(exportUrl)) {
  const exported = fs.readFileSync(exportUrl, 'utf8')
  for (const row of ['ui.authenticated.dialogs', 'ui.authenticated.signInLanding', 'ui.authenticated.rowMenu']) assert.ok(exported.includes(row), `the export lists ${row}`)
  assert.ok(exported.includes('serverSearch'), 'the export lists the SearchSelect server mode')
}

console.log('contract-docs-reword-0.12.116: PASS')
