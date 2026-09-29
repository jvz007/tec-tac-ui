import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tests = [
  ['D2/D3', 'tests/backup-restore-final-closure-0.12.65.mjs'],
  ['F1/F2', 'tests/f1-f2-my-account-done-when-0.12.66.mjs'],
  ['F4', 'tests/f4-runtime-context-done-when-0.12.66.mjs'],
  ['F5/F6/F7', 'tests/f5-f7-resources-done-when-0.12.66.mjs'],
  ['F8/F9/F10', 'tests/f8-f10-extension-surfaces-done-when-0.12.66.mjs'],
]

for (const [rows, rel] of tests) {
  const proc = spawnSync(process.execPath, [path.join(root, rel)], { cwd: root, encoding: 'utf8' })
  assert.equal(proc.status, 0, `${rows} acceptance failed:\n${proc.stdout}\n${proc.stderr}`)
  assert.match(proc.stdout, /PASS/, `${rows} acceptance did not report PASS`)
}

console.log('tracker acceptance UI rows D2/D3/F1/F2/F4/F5/F6/F7/F8/F9/F10 0.12.67: PASS')
