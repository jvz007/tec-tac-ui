import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const install = fs.readFileSync(path.join(root, 'scripts', 'install.sh'), 'utf8')
assert.match(install, /^npm ci$/m, 'server installer must install from the committed lock file with npm ci')
assert.doesNotMatch(install, /npm install(?:\s|$)/, 'server installer must not use npm install')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
assert.equal(lock.lockfileVersion, 3)
assert.equal(lock.packages?.['']?.version, pkg.version)
for (const [name, version] of Object.entries(pkg.dependencies || {})) {
  assert.equal(lock.packages?.['']?.dependencies?.[name], version, `lock root dependency mismatch for ${name}`)
}
for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
  assert.equal(lock.packages?.['']?.devDependencies?.[name], version, `lock root devDependency mismatch for ${name}`)
}
console.log('install-lockfile-u1: PASS')
