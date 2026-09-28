import fs from 'node:fs'
import assert from 'node:assert/strict'
const api=fs.readFileSync(new URL('../src/api.js', import.meta.url),'utf8')
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/core-http-routes-1.15.162.json', import.meta.url),'utf8'))
const manifest=JSON.parse(fs.readFileSync(new URL('../tec_tac_package.json', import.meta.url),'utf8'))
assert.equal(manifest.requires['tec-tac-framework'], '>=1.15.162,<2.0.0')
const urls=[...api.matchAll(/["'`]\/api\/tfd\/[^"'`]+["'`]/g)].map(m=>m[0].slice(1,-1))
const used=[...new Set(urls)]
function cleanUsed(value){
  let p=value.split('?')[0]
  p=p.replace(/\$\{query\}$/, '')
  p=p.replace(/\$\{[^}]+\}/g,'<dynamic>')
  return p
}
function cleanRoute(value){
  return value.replace(/<[^>]+>/g,'<dynamic>')
}
const routes=new Set(fixture.routes.map(cleanRoute))
const missing=[]
for (const raw of used) {
  const normalized=cleanUsed(raw)
  if (!routes.has(normalized)) missing.push({raw,normalized})
}
assert.deepEqual(missing,[],`api.js contains Tec-Tac URLs absent from Core ${fixture.core_version}: ${JSON.stringify(missing)}`)
assert(routes.has('/api/tfd/system/backups/restore/'))
assert(routes.has('/api/tfd/system/backups/restore/jobs/<dynamic>/'))
console.log('api-contract-routes-0.12.58-1: PASS')
