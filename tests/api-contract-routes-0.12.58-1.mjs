import fs from 'node:fs'
import assert from 'node:assert/strict'
// 0.12.83: every .js and .vue file under src/ is scanned, not just api.js.
const srcRoot=new URL('../src/', import.meta.url)
function walk(dir){
  const out=[]
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full=new URL(entry.name+(entry.isDirectory()?'/':''), dir)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(js|vue)$/.test(entry.name)) out.push(full)
  }
  return out
}
const scanned=walk(srcRoot).map(url=>({name:url.pathname.split('/src/')[1], text:fs.readFileSync(url,'utf8')}))
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/core-http-routes-1.17.2.json', import.meta.url),'utf8'))
const manifest=JSON.parse(fs.readFileSync(new URL('../tec_tac_package.json', import.meta.url),'utf8'))
const frameworkRange=manifest.requires['tec-tac-framework']
const minMatch=/^>=(\d+)\.(\d+)\.(\d+),<2\.0\.0$/.exec(frameworkRange)
assert.ok(minMatch, `unexpected framework range: ${frameworkRange}`)
const minVersion=minMatch.slice(1).map(Number)
assert.ok(minVersion[0]>1 || (minVersion[0]===1 && (minVersion[1]>15 || (minVersion[1]===15 && minVersion[2]>=162))), `framework minimum regressed below 1.15.162: ${frameworkRange}`)
const found=[]
for (const file of scanned) {
  for (const m of file.text.matchAll(/["'`]\/api\/tfd\/[^"'`]+["'`]/g)) found.push({file:file.name, url:m[0].slice(1,-1)})
}
const used=[...new Set(found.map(item=>item.url))]
const filesWithRoutes=new Set(found.map(item=>item.file))
// The files the 0.12.82 review found must stay in the scan.
for (const required of ['api.js','update-source.js','runtime-settings.js']) {
  assert.ok(filesWithRoutes.has(required), `${required} must be scanned for /api/tfd/ literals`)
}
function cleanUsed(value){
  let p=value.split('?')[0]
  // A query string appended after the path is not part of the route.
  p=p.replace(/\$\{(query|q|suffix)\}$/, '')
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
assert.deepEqual(missing,[],`src/ contains Tec-Tac URLs absent from Core ${fixture.core_version}: ${JSON.stringify(missing)}`)
// Self-check: a mistyped literal run through the same normaliser must be reported missing.
assert.equal(routes.has(cleanUsed('/api/tfd/system/update-sources/')), false, 'a mistyped route must be reported missing')
assert.equal(routes.has(cleanUsed('/api/tfd/system/update-source/')), true)
assert.equal(cleanUsed('/api/tfd/scheduler/schedules/${q}'), '/api/tfd/scheduler/schedules/')
assert(routes.has('/api/tfd/system/backups/restore/'))
assert(routes.has('/api/tfd/system/backups/restore/jobs/<dynamic>/'))
console.log('api-contract-routes-0.12.58-1: PASS')
