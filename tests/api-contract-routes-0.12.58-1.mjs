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
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/core-http-routes-1.17.31.json', import.meta.url),'utf8'))
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
// 0.12.99: the fixture is the 1.17.2 routes plus the four Core routes added since (custom-fields, revoke-all, session theme,
// tactical-operations), taken from the signed export 1.17.25-0.12.98. Nothing is whitelisted any more.
for (const route of ['/api/tfd/access/sessions/revoke-all/','/api/tfd/session/theme/','/api/tfd/resources/custom-fields/','/api/tfd/tactical-operations/<dynamic>/<dynamic>/']) assert.ok(routes.has(route), `${route} must be in the fixture`)
// 0.12.102: the fixture is 1.17.31, which adds the terminal ticket route (Core 1.17.31, urls.py).
assert.equal(fixture.core_version, '1.17.31')
assert.ok(routes.has('/api/tfd/tactical-websocket/<dynamic>/<dynamic>/tickets/'), 'the terminal ticket route must be in the fixture')
// 0.12.106: Core 1.17.35 adds the module preference routes (framwork/tec_tac/urls.py: module-preferences/<str:module_id>/ and
// module-preferences/<str:module_id>/<str:name>/). The fixture stays the 1.17.31 export; these two are added here, by name.
routes.add('/api/tfd/module-preferences/<dynamic>/')
routes.add('/api/tfd/module-preferences/<dynamic>/<dynamic>/')
// 0.12.116: Core 1.17.50 adds the filter set routes (framwork/tec_tac/urls.py: filter-sets/, filter-sets/fields/, filter-sets/<uuid:set_id>/ and
// filter-values/). Added here by name, like the preference routes.
routes.add('/api/tfd/filter-sets/')
routes.add('/api/tfd/filter-sets/fields/')
routes.add('/api/tfd/filter-sets/<dynamic>/')
routes.add('/api/tfd/filter-values/')
// 0.12.118: Core 1.17.58, 1.17.60 and 1.17.45 routes, in the signed 1.17.65 export (docs/contracts/tec-tac-public-contract   1.17.65-0.12.117.md):
// system/licensing/, modules/v2/jobs/history/, modules/v2/jobs/<uuid:job_id>/log/ and scheduler/event-jobs/. Added here by name, like the
// preference routes; the next fixture refresh takes them. When the export file is on disk (the full workspace) each one is checked in it.
const exportRoutes=['/api/tfd/system/licensing/','/api/tfd/modules/v2/jobs/history/','/api/tfd/modules/v2/jobs/<dynamic>/log/','/api/tfd/scheduler/event-jobs/']
for (const route of exportRoutes) routes.add(route)
const exportFile=new URL('../../../docs/contracts/tec-tac-public-contract   1.17.65-0.12.117.md', import.meta.url)
if (fs.existsSync(exportFile)) {
  const exportText=fs.readFileSync(exportFile,'utf8')
  for (const route of ['/api/tfd/system/licensing/','/api/tfd/modules/v2/jobs/history/','/api/tfd/modules/v2/jobs/<uuid:job_id>/log/','/api/tfd/scheduler/event-jobs/']) {
    assert.ok(exportText.includes('`'+route+'`'), `the 1.17.65 export lists ${route}`)
  }
}
for (const route of exportRoutes) assert.ok(used.map(cleanUsed).includes(route), `src/ uses ${route}`)
// 0.12.119: the two server-maintenance job routes the History tab reads (Core 1.17.16, in the signed 1.17.65 export), added by name.
const maintenanceRoutes=['/api/tfd/system/maintenance/jobs/','/api/tfd/system/maintenance/jobs/<dynamic>/']
for (const route of maintenanceRoutes) routes.add(route)
if (fs.existsSync(exportFile)) {
  const exportText=fs.readFileSync(exportFile,'utf8')
  for (const route of ['/api/tfd/system/maintenance/jobs/','/api/tfd/system/maintenance/jobs/<uuid:job_id>/']) assert.ok(exportText.includes('`'+route+'`'), `the 1.17.65 export lists ${route}`)
}
for (const route of maintenanceRoutes) assert.ok(used.map(cleanUsed).includes(route), `src/ uses ${route}`)
// 0.12.120: the three routes of Core 1.17.67 (docs/system-update-logs.md in Core): system update job list, system update job log and
// maintenance job log. They are not yet in a signed contract export (the newest is 1.17.65-0.12.118); added by name, and the signed
// export row arrives with the next export. The maintenance job list route and the update detail route were already covered above.
const logRoutes=['/api/tfd/system/updates/jobs/','/api/tfd/system/updates/jobs/<dynamic>/log/','/api/tfd/system/maintenance/jobs/<dynamic>/log/']
for (const route of logRoutes) routes.add(route)
for (const route of logRoutes) assert.ok(used.map(cleanUsed).includes(route), `src/ uses ${route}`)

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
