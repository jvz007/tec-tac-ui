// 0.12.104: the xterm.js dependency is pinned to exact versions, the lock resolves both from the registry with integrity, no other
// @xterm package is present, the licence text ships with the build and names each package, and xterm is imported only by
// src/terminal-widget.js, so the code loads on first use and never in the main bundle.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const exact = /^\d+\.\d+\.\d+$/

const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const deps = pkg.dependencies || {}
const dev = pkg.devDependencies || {}

// 1. exact pins, no ranges, and no other @xterm package
assert.equal(deps['@xterm/xterm'], '5.5.0')
assert.equal(deps['@xterm/addon-fit'], '0.10.0')
for (const name of ['@xterm/xterm', '@xterm/addon-fit']) assert.match(deps[name], exact, `${name} is an exact version`)
const xtermNames = [...Object.keys(deps), ...Object.keys(dev)].filter((name) => name.startsWith('@xterm/'))
assert.deepEqual(xtermNames.sort(), ['@xterm/addon-fit', '@xterm/xterm'], 'no other @xterm package is declared')

// 2. the lock resolves both from the registry with integrity, and holds no other @xterm package
const lockXterm = Object.keys(lock.packages).filter((key) => key.startsWith('node_modules/@xterm/'))
assert.deepEqual(lockXterm.sort(), ['node_modules/@xterm/addon-fit', 'node_modules/@xterm/xterm'], 'the lock holds only the two packages')
for (const [key, version] of [['node_modules/@xterm/xterm', '5.5.0'], ['node_modules/@xterm/addon-fit', '0.10.0']]) {
  const entry = lock.packages[key]
  assert.equal(entry.version, version)
  assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\/@xterm\/.+\.tgz$/, `${key} resolves from the npm registry`)
  assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]+=*$/, `${key} carries an integrity hash`)
  assert.equal(entry.license, 'MIT')
}
assert.deepEqual(lock.packages['node_modules/@xterm/addon-fit'].peerDependencies, { '@xterm/xterm': '^5.0.0' })
assert.equal(lock.packages[''].dependencies['@xterm/xterm'], '5.5.0', 'the lock root lists the same pins')
assert.equal(lock.packages[''].dependencies['@xterm/addon-fit'], '0.10.0')

// 3. the licence text ships in public/, names MIT and each package's copyright line, and matches each package's own LICENSE
const licence = read('public/licenses/xterm-LICENSE.txt')
assert.ok(licence.includes('MIT License'), 'the licence file names the MIT licence')
assert.ok(licence.includes('Copyright (c) 2017-2019, The xterm.js authors (https://github.com/xtermjs/xterm.js)'), 'xterm copyright line')
assert.ok(licence.includes('Copyright (c) 2019, The xterm.js authors (https://github.com/xtermjs/xterm.js)'), 'addon-fit copyright line')
assert.ok(licence.includes('Package: @xterm/xterm 5.5.0') && licence.includes('Package: @xterm/addon-fit 0.10.0'), 'each package is named with its version')
if (fs.existsSync(path.join(root, 'node_modules/@xterm/xterm/LICENSE')) && fs.existsSync(path.join(root, 'node_modules/@xterm/addon-fit/LICENSE'))) {
  for (const file of ['node_modules/@xterm/xterm/LICENSE', 'node_modules/@xterm/addon-fit/LICENSE']) {
    assert.ok(licence.includes(read(file).trimEnd()), `${file} is copied verbatim`)
  }
}

// 4. the notices and the release notes name xterm.js and MIT
const notices = read('THIRD-PARTY-NOTICES.md')
assert.ok(notices.includes('xterm.js') && notices.includes('MIT'), 'THIRD-PARTY-NOTICES.md names xterm.js and MIT')
assert.ok(notices.includes('5.5.0') && notices.includes('0.10.0'), 'the notices give the exact versions')
assert.ok(notices.includes('public/licenses/xterm-LICENSE.txt'), 'the notices point to the licence file')
const notes = read('RELEASE_NOTES_0.12.104.md')
assert.ok(notes.includes('xterm.js') && notes.includes('MIT'), 'the release notes name xterm.js and MIT')
assert.ok(notes.includes('xterm-LICENSE.txt'), 'the release notes name the licence file')

// 5. xterm is named only by src/terminal-widget.js, and only through dynamic imports inside a function
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
const mentions = walk(path.join(root, 'src'))
  .filter((file) => /\.(js|vue)$/.test(file) && fs.readFileSync(file, 'utf8').includes('@xterm/'))
  .map((file) => path.relative(root, file).split(path.sep).join('/'))
assert.deepEqual(mentions, ['src/terminal-widget.js'], 'only the widget names @xterm')
const widget = read('src/terminal-widget.js')
assert.doesNotMatch(widget, /^import [^\n]*@xterm\//m, 'the widget has no static import of xterm')
assert.match(widget, /import\('@xterm\/xterm'\)/)
assert.match(widget, /import\('@xterm\/addon-fit'\)/)
assert.match(widget, /import\('@xterm\/xterm\/css\/xterm\.css'\)/)
for (const file of ['src/main.js', 'src/module-loader.js']) {
  assert.doesNotMatch(read(file), /@xterm/, `${file} does not name xterm`)
}

console.log('xterm dependency 0.12.104: PASS')
