import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(path.join(root, 'src', 'resource-site-search-state.js'), 'utf8')
const clearAt = source.indexOf('clearSearch()')
const loadAt = source.indexOf('loadImmediate()')
assert.ok(clearAt >= 0 && loadAt >= 0, 'coordinator must clear and then load')
assert.ok(clearAt < loadAt, 'coordinator must clear site search before immediate load')
console.log('ui 0.12.57-2 client-change search ordering regression: PASS')
