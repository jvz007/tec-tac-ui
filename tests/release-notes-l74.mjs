import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const version of ['0.12.32', '0.12.33', '0.12.34', '0.12.35', '0.12.41', '0.12.47']) {
  const file = path.join(root, 'docs', 'releases', `RELEASE_NOTES_${version}.md`)
  assert.equal(fs.existsSync(file), true, `missing archived release note ${version}`)
  const firstLine = fs.readFileSync(file, 'utf8').split(/\r?\n/, 1)[0]
  assert.equal(firstLine, `# Tec-Tac UI ${version}`, `archive heading mismatch for ${version}`)
}
assert.equal(fs.existsSync(path.join(root, 'docs', 'releases', 'RELEASE_NOTES_0.12.34-1.md')), false, 'rebuild suffix must not be a separate archive identity')
const noncanonical = fs.readdirSync(path.join(root, 'docs', 'releases')).filter((name) => /^\d+\.\d+\.\d+(?:-\d+)?\.md$/.test(name) || /^RELEASE_NOTES_\d+\.\d+\.\d+-\d+\.md$/.test(name))
assert.deepEqual(noncanonical, [], `noncanonical archive note names remain: ${noncanonical.join(', ')}`)
console.log('release-notes-l74: PASS')
