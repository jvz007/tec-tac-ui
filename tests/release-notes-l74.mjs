import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim()
const match = version.match(/^0\.12\.(\d+)$/)
assert.ok(match, `unexpected UI version ${version}`)
const currentPatch = Number(match[1])
for (let patch = 32; patch < currentPatch; patch += 1) {
  const archived = `0.12.${patch}`
  const file = path.join(root, 'docs', 'releases', `RELEASE_NOTES_${archived}.md`)
  assert.equal(fs.existsSync(file), true, `missing archived release note ${archived}`)
  const firstLine = fs.readFileSync(file, 'utf8').split(/\r?\n/, 1)[0]
  assert.match(firstLine, new RegExp(`^# (?:Tec-Tac )?UI ${archived.replaceAll('.', '\\.')}$$`), `archive heading mismatch for ${archived}`)
}
const noncanonical = fs.readdirSync(path.join(root, 'docs', 'releases')).filter((name) => /^\d+\.\d+\.\d+(?:-\d+)?\.md$/.test(name) || /^RELEASE_NOTES_\d+\.\d+\.\d+-\d+\.md$/.test(name))
assert.deepEqual(noncanonical, [], `noncanonical archive note names remain: ${noncanonical.join(', ')}`)
console.log('release-notes-l74 continuous archive: PASS')
