import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'src', 'views', 'ResourcesView.vue')
const source = fs.readFileSync(file, 'utf8')
const script = source.match(/<script setup>([\s\S]*?)<\/script>/)?.[1] || ''
const imports = [...script.matchAll(/import\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g)]
const resourceStateImport = imports.find((m) => m[2] === '../resource-site-search-state')
assert.ok(resourceStateImport, 'ResourcesView.vue must import ../resource-site-search-state')
const names = resourceStateImport[1].split(',').map((v) => v.trim()).filter(Boolean)
assert.ok(names.includes('createResourceSiteSearchCoordinator'), 'ResourcesView.vue must import createResourceSiteSearchCoordinator')
assert.equal(names.includes('clientChangeSiteSearchState'), false, 'obsolete clientChangeSiteSearchState import must be removed')
assert.equal(names.includes('consumeSiteSearchSuppression'), false, 'obsolete consumeSiteSearchSuppression import must be removed')
assert.match(script, /createResourceSiteSearchCoordinator\s*\(/, 'ResourcesView.vue must use createResourceSiteSearchCoordinator')
assert.match(script, /clearSearch:\s*\(\)\s*=>\s*\{\s*siteSearch\.value\s*=\s*''\s*\}/, 'ResourcesView.vue must give the coordinator the real siteSearch clearing callback')
assert.match(script, /watch\(selectedClientId,[\s\S]*?siteSearchCoordinator\.clientChanged\(siteSearch\.value\)/, 'selectedClientId watcher must delegate client changes to the coordinator')
console.log('ui 0.12.57-1 ResourcesView import regression: PASS')
