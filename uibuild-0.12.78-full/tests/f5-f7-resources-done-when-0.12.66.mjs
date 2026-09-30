import assert from 'node:assert/strict'
import fs from 'node:fs'

function response(payload){return{ok:true,status:200,statusText:'OK',headers:{get:()=> 'application/json'},async json(){return payload},async text(){return JSON.stringify(payload)},clone(){return this}}}
globalThis.window={_env_:{PROD_URL:'https://api.example.test'},location:{origin:'https://ui.example.test'},dispatchEvent(){}}
globalThis.localStorage={getItem:key=>key==='access_token'?'token':null,setItem(){},removeItem(){}}
const calls=[]
globalThis.fetch=async(url,options={})=>{
  const u=new URL(url); const body=options.body?JSON.parse(options.body):null; calls.push({path:u.pathname,search:u.search,method:options.method||'GET',body})
  if(u.pathname==='/api/tfd/resources/sites/' && !options.method){ const p=Number(u.searchParams.get('page')||1); return response(p===1?{items:[{id:11,client_id:1},{id:21,client_id:2}],pages:2}:{items:[{id:22,client_id:2}],pages:2}) }
  if(u.pathname==='/api/tfd/resources/sites/11/' && options.method==='DELETE') return response({moved_agents:3})
  if(u.pathname==='/api/tfd/resources/clients/2/' && options.method==='DELETE') return response({moved_agents:4})
  if(u.pathname==='/api/tfd/resources/clients/1/custom-fields/' && !options.method) return response({fields:[{field_id:7,name:'Code',type:'text',value:'OLD'}]})
  if(u.pathname==='/api/tfd/resources/clients/1/custom-fields/' && options.method==='PATCH') return response({fields:body.values})
  throw new Error(`unexpected ${u.pathname}`)
}
const api=await import('../src/api.js')
const wf=await import('../src/resource-feature-workflows.js')
const sites=await wf.loadRelocationSites({listResourceSites:api.listResourceSites,excludeClientId:1,pageSize:100})
assert.deepEqual(sites.map(x=>x.id),[21,22])
let result=await wf.deleteResourceWorkflow({type:'site',row:{id:11},destination_site_id:'21'},{deleteResourceClient:api.deleteResourceClient,deleteResourceSite:api.deleteResourceSite})
assert.equal(result.moved,3)
result=await wf.deleteResourceWorkflow({type:'client',row:{id:2},destination_site_id:'22'},{deleteResourceClient:api.deleteResourceClient,deleteResourceSite:api.deleteResourceSite})
assert.equal(result.moved,4)
const payload=await api.getResourceCustomFields('client',1); const fields=wf.editableCustomFieldRows(payload); fields[0].value='NEW'
await wf.saveCustomFieldsWorkflow({resourceType:'client',row:{id:1},fields},{updateResourceCustomFields:api.updateResourceCustomFields})
assert.deepEqual(calls.find(x=>x.path==='/api/tfd/resources/clients/1/custom-fields/'&&x.method==='PATCH').body,{values:[{field_id:7,value:'NEW'}]})
const view=fs.readFileSync(new URL('../src/views/ResourcesView.vue',import.meta.url),'utf8')
assert.match(view,/deleteResourceWorkflow\(draft,/)
assert.match(view,/saveCustomFieldsWorkflow\(draft,/)
assert.match(view,/loadRelocationSites\(/)
console.log('F5/F6/F7 Resources done-when 0.12.66: PASS')
