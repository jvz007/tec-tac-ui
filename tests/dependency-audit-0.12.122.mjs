// 0.12.122: vite is exactly 6.4.5 (the three launch-editor advisories). Nothing else moves backwards: vue and every @vue/* package
// stay at 3.5.42, nanoid and source-map-js stay at or above the fixed versions, no .npmrc turns certificate checks off, the version
// files agree and the Core requirement is unchanged. The release notes name the packages, the advisories and the build-time scope.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const tuple = (v) => v.split('.').map((n) => Number(n))
const atLeast = (v, min) => {
  const a = tuple(v), b = tuple(min)
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i] }
  return true
}

const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))

// (a) vite exact, plugin-vue unchanged
assert.equal(pkg.devDependencies.vite, '6.4.5')
assert.equal(pkg.devDependencies['@vitejs/plugin-vue'], '5.2.4')

// (b) the lock resolves vite 6.4.5 from the registry with an integrity hash and the root entry matches package.json
const vite = lock.packages['node_modules/vite']
assert.equal(vite.version, '6.4.5')
assert.match(vite.resolved, /^https:\/\/registry\.npmjs\.org\//)
assert.ok(vite.integrity, 'vite has an integrity hash')
assert.equal(lock.packages[''].devDependencies.vite, '6.4.5')

// (c) launch-editor is not in the lock (vite 6.4.5 does not depend on it), so no vulnerable copy is installed and no override pins one
for (const key of Object.keys(lock.packages)) assert.ok(!/node_modules\/launch-editor$/.test(key), key + " is not expected in the lock")
assert.equal((pkg.overrides || {})["launch-editor"], undefined, "no launch-editor override")

// (d) nothing moved backwards
assert.equal(pkg.dependencies.vue, '3.5.42')
for (const key of Object.keys(lock.packages).filter((k) => k === 'node_modules/vue' || k.startsWith('node_modules/@vue/'))) {
  if (key === 'node_modules/@vue/devtools-api') continue
  assert.equal(lock.packages[key].version, '3.5.42', `${key} is 3.5.42`)
}
assert.ok(atLeast(lock.packages['node_modules/nanoid'].version, '3.3.18'))
assert.ok(atLeast(lock.packages['node_modules/source-map-js'].version, '1.2.2'))

// (e) no .npmrc turns certificate checks off
for (const file of fs.readdirSync(root).filter((f) => f === '.npmrc')) {
  assert.ok(!/strict-ssl\s*=\s*false|NODE_TLS_REJECT_UNAUTHORIZED/i.test(read(file)), '.npmrc keeps certificate checks on')
}

// (f) versions agree and the Core requirement is unchanged
const tt = JSON.parse(read('tec_tac_package.json'))
assert.equal(read('VERSION').trim(), '0.12.122')
assert.equal(pkg.version, '0.12.122')
assert.equal(tt.version, '0.12.122')
assert.equal(tt.requires['tec-tac-framework'], '>=1.17.67,<2.0.0')

// (g) the release notes
const notes = read('RELEASE_NOTES_0.12.122.md')
for (const word of ['vite', 'launch-editor', 'GHSA-698v-4r3x-3vcv', 'GHSA-r825-w8mm-5pxw', 'GHSA-587h-7wmj-h5pm', 'build-time']) {
  assert.ok(notes.includes(word), `the notes mention ${word}`)
}
console.log('dependency-audit-0.12.122: ok')
