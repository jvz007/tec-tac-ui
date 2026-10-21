// 0.12.121: the three HIGH npm advisories are fixed. vue and every @vue/* package are exactly 3.5.42, nanoid and source-map-js are at
// or above the fixed versions, @vue/server-renderer is not imported by the app, no .npmrc turns certificate checks off, and the
// version files agree.
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

// (a) vue pinned exactly; lock resolves vue and every @vue/* package to 3.5.42 from the registry with integrity
assert.equal(pkg.dependencies.vue, '3.5.42')
const vueKeys = Object.keys(lock.packages).filter((k) => k === 'node_modules/vue' || k.startsWith('node_modules/@vue/'))
assert.ok(vueKeys.length >= 9, 'vue and its @vue packages are in the lock')
for (const key of vueKeys) {
  const entry = lock.packages[key]
  if (key === 'node_modules/@vue/devtools-api') continue // vue-router's own package, versioned separately
  assert.equal(entry.version, '3.5.42', `${key} is 3.5.42`)
  assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//, `${key} resolves from the registry`)
  assert.ok(entry.integrity, `${key} has an integrity hash`)
}
for (const name of ['compiler-core', 'compiler-dom', 'compiler-sfc', 'compiler-ssr', 'reactivity', 'runtime-core', 'runtime-dom', 'server-renderer', 'shared']) {
  assert.ok(lock.packages[`node_modules/@vue/${name}`], `@vue/${name} is in the lock`)
}

// (b) nanoid and source-map-js at or above the fixed versions; any override is exact and not lower
const mins = { nanoid: '3.3.18', 'source-map-js': '1.2.2' }
for (const [name, min] of Object.entries(mins)) {
  assert.ok(atLeast(lock.packages[`node_modules/${name}`].version, min), `${name} is ${min} or later`)
  const override = (pkg.overrides || {})[name]
  if (override !== undefined) {
    assert.match(override, /^\d+\.\d+\.\d+$/, `${name} override is an exact version`)
    assert.ok(atLeast(override, min), `${name} override is not lower than ${min}`)
  }
}

// (c) nothing in src/ or the vite config imports @vue/server-renderer
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
const files = [...walk('src'), ...fs.readdirSync(root).filter((f) => /^vite\.config\./.test(f))]
for (const file of files) assert.ok(!/server-renderer/.test(read(file)), `${file} does not use @vue/server-renderer`)

// (d) no .npmrc turns certificate checks off
for (const file of fs.readdirSync(root).filter((f) => f === '.npmrc')) {
  assert.ok(!/strict-ssl\s*=\s*false|NODE_TLS_REJECT_UNAUTHORIZED/i.test(read(file)), '.npmrc keeps certificate checks on')
}

// (e) versions agree and the Core requirement is unchanged
const tt = JSON.parse(read('tec_tac_package.json'))
assert.equal(read('VERSION').trim(), '0.12.121')
assert.equal(pkg.version, '0.12.121')
assert.equal(tt.version, '0.12.121')
assert.equal(tt.requires['tec-tac-framework'], '>=1.17.67,<2.0.0')
console.log('dependency-audit-0.12.121: ok')
