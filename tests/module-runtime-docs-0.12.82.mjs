import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const doc = read('../docs/module-runtime-api.md')

for (const heading of ['## Module router', '## hasPermission(code)', '## codeEditor.languages', '## tacticalOperation(moduleId, operationId, options)', '## hasTacticalPermission(flag)']) {
  assert.ok(doc.split('\n').includes(heading), `missing heading ${heading}`)
}

// The language list in the doc cannot drift from the source.
const source = read('../src/code-editor.js')
const fromSource = [...source.match(/SUPPORTED_LANGUAGES = Object\.freeze\(\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
const section = doc.split('## codeEditor.languages')[1]
const fromDoc = [...section.matchAll(/^- `([a-z]+)`$/gm)].map((m) => m[1])
assert.deepEqual(fromDoc, fromSource)
assert.match(section, /Unsupported Tec-Tac editor language/)
assert.match(section, /module-code-editor\.md/)

assert.match(doc, /addRoute\(parentName, route\)/)
assert.match(doc, /meta\.dynamicModule/)
assert.match(doc, /abandoned/)
assert.match(doc, /Modules cannot remove navigation/)
assert.match(doc.split('\n').slice(0, 6).join('\n'), /#module-router/, 'the opening lines link to the new sections')

// The docs paths the Core contract rows name exist.
for (const file of ['module-runtime-api.md', 'module-code-editor.md', 'module-help.md', 'module-status.md']) {
  assert.ok(fs.existsSync(fileURLToPath(new URL("../docs/" + file, import.meta.url))), file)
}
console.log('[TEST] module runtime docs (0.12.82) OK')
