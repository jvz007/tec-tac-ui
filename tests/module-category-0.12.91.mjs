// 0.12.91: AD-21 module category badge and filter on the Modules page (Core 1.17.13).
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { categoryBadge, categoryFilterKey, CATEGORY_FILTERS, filterByCategory, categoryNote, categorySearchText } = await import('../src/module-category.js')
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

// (1) badge label and tone
for (const [name, label, tone] of [['core', 'Core', ''], ['server', 'Server', ''], ['premium', 'Premium', ''], ['test', 'Test', 'warn']]) {
  const b = categoryBadge({ category: name, effective_category: name, category_missing: false })
  assert.deepEqual(b, { label, tone, known: true }, name)
  assert.equal(categoryFilterKey({ category: name, effective_category: name, category_missing: false }), name)
}
const missing = { category: null, effective_category: 'test', category_missing: true, category_warning: 'Core treats this module as test.' }
assert.deepEqual(categoryBadge(missing), { label: 'Not stated, treated as Test', tone: 'warn', known: true })
assert.equal(categoryFilterKey(missing), 'missing')

// (2) an older Core: no fields, no badge, no guess
for (const row of [{}, { id: 'x', enabled: true }, null, undefined]) {
  assert.equal(categoryBadge(row).known, false)
  assert.equal(categoryBadge(row).label, '')
  assert.equal(categoryFilterKey(row), 'unknown')
  assert.deepEqual(categoryNote(row), [])
}

// (3) a value this UI does not know is shown as sent, not dropped
const odd = { category: 'partner', effective_category: 'test', category_missing: false }
assert.deepEqual(categoryBadge(odd), { label: 'partner', tone: '', known: true })
assert.equal(categoryFilterKey(odd), 'other')

// (4) filters
assert.deepEqual(CATEGORY_FILTERS.map((f) => f.key), ['all', 'core', 'server', 'premium', 'test', 'missing'])
assert.deepEqual(CATEGORY_FILTERS.map((f) => f.label), ['All categories', 'Core', 'Server', 'Premium', 'Test', 'Not stated'])
const rows = [
  { id: 'a', category: 'core', category_missing: false },
  { id: 'b', category: 'server', category_missing: false },
  { id: 'c', category: 'premium', category_missing: false },
  { id: 'd', category: 'test', category_missing: false },
  missing && { id: 'e', ...missing },
  { id: 'f' },
  odd && { id: 'g', ...odd },
]
const ids = (key) => filterByCategory(rows, key).map((r) => r.id).join('')
assert.equal(ids('all'), 'abcdefg')
assert.equal(ids(undefined), 'abcdefg')
assert.equal(ids('core'), 'a')
assert.equal(ids('server'), 'b')
assert.equal(ids('premium'), 'c')
assert.equal(ids('test'), 'd')
assert.equal(ids('missing'), 'e')
assert.deepEqual(filterByCategory(null, 'core'), [])

// (5) search text and notes
assert.equal(categorySearchText({ category: 'premium', category_missing: false }), 'Premium')
assert.equal(categorySearchText({}), '')
assert.deepEqual(categoryNote(missing), ['Core treats this module as test.'])
const warning = '  Core refuses this test module on a production server.  '
assert.deepEqual(categoryNote({ category: 'test', category_warning: warning }), [warning], 'Core text unchanged')
assert.deepEqual(categoryNote({ category: 'core', category_mismatch: true }), ["The category recorded at install differs from the one in the module's manifest. Core uses the manifest."])
assert.equal(categoryNote({ category: 'core', category_warning: 'W', category_mismatch: true }).length, 2)
assert.deepEqual(categoryNote({ category: 'core', category_warning: 42 }), [])

// (6) helper stays pure; the page uses it
const helper = read('../src/module-category.js')
assert.ok(!/^import /m.test(helper), 'import-free')
assert.ok(!/fetch|localStorage|sessionStorage|Authorization/.test(helper))
const view = read('../src/views/ModulesView.vue')
assert.match(view, /from '\.\.\/module-category'/)
assert.match(view, /<th>Category<\/th>/)
assert.match(view, /v-model="categoryFilter"/)
assert.match(view, /v-for="f in CATEGORY_FILTERS"/)
assert.match(view, /v-for="\(line,index\) in categoryNote\(selected\)"[^\n]*\{\{ line \}\}/)
assert.ok(!/v-html/.test(view), 'ModulesView never uses v-html')
assert.ok(!/category_refused/.test(view), 'the production gate is not built')

// (7) version and requirement
const pkg = JSON.parse(read('../package.json'))
const manifest = JSON.parse(read('../tec_tac_package.json'))
assert.equal(pkg.version, '0.12.91')
assert.equal(manifest.version, '0.12.91')
assert.equal(read('../VERSION').trim(), '0.12.91')
assert.equal(manifest.requires['tec-tac-framework'], '>=1.17.13,<2.0.0')
assert.match(pkg.scripts.test, /tests\/module-category-0\.12\.91\.mjs/)
assert.match(pkg.scripts.test, /tests\/tactical-operations-query-file-0\.12\.91\.mjs/)
assert.match(pkg.scripts.test, /tests\/module-replacement-second-empty-0\.12\.91\.mjs/)
console.log('module-category-0.12.91: ok')
